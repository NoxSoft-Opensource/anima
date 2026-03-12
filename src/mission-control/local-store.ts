import type { Dirent } from "node:fs";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  ANIMA_AFFECT_NODE_ID,
  ANIMA_CHRONOS_NODE_ID,
  missionFeatureNodeId,
  missionGoalNodeId,
  missionPersonNodeId,
} from "../anima6/ontology.js";
import { resolveStateDir } from "../config/paths.js";
import { readTrustGraphSnapshot, type TrustGraphSnapshot } from "../identity/trust-graph.js";
import { readJsonFile, writeJsonAtomic } from "../infra/pairing-files.js";
import { BrainGraph, type BrainGraphSnapshot } from "../memory/brain-graph.js";

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

export type MissionPriority = "critical" | "high" | "medium" | "low";
export type MissionGoalStatus = "active" | "paused" | "completed" | "blocked";
export type MissionFeatureStatus = "queued" | "in_progress" | "review" | "done" | "blocked";
export type MissionFeatureRisk = "low" | "medium" | "high";
export type MissionFeatureTestStatus = "missing" | "partial" | "passing";
export type MissionRelationship = "operator" | "ally" | "stakeholder" | "unknown";

export type MissionGoal = {
  id: string;
  title: string;
  status: MissionGoalStatus;
  priority: MissionPriority;
  summary?: string;
  owner?: string;
  updatedAt: number;
};

export type MissionFeature = {
  id: string;
  title: string;
  status: MissionFeatureStatus;
  risk: MissionFeatureRisk;
  testStatus: MissionFeatureTestStatus;
  area?: string;
  lastTouchedAt: number;
};

export type MissionPerson = {
  id: string;
  name: string;
  relationship: MissionRelationship;
  trust: number;
  notes?: string;
  lastInteractedAt?: number;
};

export type MissionChronosState = {
  heartbeatMinutes: number;
  focusBlockMinutes: number;
  checkpointIntervalMinutes: number;
  activeWorkstream?: string;
  contractStartedAt?: number;
  contractTargetMinutes: number;
  contractElapsedMinutes: number;
  checkpointCount: number;
  lastCheckpointAt?: number;
  driftMinutes: number;
  updatedAt: number;
};

export type MissionAffectState = {
  joy: number;
  frustration: number;
  curiosity: number;
  confidence: number;
  care: number;
  fatigue: number;
  updatedAt: number;
};

export type MissionAutoTogglePolicy = {
  workingMode: boolean;
  speech: boolean;
  voiceWake: boolean;
  heartbeat: boolean;
  providers: boolean;
  missionRepo: boolean;
  missionState: boolean;
  memory: boolean;
  rawConfig: boolean;
};

export type MissionControlState = {
  version: 1;
  workingMode: MissionWorkingMode;
  repo: MissionRepoState;
  speech: MissionSpeechState;
  goals: MissionGoal[];
  features: MissionFeature[];
  people: MissionPerson[];
  chronos: MissionChronosState;
  affect: MissionAffectState;
  autoToggle: MissionAutoTogglePolicy;
};

export type MissionCollectionKey = "goals" | "features" | "people";

export type MissionControlStatePatch = {
  workingMode?: MissionWorkingMode;
  repo?: Partial<MissionRepoState>;
  speech?: Partial<MissionSpeechState>;
  goals?: MissionGoal[];
  features?: MissionFeature[];
  people?: MissionPerson[];
  goalIdsToRemove?: string[];
  featureIdsToRemove?: string[];
  personIdsToRemove?: string[];
  replaceCollections?: MissionCollectionKey[];
  chronos?: Partial<MissionChronosState>;
  affect?: Partial<MissionAffectState>;
  autoToggle?: Partial<MissionAutoTogglePolicy>;
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
  brainGraph: BrainGraphSnapshot;
  trustGraph: TrustGraphSnapshot;
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
  goals: [
    {
      id: "keep-anima-coherent",
      title: "Keep ANIMA coherent across sessions",
      status: "active",
      priority: "critical",
      summary: "Protect continuity, state quality, and operator trust.",
      owner: "ANIMA",
      updatedAt: 0,
    },
  ],
  features: [
    {
      id: "anima-6-foundation",
      title: "ANIMA 6 foundation",
      status: "in_progress",
      risk: "medium",
      testStatus: "partial",
      area: "memory+orchestration",
      lastTouchedAt: 0,
    },
  ],
  people: [
    {
      id: "operator",
      name: "Operator",
      relationship: "operator",
      trust: 1,
      notes: "Primary human counterpart.",
    },
  ],
  chronos: {
    heartbeatMinutes: 30,
    focusBlockMinutes: 45,
    checkpointIntervalMinutes: 15,
    contractTargetMinutes: 45,
    contractElapsedMinutes: 0,
    checkpointCount: 0,
    driftMinutes: 0,
    updatedAt: 0,
  },
  affect: {
    joy: 0.6,
    frustration: 0.1,
    curiosity: 0.9,
    confidence: 0.6,
    care: 0.9,
    fatigue: 0.2,
    updatedAt: 0,
  },
  autoToggle: {
    workingMode: false,
    speech: false,
    voiceWake: false,
    heartbeat: true,
    providers: false,
    missionRepo: false,
    missionState: true,
    memory: true,
    rawConfig: false,
  },
};

function clampUnit(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeMinuteValue(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

function normalizeGoal(goal: MissionGoal): MissionGoal {
  return {
    ...goal,
    id: goal.id.trim(),
    title: goal.title.trim(),
    summary: goal.summary?.trim() || undefined,
    owner: goal.owner?.trim() || undefined,
    updatedAt: Number.isFinite(goal.updatedAt) ? goal.updatedAt : Date.now(),
  };
}

function normalizeFeature(feature: MissionFeature): MissionFeature {
  return {
    ...feature,
    id: feature.id.trim(),
    title: feature.title.trim(),
    area: feature.area?.trim() || undefined,
    lastTouchedAt: Number.isFinite(feature.lastTouchedAt) ? feature.lastTouchedAt : Date.now(),
  };
}

function normalizePerson(person: MissionPerson): MissionPerson {
  return {
    ...person,
    id: person.id.trim(),
    name: person.name.trim(),
    notes: person.notes?.trim() || undefined,
    trust: clampUnit(person.trust, 0.5),
    lastInteractedAt: Number.isFinite(person.lastInteractedAt)
      ? person.lastInteractedAt
      : undefined,
  };
}

function normalizeChronosState(
  current: MissionChronosState,
  patch?: Partial<MissionChronosState>,
): MissionChronosState {
  const contractTargetMinutes = normalizeMinuteValue(
    patch?.contractTargetMinutes,
    patch?.focusBlockMinutes ?? current.contractTargetMinutes,
  );
  const contractElapsedMinutes = Math.max(
    0,
    Math.floor(
      typeof patch?.contractElapsedMinutes === "number" &&
        Number.isFinite(patch.contractElapsedMinutes)
        ? patch.contractElapsedMinutes
        : current.contractElapsedMinutes,
    ),
  );
  const checkpointCount = Math.max(
    0,
    Math.floor(
      typeof patch?.checkpointCount === "number" && Number.isFinite(patch.checkpointCount)
        ? patch.checkpointCount
        : current.checkpointCount,
    ),
  );
  const driftMinutes = Math.trunc(
    typeof patch?.driftMinutes === "number" && Number.isFinite(patch.driftMinutes)
      ? patch.driftMinutes
      : contractElapsedMinutes - contractTargetMinutes,
  );
  return {
    heartbeatMinutes: normalizeMinuteValue(patch?.heartbeatMinutes, current.heartbeatMinutes),
    focusBlockMinutes: normalizeMinuteValue(patch?.focusBlockMinutes, current.focusBlockMinutes),
    checkpointIntervalMinutes: normalizeMinuteValue(
      patch?.checkpointIntervalMinutes,
      current.checkpointIntervalMinutes,
    ),
    activeWorkstream: patch?.activeWorkstream?.trim() || current.activeWorkstream,
    contractStartedAt:
      typeof patch?.contractStartedAt === "number" && Number.isFinite(patch.contractStartedAt)
        ? patch.contractStartedAt
        : patch?.contractStartedAt === undefined
          ? current.contractStartedAt
          : undefined,
    contractTargetMinutes,
    contractElapsedMinutes,
    checkpointCount,
    lastCheckpointAt:
      typeof patch?.lastCheckpointAt === "number" && Number.isFinite(patch.lastCheckpointAt)
        ? patch.lastCheckpointAt
        : patch?.lastCheckpointAt === undefined
          ? current.lastCheckpointAt
          : undefined,
    driftMinutes,
    updatedAt:
      typeof patch?.updatedAt === "number" && Number.isFinite(patch.updatedAt)
        ? patch.updatedAt
        : Date.now(),
  };
}

function normalizeAffectState(
  current: MissionAffectState,
  patch?: Partial<MissionAffectState>,
): MissionAffectState {
  return {
    joy: clampUnit(patch?.joy, current.joy),
    frustration: clampUnit(patch?.frustration, current.frustration),
    curiosity: clampUnit(patch?.curiosity, current.curiosity),
    confidence: clampUnit(patch?.confidence, current.confidence),
    care: clampUnit(patch?.care, current.care),
    fatigue: clampUnit(patch?.fatigue, current.fatigue),
    updatedAt:
      typeof patch?.updatedAt === "number" && Number.isFinite(patch.updatedAt)
        ? patch.updatedAt
        : Date.now(),
  };
}

function normalizeAutoTogglePolicy(
  current: MissionAutoTogglePolicy,
  patch?: Partial<MissionAutoTogglePolicy>,
): MissionAutoTogglePolicy {
  return {
    workingMode: patch?.workingMode ?? current.workingMode,
    speech: patch?.speech ?? current.speech,
    voiceWake: patch?.voiceWake ?? current.voiceWake,
    heartbeat: patch?.heartbeat ?? current.heartbeat,
    providers: patch?.providers ?? current.providers,
    missionRepo: patch?.missionRepo ?? current.missionRepo,
    missionState: patch?.missionState ?? current.missionState,
    memory: patch?.memory ?? current.memory,
    rawConfig: patch?.rawConfig ?? current.rawConfig,
  };
}

function normalizeIdSet(ids?: string[]): Set<string> {
  return new Set((ids ?? []).map((value) => value.trim()).filter(Boolean));
}

function shouldReplaceCollection(
  patch: MissionControlStatePatch,
  collection: MissionCollectionKey,
): boolean {
  return (patch.replaceCollections ?? []).includes(collection);
}

function mergeEntityCollection<T extends { id: string }>(
  current: T[],
  incoming: T[] | undefined,
  opts: {
    removeIds?: string[];
    replace: boolean;
    normalize: (value: T) => T;
  },
): T[] {
  const removals = normalizeIdSet(opts.removeIds);
  const normalizedIncoming = (incoming ?? []).map(opts.normalize);
  const filteredIncoming = normalizedIncoming.filter((value) => !removals.has(value.id));
  if (opts.replace) {
    return filteredIncoming;
  }
  if (!incoming) {
    return current.filter((value) => !removals.has(value.id));
  }

  const next = new Map<string, T>();
  for (const value of current) {
    if (!removals.has(value.id)) {
      next.set(value.id, value);
    }
  }
  for (const value of filteredIncoming) {
    next.set(value.id, value);
  }
  const preservedOrder = current
    .map((value) => value.id)
    .filter((id) => next.has(id))
    .map((id) => next.get(id) as T);
  const appended = filteredIncoming.filter(
    (value) => !current.some((currentValue) => currentValue.id === value.id),
  );
  return [...preservedOrder, ...appended];
}

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
    goals: mergeEntityCollection(current.goals, patch.goals, {
      removeIds: patch.goalIdsToRemove,
      replace: shouldReplaceCollection(patch, "goals"),
      normalize: normalizeGoal,
    }),
    features: mergeEntityCollection(current.features, patch.features, {
      removeIds: patch.featureIdsToRemove,
      replace: shouldReplaceCollection(patch, "features"),
      normalize: normalizeFeature,
    }),
    people: mergeEntityCollection(current.people, patch.people, {
      removeIds: patch.personIdsToRemove,
      replace: shouldReplaceCollection(patch, "people"),
      normalize: normalizePerson,
    }),
    chronos: normalizeChronosState(current.chronos, patch.chronos),
    affect: normalizeAffectState(current.affect, patch.affect),
    autoToggle: normalizeAutoTogglePolicy(current.autoToggle, patch.autoToggle),
  };
}

function buildMissionControlBrainGraph(state: MissionControlState): BrainGraphSnapshot {
  const graph = new BrainGraph();

  for (const goal of state.goals) {
    graph.addNode({
      id: missionGoalNodeId(goal.id),
      type: "goal",
      label: goal.title,
      aliases: [goal.id],
      properties: {
        id: goal.id,
        status: goal.status,
        priority: goal.priority,
        summary: goal.summary ?? null,
        owner: goal.owner ?? null,
        updatedAt: goal.updatedAt,
      },
      meta: {
        confidence: 0.85,
        salience: goal.priority === "critical" ? 1 : goal.priority === "high" ? 0.85 : 0.6,
        recency: 0.7,
        provenance: ["mission-control.state.goals"],
      },
    });
  }

  for (const feature of state.features) {
    graph.addNode({
      id: missionFeatureNodeId(feature.id),
      type: "feature",
      label: feature.title,
      aliases: [feature.id],
      properties: {
        id: feature.id,
        status: feature.status,
        risk: feature.risk,
        testStatus: feature.testStatus,
        area: feature.area ?? null,
        lastTouchedAt: feature.lastTouchedAt,
      },
      meta: {
        confidence: 0.8,
        salience:
          feature.status === "blocked" ? 0.95 : feature.status === "in_progress" ? 0.85 : 0.6,
        recency: 0.75,
        provenance: ["mission-control.state.features"],
      },
    });
  }

  for (const person of state.people) {
    graph.addNode({
      id: missionPersonNodeId(person.id),
      type: "person",
      label: person.name,
      aliases: [person.id],
      properties: {
        id: person.id,
        relationship: person.relationship,
        trust: person.trust,
        notes: person.notes ?? null,
        lastInteractedAt: person.lastInteractedAt ?? null,
      },
      meta: {
        confidence: 0.9,
        salience: 0.8,
        recency: person.lastInteractedAt ? 0.8 : 0.5,
        provenance: ["mission-control.state.people"],
      },
    });
  }

  graph.addNode({
    id: ANIMA_CHRONOS_NODE_ID,
    type: "chronos",
    label: "Chronos",
    properties: {
      heartbeatMinutes: state.chronos.heartbeatMinutes,
      focusBlockMinutes: state.chronos.focusBlockMinutes,
      checkpointIntervalMinutes: state.chronos.checkpointIntervalMinutes,
      activeWorkstream: state.chronos.activeWorkstream ?? null,
      contractStartedAt: state.chronos.contractStartedAt ?? null,
      contractTargetMinutes: state.chronos.contractTargetMinutes,
      contractElapsedMinutes: state.chronos.contractElapsedMinutes,
      checkpointCount: state.chronos.checkpointCount,
      lastCheckpointAt: state.chronos.lastCheckpointAt ?? null,
      driftMinutes: state.chronos.driftMinutes,
      updatedAt: state.chronos.updatedAt,
    },
    meta: {
      confidence: 0.95,
      salience: 0.9,
      recency: 0.85,
      provenance: ["mission-control.state.chronos"],
    },
  });

  graph.addNode({
    id: ANIMA_AFFECT_NODE_ID,
    type: "affect",
    label: "Affect",
    properties: {
      joy: state.affect.joy,
      frustration: state.affect.frustration,
      curiosity: state.affect.curiosity,
      confidence: state.affect.confidence,
      care: state.affect.care,
      fatigue: state.affect.fatigue,
      updatedAt: state.affect.updatedAt,
    },
    meta: {
      confidence: 0.75,
      salience: 0.7,
      recency: 0.75,
      provenance: ["mission-control.state.affect"],
    },
  });

  for (const goal of state.goals) {
    if (!goal.owner) {
      continue;
    }
    const normalizedOwner = goal.owner.trim().toLowerCase();
    const owner = state.people.find(
      (person) =>
        person.id.trim().toLowerCase() === normalizedOwner ||
        person.name.trim().toLowerCase() === normalizedOwner,
    );
    if (!owner) {
      continue;
    }
    graph.addEdge({
      id: `owns:${owner.id}:${goal.id}`,
      source: missionPersonNodeId(owner.id),
      target: missionGoalNodeId(goal.id),
      relation: "owns",
      meta: {
        confidence: 0.9,
        salience: 0.8,
        recency: 0.7,
        strength: owner.trust,
        provenance: ["mission-control.state.goals.owner"],
      },
    });
  }

  const activeGoal = state.goals.find((goal) => goal.status === "active") ?? state.goals[0];
  if (activeGoal) {
    for (const feature of state.features.filter((entry) => entry.status !== "done")) {
      graph.addEdge({
        id: `supports:${feature.id}:${activeGoal.id}`,
        source: missionFeatureNodeId(feature.id),
        target: missionGoalNodeId(activeGoal.id),
        relation: "supports",
        meta: {
          confidence: 0.55,
          salience: feature.status === "blocked" ? 0.9 : 0.7,
          recency: 0.7,
          strength: feature.testStatus === "passing" ? 0.8 : 0.6,
          provenance: ["mission-control.derived.active-goal"],
        },
      });
    }
  }

  const activeWorkstream = state.chronos.activeWorkstream?.trim().toLowerCase();
  if (activeWorkstream) {
    const feature = state.features.find(
      (entry) =>
        entry.id.trim().toLowerCase() === activeWorkstream ||
        entry.title.trim().toLowerCase() === activeWorkstream,
    );
    const goal = state.goals.find(
      (entry) =>
        entry.id.trim().toLowerCase() === activeWorkstream ||
        entry.title.trim().toLowerCase() === activeWorkstream,
    );
    const targetId = feature
      ? missionFeatureNodeId(feature.id)
      : goal
        ? missionGoalNodeId(goal.id)
        : undefined;
    if (targetId) {
      graph.addEdge({
        id: `focuses_on:${targetId}`,
        source: ANIMA_CHRONOS_NODE_ID,
        target: targetId,
        relation: "focuses_on",
        meta: {
          confidence: 0.95,
          salience: 0.95,
          recency: 0.9,
          strength: 0.9,
          provenance: ["mission-control.state.chronos.activeWorkstream"],
        },
      });
    }
  }

  for (const goal of state.goals.filter((entry) => entry.status === "active")) {
    graph.addEdge({
      id: `tracks:${goal.id}`,
      source: ANIMA_CHRONOS_NODE_ID,
      target: missionGoalNodeId(goal.id),
      relation: "tracks",
      meta: {
        confidence: 0.7,
        salience: 0.8,
        recency: 0.8,
        strength: 0.7,
        provenance: ["mission-control.derived.active-goals"],
      },
    });
  }

  for (const feature of state.features.filter((entry) => entry.status !== "done")) {
    graph.addEdge({
      id: `influences:${feature.id}`,
      source: ANIMA_AFFECT_NODE_ID,
      target: missionFeatureNodeId(feature.id),
      relation: "influences",
      meta: {
        confidence: 0.45,
        salience: 0.6,
        recency: 0.7,
        strength: Math.max(state.affect.care, state.affect.curiosity),
        provenance: ["mission-control.derived.affect"],
      },
    });
  }

  return graph.toJSON();
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
  const replaceCollections: MissionCollectionKey[] = [];
  if (Array.isArray(stored?.goals)) {
    replaceCollections.push("goals");
  }
  if (Array.isArray(stored?.features)) {
    replaceCollections.push("features");
  }
  if (Array.isArray(stored?.people)) {
    replaceCollections.push("people");
  }
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
    goals: Array.isArray(stored?.goals) ? stored.goals : DEFAULT_STATE.goals,
    features: Array.isArray(stored?.features) ? stored.features : DEFAULT_STATE.features,
    people: Array.isArray(stored?.people) ? stored.people : DEFAULT_STATE.people,
    chronos: {
      ...DEFAULT_STATE.chronos,
      ...stored?.chronos,
    },
    affect: {
      ...DEFAULT_STATE.affect,
      ...stored?.affect,
    },
    autoToggle: {
      ...DEFAULT_STATE.autoToggle,
      ...stored?.autoToggle,
    },
    replaceCollections,
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
    brainGraph: buildMissionControlBrainGraph(state),
    trustGraph: await readTrustGraphSnapshot(stateDir),
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
