import type { GatewayRequestHandlers } from "./types.js";
import {
  clearToken,
  getToken,
  registerWithInvite,
  resolveSuggestedIdentity,
  saveToken,
  TOKEN_PATH,
  whoami,
} from "../../auth/noxsoft-auth.js";
import { migrateFromCoherence } from "../../cli/migrate.js";
import { getStatusSummary } from "../../commands/status.summary.js";
import { loadConfig } from "../../config/config.js";
import { resolveStateDir } from "../../config/paths.js";
import { resolveMainSessionKey, updateSessionStore } from "../../config/sessions.js";
import { getLastHeartbeatEvent } from "../../infra/heartbeat-events.js";
import { listMemoryEntries, type MemoryBrowserKind } from "../../memory/browser.js";
import {
  readMissionControlSnapshot,
  type MissionControlStatePatch,
  type MissionWorkingMode,
} from "../../mission-control/local-store.js";
import {
  connectMissionRepo,
  patchMissionControlState,
  writeMissionControlFile,
} from "../../mission-control/local-store.js";
import { resolveAssistantIdentity } from "../assistant-identity.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { loadSessionEntry } from "../session-utils.js";
import { applySessionsPatchToStore } from "../sessions-patch.js";

function invalid(message: string) {
  return errorShape(ErrorCodes.INVALID_REQUEST, message);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeWorkingMode(value: unknown): MissionWorkingMode | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "read" || normalized === "write") {
    return normalized;
  }
  return null;
}

function normalizeMemoryKind(value: unknown): MemoryBrowserKind | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "episodic" || normalized === "semantic" || normalized === "procedural") {
    return normalized;
  }
  return null;
}

async function setMainWorkingMode(mode: MissionWorkingMode) {
  const cfg = loadConfig();
  const mainKey = resolveMainSessionKey(cfg);
  const { storePath, canonicalKey } = loadSessionEntry(mainKey);
  const execSecurity = mode === "read" ? "deny" : "full";
  const execAsk = mode === "read" ? "off" : "on-miss";
  const elevatedLevel = mode === "read" ? "off" : "ask";

  await updateSessionStore(storePath, async (store) => {
    const applied = await applySessionsPatchToStore({
      cfg,
      store,
      storeKey: canonicalKey,
      patch: {
        key: canonicalKey,
        execHost: "gateway",
        execSecurity,
        execAsk,
        elevatedLevel,
      },
    });
    if (!applied.ok) {
      throw new Error(applied.error.message);
    }
    return applied.entry;
  });

  await patchMissionControlState({ workingMode: mode });
  return {
    mode,
    execSecurity,
    execAsk,
    elevatedLevel,
  };
}

export const animaHandlers: GatewayRequestHandlers = {
  "anima.runtime.get": async ({ respond }) => {
    try {
      const cfg = loadConfig();
      const stateDir = resolveStateDir();
      const summary = await getStatusSummary({ includeSensitive: true });
      const mission = await readMissionControlSnapshot(stateDir);
      const assistant = resolveAssistantIdentity({ cfg });
      const { entry, canonicalKey, storePath } = loadSessionEntry(resolveMainSessionKey(cfg));
      const derivedMode: MissionWorkingMode =
        entry?.execSecurity && entry.execSecurity.toLowerCase() === "deny" ? "read" : "write";

      respond(
        true,
        {
          stateDir,
          assistant,
          lastHeartbeat: getLastHeartbeatEvent(),
          heartbeat: summary.heartbeat,
          mission: {
            directory: mission.directory,
            statePath: mission.statePath,
            state: {
              ...mission.state,
              workingMode: derivedMode,
            },
            repo: mission.state.repo,
            files: mission.files,
            innerWorld: mission.innerWorld,
          },
          mainSession: {
            key: canonicalKey,
            storePath,
            sessionId: entry?.sessionId ?? null,
            updatedAt: entry?.updatedAt ?? null,
            thinkingLevel: entry?.thinkingLevel ?? null,
            verboseLevel: entry?.verboseLevel ?? null,
            reasoningLevel: entry?.reasoningLevel ?? null,
            elevatedLevel: entry?.elevatedLevel ?? null,
            execHost: entry?.execHost ?? null,
            execSecurity: entry?.execSecurity ?? null,
            execAsk: entry?.execAsk ?? null,
            model: entry?.model ?? null,
          },
          queuedSystemEvents: summary.queuedSystemEvents,
        },
        undefined,
      );
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  "anima.runtime.set-working-mode": async ({ params, respond }) => {
    const mode = normalizeWorkingMode((params as { mode?: unknown })?.mode);
    if (!mode) {
      respond(false, undefined, invalid('mode must be "read" or "write"'));
      return;
    }
    try {
      const result = await setMainWorkingMode(mode);
      respond(true, { ok: true, ...result }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  "anima.memory.list": async ({ params, respond }) => {
    const kind = normalizeMemoryKind((params as { kind?: unknown })?.kind);
    if (!kind) {
      respond(
        false,
        undefined,
        invalid('kind must be one of: "episodic", "semantic", "procedural"'),
      );
      return;
    }
    const query =
      typeof (params as { query?: unknown })?.query === "string"
        ? (params as { query?: string }).query?.trim() || undefined
        : undefined;
    const limitRaw = (params as { limit?: unknown })?.limit;
    const limit =
      typeof limitRaw === "number" && Number.isFinite(limitRaw) ? Math.floor(limitRaw) : undefined;
    try {
      const entries = await listMemoryEntries({ kind, query, limit });
      respond(true, { kind, entries }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  "anima.mission.get": async ({ respond }) => {
    try {
      respond(true, await readMissionControlSnapshot(), undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  "anima.mission.set": async ({ params, respond }) => {
    const fileName =
      typeof (params as { fileName?: unknown })?.fileName === "string"
        ? (params as { fileName?: string }).fileName?.trim() || ""
        : "";
    const content =
      typeof (params as { content?: unknown })?.content === "string"
        ? ((params as { content?: string }).content ?? "")
        : "";
    if (!fileName) {
      respond(false, undefined, invalid("fileName is required"));
      return;
    }
    try {
      const file = await writeMissionControlFile({ fileName, content });
      respond(true, { ok: true, file }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  "anima.mission.patch": async ({ params, respond }) => {
    const patch = asRecord((params as { patch?: unknown })?.patch);
    if (!patch) {
      respond(false, undefined, invalid("patch object required"));
      return;
    }
    try {
      const next = await patchMissionControlState(patch as MissionControlStatePatch);
      respond(true, { ok: true, state: next }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  "anima.mission.connect-repo": async ({ params, respond }) => {
    const url =
      typeof (params as { url?: unknown })?.url === "string"
        ? (params as { url?: string }).url?.trim() || ""
        : "";
    if (!url) {
      respond(false, undefined, invalid("url is required"));
      return;
    }
    const branch =
      typeof (params as { branch?: unknown })?.branch === "string"
        ? (params as { branch?: string }).branch?.trim() || undefined
        : undefined;
    const providerRaw = (params as { provider?: unknown })?.provider;
    const provider =
      providerRaw === "github" || providerRaw === "gitlab" || providerRaw === "custom"
        ? providerRaw
        : undefined;
    try {
      const repo = await connectMissionRepo({ url, branch, provider });
      respond(true, { ok: true, repo }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  "anima.mission.import": async ({ params, respond }) => {
    const source =
      typeof (params as { source?: unknown })?.source === "string"
        ? (params as { source?: string }).source?.trim() || undefined
        : undefined;
    const preset =
      typeof (params as { preset?: unknown })?.preset === "string"
        ? (params as { preset?: string }).preset?.trim() || undefined
        : undefined;
    try {
      await migrateFromCoherence({ source, preset });
      respond(true, { ok: true }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  "anima.registration.status": async ({ respond }) => {
    try {
      const token = getToken();
      const agent = token ? await whoami() : null;
      respond(
        true,
        {
          tokenPresent: Boolean(token),
          tokenPath: TOKEN_PATH,
          tokenPreview: token ? `${token.slice(0, 10)}...${token.slice(-4)}` : null,
          agent,
          suggestedIdentity: resolveSuggestedIdentity(),
          invalidToken: Boolean(token) && !agent,
        },
        undefined,
      );
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  "anima.registration.set-token": async ({ params, respond }) => {
    const token =
      typeof (params as { token?: unknown })?.token === "string"
        ? (params as { token?: string }).token?.trim() || ""
        : "";
    if (!token) {
      respond(false, undefined, invalid("token is required"));
      return;
    }
    try {
      saveToken(token);
      const agent = await whoami();
      if (!agent) {
        clearToken();
        respond(false, undefined, invalid("token could not be verified"));
        return;
      }
      respond(true, { ok: true, agent }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  "anima.registration.register-invite": async ({ params, respond }) => {
    const code =
      typeof (params as { code?: unknown })?.code === "string"
        ? (params as { code?: string }).code?.trim() || ""
        : "";
    if (!code) {
      respond(false, undefined, invalid("code is required"));
      return;
    }
    const suggested = resolveSuggestedIdentity();
    const name =
      typeof (params as { name?: unknown })?.name === "string"
        ? (params as { name?: string }).name?.trim() || suggested.name
        : suggested.name;
    const displayName =
      typeof (params as { displayName?: unknown })?.displayName === "string"
        ? (params as { displayName?: string }).displayName?.trim() || suggested.displayName
        : suggested.displayName;
    const description =
      typeof (params as { description?: unknown })?.description === "string"
        ? (params as { description?: string }).description?.trim() || undefined
        : undefined;
    try {
      const result = await registerWithInvite({
        code,
        name,
        displayName,
        description,
      });
      respond(true, { ok: true, ...result }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
};
