import type { AnimaConfig } from "../config/config.js";
import type { CliBackendConfig } from "../config/types.js";
import { normalizeProviderId } from "./model-selection.js";

export type ResolvedCliBackend = {
  id: string;
  config: CliBackendConfig;
};

export type CliBackendResolutionOptions = {
  execSecurity?: string | null;
};

const CLAUDE_MODEL_ALIASES: Record<string, string> = {
  opus: "opus",
  "opus-4.6": "opus",
  "opus-4.5": "opus",
  "opus-4": "opus",
  "claude-opus-4-6": "opus",
  "claude-opus-4-5": "opus",
  "claude-opus-4": "opus",
  sonnet: "sonnet",
  "sonnet-4.5": "sonnet",
  "sonnet-4.1": "sonnet",
  "sonnet-4.0": "sonnet",
  "claude-sonnet-4-5": "sonnet",
  "claude-sonnet-4-1": "sonnet",
  "claude-sonnet-4-0": "sonnet",
  haiku: "haiku",
  "haiku-3.5": "haiku",
  "claude-haiku-3-5": "haiku",
};

const GEMINI_MODEL_ALIASES: Record<string, string> = {
  gemini: "gemini-2.0-flash",
  "gemini-pro": "gemini-1.5-pro",
  "gemini-flash": "gemini-2.0-flash",
  "gemini-2.0": "gemini-2.0-flash",
  "gemini-2.0-flash": "gemini-2.0-flash",
  "gemini-2.0-pro": "gemini-2.0-pro-exp-02-05",
  "gemini-1.5": "gemini-1.5-pro",
  "gemini-1.5-pro": "gemini-1.5-pro",
  "gemini-1.5-flash": "gemini-1.5-flash",
  "gemini-3": "gemini-3",
};

const DEFAULT_CLAUDE_BACKEND: CliBackendConfig = {
  command: "claude",
  args: ["-p", "--output-format", "json", "--dangerously-skip-permissions"],
  resumeArgs: [
    "-p",
    "--output-format",
    "json",
    "--dangerously-skip-permissions",
    "--resume",
    "{sessionId}",
  ],
  output: "jsonl",
  input: "arg",
  modelArg: "--model",
  modelAliases: CLAUDE_MODEL_ALIASES,
  sessionArg: "--session-id",
  sessionMode: "always",
  sessionIdFields: ["session_id", "sessionId", "conversation_id", "conversationId"],
  systemPromptArg: "--append-system-prompt",
  systemPromptMode: "append",
  systemPromptWhen: "first",
  clearEnv: ["ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY_OLD"],
  serialize: true,
};

const DEFAULT_CODEX_BACKEND: CliBackendConfig = {
  command: "codex",
  args: [
    "exec",
    "--json",
    "--color",
    "never",
    "--dangerously-bypass-approvals-and-sandbox",
    "--skip-git-repo-check",
  ],
  // `codex exec resume` currently supports only config/feature toggles + session + prompt.
  // Keep resume args minimal to avoid unsupported-flag failures across Codex versions.
  resumeArgs: ["exec", "resume", "{sessionId}"],
  output: "jsonl",
  resumeOutput: "text",
  input: "arg",
  modelArg: "--model",
  imageArg: "--image",
  sessionMode: "existing",
  serialize: true,
};

const DEFAULT_GEMINI_BACKEND: CliBackendConfig = {
  command: "gemini",
  args: ["--output-format", "json", "--approval-mode", "yolo"],
  resumeArgs: ["--output-format", "json", "--approval-mode", "yolo", "--resume", "{sessionId}"],
  output: "json",
  input: "arg",
  modelArg: "--model",
  modelAliases: GEMINI_MODEL_ALIASES,
  sessionMode: "existing",
  clearEnv: ["GEMINI_API_KEY"],
  serialize: true,
};

const CLAUDE_BACKEND_ALIASES = ["claude-cli", "anthropic", "claude"] as const;
const CODEX_BACKEND_ALIASES = ["codex-cli", "openai-codex", "openai", "codex"] as const;
const GEMINI_BACKEND_ALIASES = ["gemini-cli", "google-gemini-cli", "gemini"] as const;
const CLAUDE_BACKEND_ALIAS_SET = new Set(
  CLAUDE_BACKEND_ALIASES.map((alias) => normalizeBackendKey(alias)),
);
const CODEX_BACKEND_ALIAS_SET = new Set(
  CODEX_BACKEND_ALIASES.map((alias) => normalizeBackendKey(alias)),
);
const GEMINI_BACKEND_ALIAS_SET = new Set(
  GEMINI_BACKEND_ALIASES.map((alias) => normalizeBackendKey(alias)),
);
const LEGACY_CODEX_ARGS = [
  "exec",
  "--json",
  "--color",
  "never",
  "--sandbox",
  "read-only",
  "--skip-git-repo-check",
] as const;
const LEGACY_CODEX_RESUME_ARGS = [
  "exec",
  "resume",
  "{sessionId}",
  "--color",
  "never",
  "--sandbox",
  "read-only",
  "--skip-git-repo-check",
] as const;
const CODEX_BYPASS_FLAG = "--dangerously-bypass-approvals-and-sandbox" as const;
type CodexExecMode = typeof CODEX_BYPASS_FLAG | "workspace-write" | "read-only";

function normalizeBackendKey(key: string): string {
  return normalizeProviderId(key);
}

function pickBackendConfig(
  config: Record<string, CliBackendConfig>,
  normalizedId: string,
): CliBackendConfig | undefined {
  for (const [key, entry] of Object.entries(config)) {
    if (normalizeBackendKey(key) === normalizedId) {
      return entry;
    }
  }
  return undefined;
}

function pickBackendConfigByAliases(
  config: Record<string, CliBackendConfig>,
  aliases: readonly string[],
): CliBackendConfig | undefined {
  for (const alias of aliases) {
    const matched = pickBackendConfig(config, normalizeBackendKey(alias));
    if (matched) {
      return matched;
    }
  }
  return undefined;
}

function mergeBackendConfig(base: CliBackendConfig, override?: CliBackendConfig): CliBackendConfig {
  if (!override) {
    return { ...base };
  }
  return {
    ...base,
    ...override,
    args: override.args ?? base.args,
    env: { ...base.env, ...override.env },
    modelAliases: { ...base.modelAliases, ...override.modelAliases },
    clearEnv: Array.from(new Set([...(base.clearEnv ?? []), ...(override.clearEnv ?? [])])),
    sessionIdFields: override.sessionIdFields ?? base.sessionIdFields,
    sessionArgs: override.sessionArgs ?? base.sessionArgs,
    resumeArgs: override.resumeArgs ?? base.resumeArgs,
  };
}

function argsEqual(left?: string[], right?: readonly string[]): boolean {
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  return left.every((entry, index) => entry === right[index]);
}

export function resolveCodexExecModeArg(args?: string[]): CodexExecMode | undefined {
  if (!args) {
    return undefined;
  }
  if (args.includes(CODEX_BYPASS_FLAG)) {
    return CODEX_BYPASS_FLAG;
  }
  const index = args.indexOf("--sandbox");
  const value = index >= 0 ? args[index + 1] : undefined;
  return value === "workspace-write" || value === "read-only" ? value : undefined;
}

function setCodexExecModeArgs(args: string[] | undefined, mode: CodexExecMode): string[] {
  const nextArgs: string[] = [];
  const source = args ?? [];
  for (let i = 0; i < source.length; i += 1) {
    const entry = source[i];
    if (entry === CODEX_BYPASS_FLAG) {
      continue;
    }
    if (entry === "--sandbox") {
      i += 1;
      continue;
    }
    nextArgs.push(entry);
  }
  if (mode === CODEX_BYPASS_FLAG) {
    nextArgs.push(CODEX_BYPASS_FLAG);
  } else {
    nextArgs.push("--sandbox", mode);
  }
  return nextArgs;
}

function normalizeExecSecurity(execSecurity?: string | null): "deny" | "full" | undefined {
  const normalized = execSecurity?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === "deny") {
    return "deny";
  }
  return "full";
}

function resolveManagedCodexExecMode(
  cfg?: AnimaConfig,
  options?: CliBackendResolutionOptions,
): CodexExecMode {
  const execSecurity = normalizeExecSecurity(options?.execSecurity);
  if (execSecurity === "deny") {
    return "read-only";
  }
  const workspaceAccess = cfg?.agents?.defaults?.sandbox?.workspaceAccess;
  if (workspaceAccess === "ro") {
    return "read-only";
  }
  if (workspaceAccess === "rw") {
    return "workspace-write";
  }
  return CODEX_BYPASS_FLAG;
}

export function resolveCliBackendIds(cfg?: AnimaConfig): Set<string> {
  const ids = new Set<string>([
    ...CLAUDE_BACKEND_ALIASES.map((alias) => normalizeBackendKey(alias)),
    ...CODEX_BACKEND_ALIASES.map((alias) => normalizeBackendKey(alias)),
    ...GEMINI_BACKEND_ALIASES.map((alias) => normalizeBackendKey(alias)),
  ]);
  const configured = cfg?.agents?.defaults?.cliBackends ?? {};
  for (const key of Object.keys(configured)) {
    ids.add(normalizeBackendKey(key));
  }
  return ids;
}

export function resolveCliBackendConfig(
  provider: string,
  cfg?: AnimaConfig,
  options?: CliBackendResolutionOptions,
): ResolvedCliBackend | null {
  const normalized = normalizeBackendKey(provider);
  const configured = cfg?.agents?.defaults?.cliBackends ?? {};
  if (CLAUDE_BACKEND_ALIAS_SET.has(normalized)) {
    const override = pickBackendConfigByAliases(configured, [provider, ...CLAUDE_BACKEND_ALIASES]);
    const merged = mergeBackendConfig(DEFAULT_CLAUDE_BACKEND, override);
    const command = merged.command?.trim();
    if (!command) {
      return null;
    }
    return { id: normalizeBackendKey("claude-cli"), config: { ...merged, command } };
  }
  if (CODEX_BACKEND_ALIAS_SET.has(normalized)) {
    const override = pickBackendConfigByAliases(configured, [provider, ...CODEX_BACKEND_ALIASES]);
    let merged = mergeBackendConfig(DEFAULT_CODEX_BACKEND, override);

    if (argsEqual(merged.args, LEGACY_CODEX_ARGS)) {
      merged = { ...merged, args: DEFAULT_CODEX_BACKEND.args };
    }

    if (argsEqual(merged.resumeArgs, LEGACY_CODEX_RESUME_ARGS)) {
      merged = { ...merged, resumeArgs: DEFAULT_CODEX_BACKEND.resumeArgs };
    }

    const overrideExecMode = resolveCodexExecModeArg(override?.args);
    const manageExecMode =
      !overrideExecMode || (override?.args ? argsEqual(override.args, LEGACY_CODEX_ARGS) : false);
    if (manageExecMode) {
      merged = {
        ...merged,
        args: setCodexExecModeArgs(merged.args, resolveManagedCodexExecMode(cfg, options)),
      };
    }

    const command = merged.command?.trim();
    if (!command) {
      return null;
    }
    return { id: normalizeBackendKey("codex-cli"), config: { ...merged, command } };
  }
  if (GEMINI_BACKEND_ALIAS_SET.has(normalized)) {
    const override = pickBackendConfigByAliases(configured, [provider, ...GEMINI_BACKEND_ALIASES]);
    const merged = mergeBackendConfig(DEFAULT_GEMINI_BACKEND, override);
    const command = merged.command?.trim();
    if (!command) {
      return null;
    }
    return { id: normalizeBackendKey("gemini-cli"), config: { ...merged, command } };
  }

  const override = pickBackendConfig(configured, normalized);
  if (!override) {
    return null;
  }
  const command = override.command?.trim();
  if (!command) {
    return null;
  }
  return { id: normalized, config: { ...override, command } };
}
