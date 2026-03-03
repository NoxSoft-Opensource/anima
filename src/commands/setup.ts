import JSON5 from "json5";
import fs from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import type { RuntimeEnv } from "../runtime.js";
import { DEFAULT_AGENT_WORKSPACE_DIR, ensureAgentWorkspace } from "../agents/workspace.js";
import { ensureAuthenticated } from "../auth/noxsoft-auth.js";
import { type AnimaConfig, createConfigIO, writeConfigFile } from "../config/config.js";
import { formatConfigPath, logConfigUpdated } from "../config/logging.js";
import { resolveSessionTranscriptsDir } from "../config/sessions.js";
import { defaultRuntime } from "../runtime.js";
import { shortenHomePath } from "../utils.js";

const NOXSOFT_AUTONOMY_PRESET = "noxsoft-autonomy" as const;

type SetupPreset = typeof NOXSOFT_AUTONOMY_PRESET;
type HeartbeatTarget = NonNullable<
  NonNullable<NonNullable<AnimaConfig["agents"]>["defaults"]>["heartbeat"]
>["target"];

type SetupCommandOptions = {
  workspace?: string;
  preset?: string;
  heartbeatEvery?: string;
  heartbeatTarget?: string;
  heartbeatPrompt?: string;
  noxsoftAgentName?: string;
  noxsoftDisplayName?: string;
};

function resolveSetupPreset(raw: string | undefined): {
  preset: SetupPreset | null;
  error?: string;
} {
  const normalized = raw?.trim().toLowerCase();
  if (!normalized) {
    return { preset: null };
  }
  if (normalized === NOXSOFT_AUTONOMY_PRESET) {
    return { preset: NOXSOFT_AUTONOMY_PRESET };
  }
  return {
    preset: null,
    error: `Unknown setup preset "${raw}". Supported presets: ${NOXSOFT_AUTONOMY_PRESET}.`,
  };
}

function normalizeHeartbeatTarget(raw: string | undefined): HeartbeatTarget | undefined {
  const normalized = raw?.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized === "last" || normalized === "none") {
    return normalized;
  }
  return normalized as HeartbeatTarget;
}

function applyNoxsoftAutonomyPreset(config: AnimaConfig): AnimaConfig {
  const defaults = config.agents?.defaults ?? {};
  const heartbeat = defaults.heartbeat ?? {};

  return {
    ...config,
    agents: {
      ...config.agents,
      defaults: {
        ...defaults,
        heartbeat: {
          ...heartbeat,
          every: heartbeat.every ?? "5m",
          target: heartbeat.target ?? "last",
          prompt:
            heartbeat.prompt ??
            [
              "Run NoxSoft autonomy heartbeat.",
              "1) Check chat.noxsoft.net for unread messages and reply when action is required.",
              "2) Check status.noxsoft.net and track regressions/issues before code changes.",
              "3) Continue highest-priority implementation, security, and test work in this workspace.",
              "If no action is required, reply HEARTBEAT_OK.",
            ].join(" "),
        },
      },
    },
  };
}

function applyHeartbeatOverrides(config: AnimaConfig, opts?: SetupCommandOptions): AnimaConfig {
  const heartbeatEvery = opts?.heartbeatEvery?.trim();
  const heartbeatPrompt = opts?.heartbeatPrompt?.trim();
  const heartbeatTarget = normalizeHeartbeatTarget(opts?.heartbeatTarget);
  if (!heartbeatEvery && !heartbeatPrompt && !heartbeatTarget) {
    return config;
  }

  const defaults = config.agents?.defaults ?? {};
  const heartbeat = defaults.heartbeat ?? {};
  return {
    ...config,
    agents: {
      ...config.agents,
      defaults: {
        ...defaults,
        heartbeat: {
          ...heartbeat,
          ...(heartbeatEvery ? { every: heartbeatEvery } : {}),
          ...(heartbeatPrompt ? { prompt: heartbeatPrompt } : {}),
          ...(heartbeatTarget ? { target: heartbeatTarget } : {}),
        },
      },
    },
  };
}

async function readConfigFileRaw(configPath: string): Promise<{
  exists: boolean;
  parsed: AnimaConfig;
}> {
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = JSON5.parse(raw);
    if (parsed && typeof parsed === "object") {
      return { exists: true, parsed: parsed as AnimaConfig };
    }
    return { exists: true, parsed: {} };
  } catch {
    return { exists: false, parsed: {} };
  }
}

export async function setupCommand(
  opts?: SetupCommandOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  const desiredWorkspace =
    typeof opts?.workspace === "string" && opts.workspace.trim()
      ? opts.workspace.trim()
      : undefined;
  const presetResolution = resolveSetupPreset(opts?.preset);
  if (presetResolution.error) {
    runtime.error(presetResolution.error);
    runtime.exit(1);
    return;
  }
  const preset = presetResolution.preset;

  const io = createConfigIO();
  const configPath = io.configPath;
  const existingRaw = await readConfigFileRaw(configPath);
  const cfg = existingRaw.parsed;
  const defaults = cfg.agents?.defaults ?? {};

  const workspace = desiredWorkspace ?? defaults.workspace ?? DEFAULT_AGENT_WORKSPACE_DIR;

  const next: AnimaConfig = {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...defaults,
        workspace,
      },
    },
  };
  const withPreset = preset === NOXSOFT_AUTONOMY_PRESET ? applyNoxsoftAutonomyPreset(next) : next;
  const withOverrides = applyHeartbeatOverrides(withPreset, opts);

  if (!existingRaw.exists || !isDeepStrictEqual(cfg, withOverrides)) {
    await writeConfigFile(withOverrides);
    if (!existingRaw.exists) {
      runtime.log(`Wrote ${formatConfigPath(configPath)}`);
    } else {
      logConfigUpdated(runtime, { path: configPath, suffix: "(setup updates applied)" });
    }
  } else {
    runtime.log(`Config OK: ${formatConfigPath(configPath)}`);
  }

  const ws = await ensureAgentWorkspace({
    dir: workspace,
    ensureBootstrapFiles: !withOverrides.agents?.defaults?.skipBootstrap,
    seedBootstrapOnFirstRun: !existingRaw.exists,
  });
  runtime.log(`Workspace OK: ${shortenHomePath(ws.dir)}`);

  const sessionsDir = resolveSessionTranscriptsDir();
  await fs.mkdir(sessionsDir, { recursive: true });
  runtime.log(`Sessions OK: ${shortenHomePath(sessionsDir)}`);

  // Show current settings summary
  const gatewayMode = withOverrides.gateway?.mode;
  const gatewayPort = withOverrides.gateway?.port;
  const heartbeatEvery = withOverrides.agents?.defaults?.heartbeat?.every;
  const heartbeatTarget = withOverrides.agents?.defaults?.heartbeat?.target;

  runtime.log("");
  runtime.log("  Current settings:");
  runtime.log(
    `    Gateway:   ${gatewayMode ?? "not configured"}${gatewayPort ? ` (port ${gatewayPort})` : ""}`,
  );
  runtime.log(
    `    Heartbeat: ${heartbeatEvery ?? "default (30m)"}${heartbeatTarget ? ` -> ${heartbeatTarget}` : ""}`,
  );
  if (preset === NOXSOFT_AUTONOMY_PRESET) {
    runtime.log(`    Preset:    ${NOXSOFT_AUTONOMY_PRESET}`);
  }

  try {
    const auth = await ensureAuthenticated({
      name: opts?.noxsoftAgentName,
      displayName: opts?.noxsoftDisplayName,
      description: "ANIMA setup auto-registration",
    });
    runtime.log(
      `    NoxSoft:   \x1b[32m${auth.registered ? "registered" : "authenticated"}\x1b[0m as ${auth.agent.display_name} (@${auth.agent.name})`,
    );
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Unknown NoxSoft authentication error.";
    runtime.error(`NoxSoft authentication is required for setup.\n${message}`);
    runtime.exit(1);
    return;
  }

  runtime.log("");
  runtime.log("  Run \x1b[36manima configure\x1b[0m to change settings.");
  runtime.log("  Run \x1b[36manima setup --wizard\x1b[0m for full guided setup.");
}
