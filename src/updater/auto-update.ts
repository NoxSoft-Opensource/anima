/**
 * Auto-Updater -- checks npm for new versions and updates @noxsoft/anima.
 *
 * Runs on a configurable interval (default: every 6 hours).
 * Uses the npm registry HTTP API (no CLI dependency for checking)
 * to detect new versions, then installs via `npm install -g` and
 * optionally restarts by spawning the new binary.
 *
 * Supports 'stable' (latest) and 'beta' dist-tag channels.
 */

import { execFile, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "@noxsoft/anima";
const REGISTRY_BASE = "https://registry.npmjs.org";

export interface AutoUpdateConfig {
  /** Whether auto-update checking is enabled. Default: true */
  enabled: boolean;
  /** How often to check for updates (hours). Default: 6 */
  checkIntervalHours: number;
  /** Whether to automatically install and restart on update. Default: false */
  autoRestart: boolean;
  /** Which npm dist-tag to follow. Default: 'stable' */
  channel: "stable" | "beta";
}

export const DEFAULT_AUTO_UPDATE_CONFIG: AutoUpdateConfig = {
  enabled: true,
  checkIntervalHours: 6,
  autoRestart: false,
  channel: "stable",
};

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  channel: string;
  timestamp: string;
}

export class AnimaAutoUpdater extends EventEmitter {
  private config: AutoUpdateConfig;
  private currentVersion: string;
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private logFile: string;
  private checking: boolean = false;
  private lastCheckTime: Date | null = null;
  private lastUpdateInfo: UpdateInfo | null = null;

  constructor(config: AutoUpdateConfig, dataDir: string) {
    super();
    this.config = config;
    this.currentVersion = this.readCurrentVersion();
    this.logFile = path.join(dataDir, "updates.log");

    fs.mkdirSync(dataDir, { recursive: true });
  }

  /** Start the periodic update check loop. */
  start(): void {
    if (!this.config.enabled) {
      return;
    }

    // Check immediately on start
    void this.check();

    // Then on interval
    const intervalMs = this.config.checkIntervalHours * 60 * 60 * 1000;
    this.checkTimer = setInterval(() => void this.check(), intervalMs);
  }

  /** Stop the update check loop. */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /** Get the current installed version. */
  getVersion(): string {
    return this.currentVersion;
  }

  /** Get the last check time. */
  getLastCheckTime(): Date | null {
    return this.lastCheckTime;
  }

  /** Get the last update info (if an update was found). */
  getLastUpdateInfo(): UpdateInfo | null {
    return this.lastUpdateInfo;
  }

  /** Get the current config. */
  getConfig(): AutoUpdateConfig {
    return { ...this.config };
  }

  /** Manually trigger an update check. Returns info if update found, null otherwise. */
  async check(): Promise<UpdateInfo | null> {
    if (this.checking) {
      return null;
    }
    this.checking = true;

    try {
      const tag = this.config.channel === "beta" ? "beta" : "latest";
      const latestVersion = await this.fetchLatestVersion(tag);
      this.lastCheckTime = new Date();

      if (!latestVersion) {
        return null;
      }

      if (this.isNewer(latestVersion, this.currentVersion)) {
        const info: UpdateInfo = {
          currentVersion: this.currentVersion,
          latestVersion,
          channel: this.config.channel,
          timestamp: new Date().toISOString(),
        };

        this.lastUpdateInfo = info;
        this.emit("update-available", info);
        this.log(`Update available: ${this.currentVersion} -> ${latestVersion}`);

        if (this.config.autoRestart) {
          await this.installUpdate(latestVersion);
          this.log(`Update installed: ${latestVersion}`);
          this.emit("update-installed", info);

          // Spawn new process and exit current one
          this.restartProcess();
        }

        return info;
      }

      this.lastUpdateInfo = null;
      return null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`Update check failed: ${msg}`);
      this.emit("update-error", error);
      return null;
    } finally {
      this.checking = false;
    }
  }

  /**
   * Install the latest version and restart (for manual `anima update` / `:update install`).
   * Returns the UpdateInfo if an update was installed, null if already current.
   */
  async installAndRestart(): Promise<UpdateInfo | null> {
    const tag = this.config.channel === "beta" ? "beta" : "latest";
    const latestVersion = await this.fetchLatestVersion(tag);

    if (!latestVersion) {
      this.log("No version found on npm -- package may not be published yet.");
      return null;
    }

    if (!this.isNewer(latestVersion, this.currentVersion)) {
      return null;
    }

    const info: UpdateInfo = {
      currentVersion: this.currentVersion,
      latestVersion,
      channel: this.config.channel,
      timestamp: new Date().toISOString(),
    };

    await this.installUpdate(latestVersion);
    this.log(`Update installed: ${latestVersion}`);
    this.emit("update-installed", info);

    return info;
  }

  /**
   * Fetch the latest version from the npm registry HTTP API.
   * Uses fetch -- no npm CLI needed for checking.
   *
   * For the 'stable' channel, fetches the 'latest' dist-tag.
   * For the 'beta' channel, fetches the 'beta' dist-tag.
   */
  private async fetchLatestVersion(tag: string): Promise<string | null> {
    try {
      const url = `${REGISTRY_BASE}/${encodeURIComponent(PACKAGE_NAME)}/${tag}`;
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        // 404 = package or tag doesn't exist yet -- not an error
        if (response.status === 404) {
          return null;
        }
        return null;
      }

      const data = (await response.json()) as { version?: string };
      return data.version ?? null;
    } catch {
      // Network error, timeout, etc. -- not fatal
      return null;
    }
  }

  /** Install the specified version via npm. */
  private installUpdate(version: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Determine install location -- if running from node_modules,
      // update in the parent project. If global, update globally.
      const thisDir = path.dirname(fileURLToPath(import.meta.url));
      const isGlobal =
        thisDir.includes("/lib/node_modules/") || thisDir.includes("\\node_modules\\");

      const args = isGlobal
        ? ["install", "-g", `${PACKAGE_NAME}@${version}`]
        : ["install", `${PACKAGE_NAME}@${version}`];

      // Find the project root (where package.json lives)
      const cwd = isGlobal ? undefined : (this.findProjectRoot(thisDir) ?? undefined);

      execFile("npm", args, { timeout: 120_000, cwd }, (error) => {
        if (error) {
          reject(new Error(`Failed to install update: ${error.message}`));
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Restart the process by spawning the anima binary.
   * This launches a new process and exits the current one.
   */
  private restartProcess(): void {
    this.log("Restarting with updated binary...");

    // Find the anima binary path
    const binary = process.argv[1];
    if (!binary) {
      this.log("Cannot determine binary path for restart -- manual restart required.");
      return;
    }

    // Use process.argv to re-launch with the same arguments
    const args = process.argv.slice(1);

    try {
      // spawn with detached + unref launches a new process that survives this one
      const child = spawn(process.execPath, args, {
        detached: true,
        stdio: "inherit",
      });
      child.unref();

      // Exit the current process so the new one takes over
      process.exit(0);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`Restart failed: ${msg} -- manual restart required.`);
    }
  }

  /** Read the current package version from package.json. */
  private readCurrentVersion(): string {
    try {
      const thisDir = path.dirname(fileURLToPath(import.meta.url));
      // Walk up to find package.json
      let dir = thisDir;
      for (let i = 0; i < 5; i++) {
        const pkgPath = path.join(dir, "package.json");
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
            name?: string;
            version?: string;
          };
          if (pkg.name === PACKAGE_NAME) {
            return pkg.version ?? "0.0.0";
          }
        }
        dir = path.dirname(dir);
      }
    } catch {
      // Fall through
    }
    return "0.0.0";
  }

  /** Compare semver strings. Returns true if `a` is newer than `b`. */
  private isNewer(a: string, b: string): boolean {
    const parse = (v: string) =>
      v
        .replace(/[^0-9.]/g, "")
        .split(".")
        .map(Number);
    const [aMajor = 0, aMinor = 0, aPatch = 0] = parse(a);
    const [bMajor = 0, bMinor = 0, bPatch = 0] = parse(b);

    if (aMajor !== bMajor) {
      return aMajor > bMajor;
    }
    if (aMinor !== bMinor) {
      return aMinor > bMinor;
    }
    return aPatch > bPatch;
  }

  /** Find the nearest ancestor directory containing package.json. */
  private findProjectRoot(startDir: string): string | null {
    let dir = startDir;
    for (let i = 0; i < 10; i++) {
      const pkgPath = path.join(dir, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { name?: string };
        // Don't return this package's own directory -- find the parent project
        if (pkg.name !== PACKAGE_NAME) {
          return dir;
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
    return null;
  }

  /** Append a log entry to the updates log file. */
  private log(message: string): void {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    try {
      fs.appendFileSync(this.logFile, line);
    } catch {
      // Non-fatal
    }
  }
}

/**
 * Load auto-update config from ~/.anima/anima.json.
 * Falls back to defaults if the file doesn't exist or the key is missing.
 */
export function loadAutoUpdateConfig(): AutoUpdateConfig {
  const configPath = path.join(
    process.env.HOME || process.env.USERPROFILE || ".",
    ".anima",
    "anima.json",
  );

  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw) as { autoUpdate?: Partial<AutoUpdateConfig> };

      if (parsed.autoUpdate) {
        return {
          enabled: parsed.autoUpdate.enabled ?? DEFAULT_AUTO_UPDATE_CONFIG.enabled,
          checkIntervalHours:
            parsed.autoUpdate.checkIntervalHours ?? DEFAULT_AUTO_UPDATE_CONFIG.checkIntervalHours,
          autoRestart: parsed.autoUpdate.autoRestart ?? DEFAULT_AUTO_UPDATE_CONFIG.autoRestart,
          channel: parsed.autoUpdate.channel === "beta" ? "beta" : "stable",
        };
      }
    }
  } catch {
    // Config file doesn't exist or is malformed -- use defaults
  }

  return { ...DEFAULT_AUTO_UPDATE_CONFIG };
}
