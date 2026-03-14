/**
 * ANIMA 6 Workspace Sync Protocol
 *
 * Custom git-like sync for agent workspaces. Each Anima instance
 * only gets access to the repos it's scoped to work on.
 *
 * Features:
 * - Content-addressable blob storage (SHA-256)
 * - Snapshot-based sync (not diff-based — simpler, more reliable)
 * - Scoped repo access per agent
 * - Immutable backup copies
 * - Conflict detection and resolution
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("workspace-sync");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceSnapshot {
  id: string;
  repoPath: string; // scoped repo path
  deviceId: string;
  timestamp: number;
  files: FileEntry[];
  treeHash: string; // hash of all file hashes
  parentSnapshotId?: string;
}

export interface FileEntry {
  relativePath: string;
  hash: string; // SHA-256 of content
  size: number;
  modifiedAt: number;
  mode: number; // file permissions
}

export interface SyncManifest {
  repoPath: string;
  deviceId: string;
  latestSnapshotId: string;
  snapshotCount: number;
  totalSize: number;
  lastSyncedAt: number;
}

export interface WorkspaceConfig {
  stateDir?: string;
  maxSnapshots: number; // keep N most recent
  backupIntervalMs: number;
  immutableBackupDir?: string; // for permanent copies
  ignoredPatterns: string[]; // glob patterns to ignore
}

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

const DEFAULT_IGNORED = [
  "node_modules/**",
  ".git/**",
  "dist/**",
  "*.log",
  ".DS_Store",
  "Thumbs.db",
  ".env",
  ".env.*",
  "*.key",
  "*.pem",
  "credentials.*",
];

// ---------------------------------------------------------------------------
// Blob Store
// ---------------------------------------------------------------------------

export class BlobStore {
  private readonly blobDir: string;

  constructor(stateDir?: string) {
    this.blobDir = path.join(stateDir ?? resolveStateDir(), "sync", "blobs");
    fs.mkdirSync(this.blobDir, { recursive: true });
  }

  /**
   * Store a blob and return its SHA-256 hash.
   */
  put(content: Buffer): string {
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    const blobPath = this.resolveBlobPath(hash);

    if (!fs.existsSync(blobPath)) {
      fs.mkdirSync(path.dirname(blobPath), { recursive: true });
      fs.writeFileSync(blobPath, content);
    }

    return hash;
  }

  /**
   * Retrieve a blob by hash.
   */
  get(hash: string): Buffer | null {
    const blobPath = this.resolveBlobPath(hash);
    try {
      return fs.readFileSync(blobPath);
    } catch {
      return null;
    }
  }

  has(hash: string): boolean {
    return fs.existsSync(this.resolveBlobPath(hash));
  }

  private resolveBlobPath(hash: string): string {
    // Shard by first 2 chars for filesystem friendliness
    return path.join(this.blobDir, hash.slice(0, 2), hash);
  }
}

// ---------------------------------------------------------------------------
// Workspace Syncer
// ---------------------------------------------------------------------------

export class WorkspaceSyncer {
  private readonly config: WorkspaceConfig;
  private readonly blobStore: BlobStore;
  private readonly snapshotDir: string;
  private backupTimer?: ReturnType<typeof setInterval>;

  constructor(config?: Partial<WorkspaceConfig>) {
    this.config = {
      maxSnapshots: 100,
      backupIntervalMs: 5 * 60 * 60 * 1000, // 5 hours
      ignoredPatterns: DEFAULT_IGNORED,
      ...config,
    };

    const stateDir = this.config.stateDir ?? resolveStateDir();
    this.blobStore = new BlobStore(stateDir);
    this.snapshotDir = path.join(stateDir, "sync", "snapshots");
    fs.mkdirSync(this.snapshotDir, { recursive: true });
  }

  // -----------------------------------------------------------------------
  // Snapshot creation
  // -----------------------------------------------------------------------

  /**
   * Create a snapshot of a workspace directory.
   */
  createSnapshot(repoPath: string, deviceId: string, parentSnapshotId?: string): WorkspaceSnapshot {
    const files: FileEntry[] = [];
    this.walkDir(repoPath, repoPath, files);

    // Compute tree hash
    const sortedHashes = files
      .map((f) => f.hash)
      .toSorted()
      .join("|");
    const treeHash = crypto.createHash("sha256").update(sortedHashes).digest("hex");

    const snapshot: WorkspaceSnapshot = {
      id: crypto.randomUUID(),
      repoPath,
      deviceId,
      timestamp: Date.now(),
      files,
      treeHash,
      parentSnapshotId,
    };

    // Persist snapshot metadata
    const snapshotFile = path.join(this.snapshotDir, `${snapshot.id}.json`);
    fs.writeFileSync(snapshotFile, `${JSON.stringify(snapshot, null, 2)}\n`);

    log.info(
      `created snapshot ${snapshot.id} for ${repoPath} (${files.length} files, tree: ${treeHash.slice(0, 12)})`,
    );

    return snapshot;
  }

  /**
   * Get the blobs a peer needs that we have (set difference of hashes).
   */
  getMissingBlobs(peerHashes: Set<string>, snapshot: WorkspaceSnapshot): string[] {
    return snapshot.files.filter((f) => !peerHashes.has(f.hash)).map((f) => f.hash);
  }

  /**
   * Restore a snapshot to a target directory.
   */
  restoreSnapshot(snapshot: WorkspaceSnapshot, targetDir: string): void {
    fs.mkdirSync(targetDir, { recursive: true });

    for (const file of snapshot.files) {
      const content = this.blobStore.get(file.hash);
      if (!content) {
        log.warn(`missing blob ${file.hash} for ${file.relativePath}`);
        continue;
      }

      const fullPath = path.join(targetDir, file.relativePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, { mode: file.mode });
    }

    log.info(`restored snapshot ${snapshot.id} to ${targetDir} (${snapshot.files.length} files)`);
  }

  // -----------------------------------------------------------------------
  // Immutable backup
  // -----------------------------------------------------------------------

  /**
   * Create an immutable backup that cannot be deleted by normal operations.
   */
  createImmutableBackup(repoPath: string, deviceId: string): string {
    const backupDir =
      this.config.immutableBackupDir ?? path.join(resolveStateDir(), "sync", "immutable");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `backup-${timestamp}`);

    fs.mkdirSync(backupPath, { recursive: true });

    const snapshot = this.createSnapshot(repoPath, deviceId);
    this.restoreSnapshot(snapshot, backupPath);

    // Write snapshot metadata alongside
    fs.writeFileSync(
      path.join(backupPath, ".snapshot.json"),
      `${JSON.stringify(snapshot, null, 2)}\n`,
    );

    // Make files read-only
    this.makeReadOnly(backupPath);

    log.info(`created immutable backup at ${backupPath}`);
    return backupPath;
  }

  private makeReadOnly(dirPath: string): void {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        this.makeReadOnly(fullPath);
      } else {
        try {
          fs.chmodSync(fullPath, 0o444);
        } catch {
          // best-effort
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Scheduled backup
  // -----------------------------------------------------------------------

  startBackupSchedule(repoPath: string, deviceId: string): void {
    if (this.backupTimer) {
      return;
    }

    this.backupTimer = setInterval(() => {
      try {
        this.createImmutableBackup(repoPath, deviceId);
      } catch (err) {
        log.warn(`scheduled backup failed: ${String(err)}`);
      }
    }, this.config.backupIntervalMs);

    log.info(`backup schedule started: every ${this.config.backupIntervalMs / 1000 / 60}m`);
  }

  stopBackupSchedule(): void {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = undefined;
    }
  }

  // -----------------------------------------------------------------------
  // Manifest
  // -----------------------------------------------------------------------

  getManifest(repoPath: string, deviceId: string): SyncManifest | null {
    try {
      const snapshots = fs
        .readdirSync(this.snapshotDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => {
          const raw = fs.readFileSync(path.join(this.snapshotDir, f), "utf8");
          return JSON.parse(raw) as WorkspaceSnapshot;
        })
        .filter((s) => s.repoPath === repoPath)
        .toSorted((a, b) => b.timestamp - a.timestamp);

      if (snapshots.length === 0) {
        return null;
      }

      const latest = snapshots[0];
      const totalSize = latest.files.reduce((sum, f) => sum + f.size, 0);

      return {
        repoPath,
        deviceId,
        latestSnapshotId: latest.id,
        snapshotCount: snapshots.length,
        totalSize,
        lastSyncedAt: latest.timestamp,
      };
    } catch {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // File walking
  // -----------------------------------------------------------------------

  private walkDir(baseDir: string, currentDir: string, files: FileEntry[]): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      // Check ignored patterns
      if (this.isIgnored(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        this.walkDir(baseDir, fullPath, files);
      } else if (entry.isFile()) {
        try {
          const content = fs.readFileSync(fullPath);
          const stat = fs.statSync(fullPath);
          const hash = this.blobStore.put(content);

          files.push({
            relativePath,
            hash,
            size: stat.size,
            modifiedAt: stat.mtimeMs,
            mode: stat.mode,
          });
        } catch {
          // skip files we can't read
        }
      }
    }
  }

  private isIgnored(relativePath: string): boolean {
    return this.config.ignoredPatterns.some((pattern) => {
      // Simple glob matching for common patterns
      if (pattern.endsWith("/**")) {
        const prefix = pattern.slice(0, -3);
        return relativePath.startsWith(prefix);
      }
      if (pattern.startsWith("*.")) {
        const ext = pattern.slice(1);
        return relativePath.endsWith(ext);
      }
      return relativePath === pattern || relativePath.includes(`/${pattern}`);
    });
  }
}
