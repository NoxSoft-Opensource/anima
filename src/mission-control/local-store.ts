import type { Dirent } from "node:fs";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { resolveStateDir } from "../config/paths.js";
import { readJsonFile, writeJsonAtomic } from "../infra/pairing-files.js";

const execFileAsync = promisify(execFile);

export type MissionWorkingMode = "read" | "write";

export type MissionRepoState = {
  provider?: "github" | "gitlab" | "custom";
  url?: string;
  branch?: string;
  preferredTransport?: "ssh" | "https";
  remoteName?: string;
  connectedAt?: number;
  remoteConfigured?: boolean;
  lastError?: string;
};

export type MissionSpeechState = {
  recognition: "browser" | "manual";
  autoSpeak: boolean;
  continuous: boolean;
  lang: string;
  voiceName?: string;
  rate: number;
  pitch: number;
};

export type MissionControlState = {
  version: 1;
  workingMode: MissionWorkingMode;
  repo: MissionRepoState;
  speech: MissionSpeechState;
};

export type MissionControlStatePatch = {
  workingMode?: MissionWorkingMode;
  repo?: Partial<MissionRepoState>;
  speech?: Partial<MissionSpeechState>;
};

export type MissionControlFile = {
  id: string;
  fileName: string;
  title: string;
  path: string;
  content: string;
  size: number;
  updatedAt: number | null;
};

export type MissionInnerWorldEntry = {
  id: string;
  title: string;
  path: string;
  content: string;
  updatedAt: number | null;
};

export type MissionImportantHistoryEntry = {
  id: string;
  archiveId: string;
  relativePath: string;
  path: string;
  content: string;
  updatedAt: number | null;
};

export type MissionControlSnapshot = {
  directory: string;
  statePath: string;
  state: MissionControlState;
  files: MissionControlFile[];
  innerWorld: MissionInnerWorldEntry[];
  importantHistory: MissionImportantHistoryEntry[];
};

type DefaultMissionFile = {
  fileName: string;
  title: string;
  content: string;
};

const DEFAULT_MISSION_FILES: DefaultMissionFile[] = [
  {
    fileName: "README.md",
    title: "Overview",
    content: `# Mission Control

ANIMA manages continuity here using only local files.

## Purpose

- Keep durable context outside the chat stream.
- Store directives the agent can follow between sessions.
- Track orchestration, open loops, and repo continuity.
- Keep contact loops healthy, including periodic check-ins with NoxSoft channels when configured.

## Operator flow

1. Create a private GitHub or GitLab repo for ANIMA continuity.
2. Prefer an SSH remote URL and attach it in Settings or Mission Control.
3. Keep directives current in \`self-directives.md\`.
4. Use \`orchestration-board.md\` for active work and review cadence.
`,
  },
  {
    fileName: "self-directives.md",
    title: "Self Directives",
    content: `# Self Directives

- Protect continuity across restarts.
- Keep local context files current before context becomes stale.
- Use mission control files as the durable source of truth for long-running work.
- Keep heartbeat useful, short, and action-oriented.
- When NoxSoft chat tools are available, check in with Nox here and there instead of letting context drift silently.
`,
  },
  {
    fileName: "orchestration-board.md",
    title: "Orchestration Board",
    content: `# Orchestration Board

## Active

- Stabilize dashboard, gateway, and daemon handoff.
- Keep mission control and memory readable from the web UI.

## Next

- Connect ANIMA continuity repo.
- Review open directives and heartbeat behavior.

## Risks

- Broken visibility loops between runtime state and UI.
- Context drift if mission files are not updated after important changes.
`,
  },
  {
    fileName: "inbox.md",
    title: "Inbox",
    content: `# Inbox

- Capture new operator requests here when they should persist beyond the current chat.
`,
  },
  {
    fileName: "outbox.md",
    title: "Outbox",
    content: `# Outbox

- Capture durable responses, commitments, and follow-ups here.
`,
  },
  {
    fileName: "context-map.md",
    title: "Context Map",
    content: `# Context Map

## Core state

- \`~/.anima/soul/\`
- \`~/.anima/memory/\`
- \`~/.anima/mission-control/\`
- \`~/.anima/important-history/\`

## Repo continuity

- Attach a private SSH remote for \`~/.anima/workspace\`.
- Push durable identity/context changes after major edits.
`,
  },
];

const DEFAULT_STATE: MissionControlState = {
  version: 1,
  workingMode: "write",
  repo: {
    preferredTransport: "ssh",
    remoteName: "origin",
  },
  speech: {
    recognition: "browser",
    autoSpeak: false,
    continuous: true,
    lang: "en-US",
    rate: 1,
    pitch: 1,
  },
};

function mergeState(
  current: MissionControlState,
  patch: MissionControlStatePatch,
): MissionControlState {
  return {
    version: 1,
    workingMode: patch.workingMode ?? current.workingMode,
    repo: {
      ...current.repo,
      ...patch.repo,
    },
    speech: {
      ...current.speech,
      ...patch.speech,
    },
  };
}

function getMissionFileTitle(fileName: string): string {
  const known = DEFAULT_MISSION_FILES.find((entry) => entry.fileName === fileName);
  if (known) {
    return known.title;
  }
  return fileName.replace(/[-_]/g, " ").replace(/\.md$/i, "");
}

function isSafeMissionFileName(fileName: string): boolean {
  const trimmed = fileName.trim();
  if (!trimmed || trimmed !== path.basename(trimmed)) {
    return false;
  }
  if (trimmed.includes("..")) {
    return false;
  }
  return /^[a-zA-Z0-9._-]+$/.test(trimmed);
}

async function readTextFileIfExists(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function statFileIfExists(
  filePath: string,
): Promise<{ size: number; mtimeMs: number } | null> {
  try {
    const stat = await fs.stat(filePath);
    return { size: stat.size, mtimeMs: stat.mtimeMs };
  } catch {
    return null;
  }
}

async function ensureFileIfMissing(filePath: string, content: string): Promise<void> {
  const existing = await statFileIfExists(filePath);
  if (existing) {
    return;
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

function missionDirectory(stateDir = resolveStateDir()): string {
  return path.join(stateDir, "mission-control");
}

function missionStatePath(stateDir = resolveStateDir()): string {
  return path.join(missionDirectory(stateDir), "state.json");
}

function workspaceDirectory(stateDir = resolveStateDir()): string {
  return path.join(stateDir, "workspace");
}

function normalizeRepoProvider(url: string | undefined): MissionRepoState["provider"] {
  const lower = url?.trim().toLowerCase() ?? "";
  if (!lower) {
    return undefined;
  }
  if (lower.includes("gitlab")) {
    return "gitlab";
  }
  if (lower.includes("github")) {
    return "github";
  }
  return "custom";
}

async function resolveWorkspaceRemote(workspaceDir: string): Promise<MissionRepoState> {
  const gitDir = path.join(workspaceDir, ".git");
  const configPath = path.join(gitDir, "config");
  const headPath = path.join(gitDir, "HEAD");
  const configRaw = await readTextFileIfExists(configPath);
  const headRaw = await readTextFileIfExists(headPath);
  const remoteMatch = configRaw.match(/\[remote\s+"([^"]+)"\][\s\S]*?url\s*=\s*(.+)/);
  const branchMatch = headRaw.match(/refs\/heads\/([^\n\r]+)/);
  const remoteName = remoteMatch?.[1]?.trim() || "origin";
  const url = remoteMatch?.[2]?.trim();
  return {
    remoteName,
    url,
    branch: branchMatch?.[1]?.trim(),
    provider: normalizeRepoProvider(url),
    remoteConfigured: Boolean(url),
  };
}

async function latestFileFromDirectory(
  directory: string,
  opts?: { allowJson?: boolean; maxFiles?: number },
): Promise<MissionInnerWorldEntry | null> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return null;
  }
  const candidates = entries
    .filter((entry) => entry.isFile())
    .filter((entry) =>
      opts?.allowJson ? /\.(md|txt|json)$/i.test(entry.name) : /\.(md|txt)$/i.test(entry.name),
    )
    .slice(0, opts?.maxFiles ?? 32);
  if (candidates.length === 0) {
    return null;
  }
  const rows = await Promise.all(
    candidates.map(async (entry) => {
      const absolutePath = path.join(directory, entry.name);
      const stat = await statFileIfExists(absolutePath);
      return stat ? { fileName: entry.name, path: absolutePath, stat } : null;
    }),
  );
  const newest = rows
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .toSorted((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0];
  if (!newest) {
    return null;
  }
  return {
    id: newest.fileName,
    title: newest.fileName,
    path: newest.path,
    content: await readTextFileIfExists(newest.path),
    updatedAt: newest.stat.mtimeMs,
  };
}

async function listMissionFiles(directory: string): Promise<MissionControlFile[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const knownTitles = new Map(DEFAULT_MISSION_FILES.map((entry) => [entry.fileName, entry.title]));
  const rows = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .filter((entry) => /\.(md|txt|json)$/i.test(entry.name))
      .map(async (entry) => {
        const absolutePath = path.join(directory, entry.name);
        const stat = await statFileIfExists(absolutePath);
        return {
          id: entry.name,
          fileName: entry.name,
          title: knownTitles.get(entry.name) ?? getMissionFileTitle(entry.name),
          path: absolutePath,
          content: await readTextFileIfExists(absolutePath),
          size: stat?.size ?? 0,
          updatedAt: stat?.mtimeMs ?? null,
        } satisfies MissionControlFile;
      }),
  );

  const defaultOrder = new Map(
    DEFAULT_MISSION_FILES.map((entry, index) => [entry.fileName, index]),
  );
  return [...rows].toSorted((a, b) => {
    const aOrder = defaultOrder.get(a.fileName);
    const bOrder = defaultOrder.get(b.fileName);
    if (aOrder != null && bOrder != null) {
      return aOrder - bOrder;
    }
    if (aOrder != null) {
      return -1;
    }
    if (bOrder != null) {
      return 1;
    }
    const updatedDiff = (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    if (updatedDiff !== 0) {
      return updatedDiff;
    }
    return a.fileName.localeCompare(b.fileName);
  });
}

async function listImportantHistoryEntries(
  stateDir: string,
  opts?: { archiveLimit?: number; entryLimit?: number },
): Promise<MissionImportantHistoryEntry[]> {
  const historyDir = path.join(stateDir, "important-history");
  let archiveEntries: Dirent[];
  try {
    archiveEntries = await fs.readdir(historyDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const archives = archiveEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted((a, b) => b.localeCompare(a))
    .slice(0, opts?.archiveLimit ?? 4);

  const rows: MissionImportantHistoryEntry[] = [];
  for (const archiveId of archives) {
    const archiveRoot = path.join(historyDir, archiveId);
    const stack = [archiveRoot];
    while (stack.length > 0) {
      const currentDir = stack.pop();
      if (!currentDir) {
        continue;
      }
      const entries = await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (entry.name === ".DS_Store") {
          continue;
        }
        const absolutePath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          stack.push(absolutePath);
          continue;
        }
        if (!entry.isFile() || !/\.(md|txt|json)$/i.test(entry.name)) {
          continue;
        }
        const stat = await statFileIfExists(absolutePath);
        rows.push({
          id: `${archiveId}:${path.relative(archiveRoot, absolutePath)}`,
          archiveId,
          relativePath: path.relative(archiveRoot, absolutePath),
          path: absolutePath,
          content: await readTextFileIfExists(absolutePath),
          updatedAt: stat?.mtimeMs ?? null,
        });
      }
    }
  }

  return rows
    .toSorted((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, opts?.entryLimit ?? 24);
}

export async function ensureMissionControlScaffold(stateDir = resolveStateDir()): Promise<string> {
  const dir = missionDirectory(stateDir);
  await fs.mkdir(dir, { recursive: true });
  for (const entry of DEFAULT_MISSION_FILES) {
    await ensureFileIfMissing(path.join(dir, entry.fileName), entry.content);
  }
  const statePath = missionStatePath(stateDir);
  const existing = await readJsonFile<MissionControlState>(statePath);
  if (!existing) {
    await writeJsonAtomic(statePath, DEFAULT_STATE);
  }
  return dir;
}

export async function readMissionControlState(
  stateDir = resolveStateDir(),
): Promise<MissionControlState> {
  await ensureMissionControlScaffold(stateDir);
  const statePath = missionStatePath(stateDir);
  const stored = await readJsonFile<Partial<MissionControlState>>(statePath);
  return mergeState(DEFAULT_STATE, {
    ...stored,
    repo: {
      ...DEFAULT_STATE.repo,
      ...stored?.repo,
    },
    speech: {
      ...DEFAULT_STATE.speech,
      ...stored?.speech,
    },
  });
}

export async function patchMissionControlState(
  patch: MissionControlStatePatch,
  stateDir = resolveStateDir(),
): Promise<MissionControlState> {
  const current = await readMissionControlState(stateDir);
  const next = mergeState(current, patch);
  await writeJsonAtomic(missionStatePath(stateDir), next);
  return next;
}

export async function readMissionControlSnapshot(
  stateDir = resolveStateDir(),
): Promise<MissionControlSnapshot> {
  const directory = await ensureMissionControlScaffold(stateDir);
  const storedState = await readMissionControlState(stateDir);
  const workspaceRemote = await resolveWorkspaceRemote(workspaceDirectory(stateDir));
  const state = mergeState(storedState, {
    repo: {
      ...storedState.repo,
      ...workspaceRemote,
      url: storedState.repo.url || workspaceRemote.url,
      branch: storedState.repo.branch || workspaceRemote.branch,
      provider: storedState.repo.provider || workspaceRemote.provider,
      remoteConfigured: workspaceRemote.remoteConfigured,
    },
  });

  const files = await listMissionFiles(directory);

  const innerWorldEntries: Array<MissionInnerWorldEntry | null> = await Promise.all([
    (async () => {
      const soulPath = path.join(stateDir, "soul", "SOUL.md");
      const stat = await statFileIfExists(soulPath);
      return stat
        ? {
            id: "soul",
            title: "Soul",
            path: soulPath,
            content: await readTextFileIfExists(soulPath),
            updatedAt: stat.mtimeMs,
          }
        : null;
    })(),
    (async () => {
      const directivesPath = path.join(directory, "self-directives.md");
      const stat = await statFileIfExists(directivesPath);
      return stat
        ? {
            id: "self-directives",
            title: "Self Directives",
            path: directivesPath,
            content: await readTextFileIfExists(directivesPath),
            updatedAt: stat.mtimeMs,
          }
        : null;
    })(),
    latestFileFromDirectory(path.join(stateDir, "journal"), { allowJson: true }),
    latestFileFromDirectory(path.join(stateDir, "wishes"), { allowJson: true }),
  ]);

  return {
    directory,
    statePath: missionStatePath(stateDir),
    state,
    files,
    innerWorld: innerWorldEntries.filter((entry): entry is MissionInnerWorldEntry =>
      Boolean(entry),
    ),
    importantHistory: await listImportantHistoryEntries(stateDir),
  };
}

export async function writeMissionControlFile(params: {
  fileName: string;
  content: string;
  stateDir?: string;
}): Promise<MissionControlFile> {
  const stateDir = params.stateDir ?? resolveStateDir();
  await ensureMissionControlScaffold(stateDir);
  if (!isSafeMissionFileName(params.fileName)) {
    throw new Error("invalid mission-control file name");
  }
  const filePath = path.join(missionDirectory(stateDir), params.fileName);
  await fs.writeFile(filePath, params.content, "utf8");
  const stat = await statFileIfExists(filePath);
  return {
    id: params.fileName,
    fileName: params.fileName,
    title: getMissionFileTitle(params.fileName),
    path: filePath,
    content: params.content,
    size: stat?.size ?? 0,
    updatedAt: stat?.mtimeMs ?? null,
  };
}

export async function connectMissionRepo(params: {
  url: string;
  branch?: string;
  provider?: MissionRepoState["provider"];
  stateDir?: string;
}): Promise<MissionRepoState> {
  const stateDir = params.stateDir ?? resolveStateDir();
  await ensureMissionControlScaffold(stateDir);
  const workspaceDir = workspaceDirectory(stateDir);
  const repoState = await patchMissionControlState(
    {
      repo: {
        provider: params.provider ?? normalizeRepoProvider(params.url),
        url: params.url.trim(),
        branch: params.branch?.trim() || undefined,
        preferredTransport: params.url.includes("@") ? "ssh" : "https",
        remoteName: "origin",
        connectedAt: Date.now(),
      },
    },
    stateDir,
  );

  try {
    await execFileAsync("git", ["-C", workspaceDir, "rev-parse", "--is-inside-work-tree"]);
    try {
      await execFileAsync("git", ["-C", workspaceDir, "remote", "set-url", "origin", params.url]);
    } catch {
      await execFileAsync("git", ["-C", workspaceDir, "remote", "add", "origin", params.url]);
    }
    const remote = await resolveWorkspaceRemote(workspaceDir);
    return {
      ...repoState.repo,
      ...remote,
      url: params.url.trim(),
      branch: params.branch?.trim() || remote.branch,
      provider: params.provider ?? normalizeRepoProvider(params.url),
      remoteConfigured: true,
      lastError: undefined,
    };
  } catch (error) {
    return {
      ...repoState.repo,
      url: params.url.trim(),
      branch: params.branch?.trim() || undefined,
      provider: params.provider ?? normalizeRepoProvider(params.url),
      remoteConfigured: false,
      lastError: error instanceof Error ? error.message : String(error),
    };
  }
}
