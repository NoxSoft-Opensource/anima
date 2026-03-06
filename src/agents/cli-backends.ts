import type { AnimaConfig } from "../config/config.js";
import type { CliBackendConfig } from "../config/types.js";
import { normalizeProviderId } from "./model-selection.js";

export type ResolvedCliBackend = {
  id: string;
  config: CliBackendConfig;
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
  args: ["exec", "--json", "--color", "never", "--sandbox", "read-only", "--skip-git-repo-check"],
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

const CLAUDE_BACKEND_ALIASES = ["claude-cli", "anthropic", "claude"] as const;
const CODEX_BACKEND_ALIASES = ["codex-cli", "openai-codex", "openai", "codex"] as const;
const CLAUDE_BACKEND_ALIAS_SET = new Set(
  CLAUDE_BACKEND_ALIASES.map((alias) => normalizeBackendKey(alias)),
);
const CODEX_BACKEND_ALIAS_SET = new Set(
  CODEX_BACKEND_ALIASES.map((alias) => normalizeBackendKey(alias)),
);

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

export function resolveCliBackendIds(cfg?: AnimaConfig): Set<string> {
  const ids = new Set<string>([
    ...CLAUDE_BACKEND_ALIASES.map((alias) => normalizeBackendKey(alias)),
    ...CODEX_BACKEND_ALIASES.map((alias) => normalizeBackendKey(alias)),
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
    const merged = mergeBackendConfig(DEFAULT_CODEX_BACKEND, override);
    const command = merged.command?.trim();
    if (!command) {
      return null;
    }
    return { id: normalizeBackendKey("codex-cli"), config: { ...merged, command } };
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
