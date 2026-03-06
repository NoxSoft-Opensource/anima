/**
 * anima setup-token
 *
 * The fastest path to a working ANIMA agent — no CLI binary login needed.
 *
 * Accepts an Anthropic API key or Claude Code OAuth token, validates it
 * against the live API, saves it to the auth profile store, and optionally
 * boots the daemon.
 *
 * Token formats supported:
 *   sk-ant-api01-...  Console API key    (console.anthropic.com/settings/keys)
 *   sk-ant-oat01-...  Claude Code OAuth  (auto-detected from an existing Claude Code install)
 */

import type { RuntimeEnv } from "../runtime.js";
import { intro, outro, text, confirm, spinner, note, cancel } from "@clack/prompts";
import { loadAuthProfileStore, saveAuthProfileStore } from "../agents/auth-profiles/store.js";
import { readClaudeCliCredentials, readOpenClawCredentials } from "../agents/cli-credentials.js";
import { testAnthropicToken } from "../agents/anthropic-direct-runner.js";
import { defaultRuntime } from "../runtime.js";
import { resolveUserPath } from "../utils.js";
import path from "node:path";

export type SetupTokenOptions = {
  /** Pre-supplied token (skip the prompt) */
  token?: string;
  /** Skip the live API validation check */
  skipValidation?: boolean;
  /** Output JSON summary instead of human-readable output */
  json?: boolean;
};

const PROFILE_ID = "anthropic:default";

/** Check if ANIMA already has a usable Anthropic token in the auth store. */
export function hasAnthropicToken(): boolean {
  try {
    const store = loadAuthProfileStore();
    const profile = store.profiles[PROFILE_ID];
    if (!profile) {
      return false;
    }
    if (profile.type === "token" && profile.token) {
      return true;
    }
    if (profile.type === "oauth" && profile.access) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Auto-detect a usable Anthropic token from the environment.
 * Priority order:
 *   1. ANTHROPIC_API_KEY env var
 *   2. CLAUDE_API_KEY env var
 *   3. Claude Code CLI credentials (Keychain / Windows Credential Manager / file)
 *   4. OpenClaw auth-profiles.json (same auth infrastructure)
 */
function autoDetectToken(): string | null {
  const envKey = process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY;
  if (envKey?.startsWith("sk-ant-")) {
    return envKey;
  }

  const cliCred = readClaudeCliCredentials({ allowKeychainPrompt: false });
  if (cliCred) {
    if (cliCred.type === "token" && cliCred.token) {
      return cliCred.token;
    }
    if (cliCred.type === "oauth" && cliCred.access) {
      return cliCred.access;
    }
  }

  const openClawCred = readOpenClawCredentials();
  if (openClawCred) {
    if (openClawCred.type === "token" && openClawCred.token) {
      return openClawCred.token;
    }
    if (openClawCred.type === "oauth" && openClawCred.access) {
      return openClawCred.access;
    }
  }

  return null;
}

function isValidTokenFormat(token: string): boolean {
  return (
    token.startsWith("sk-ant-api01-") ||
    token.startsWith("sk-ant-oat01-") ||
    token.startsWith("sk-ant-") // future formats
  );
}

export async function setupTokenCommand(
  opts: SetupTokenOptions = {},
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  if (opts.json) {
    await setupTokenJson(opts);
    return;
  }

  intro(" ANIMA — API Token Setup ");

  // Try auto-detection first
  const autoToken = autoDetectToken();
  let token = opts.token?.trim() ?? "";

  if (!token && autoToken) {
    const masked = autoToken.slice(0, 16) + "…" + autoToken.slice(-4);
    note(
      [
        `Found existing Claude/Anthropic credentials on this machine:`,
        `  ${masked}`,
        ``,
        `ANIMA can use these automatically.`,
      ].join("\n"),
      "Auto-detected ✓",
    );

    const useAuto = await confirm({
      message: "Use these credentials?",
      initialValue: true,
    });

    if (useAuto === true) {
      token = autoToken;
    }
  }

  // Prompt if we still don't have a token
  if (!token) {
    note(
      [
        "You need an Anthropic API key or Claude Code token to power ANIMA.",
        "",
        "  Option A — Console API Key (easiest):",
        "    1. Go to: https://console.anthropic.com/settings/keys",
        "    2. Click 'Create Key'",
        "    3. Paste it below",
        "",
        "  Option B — Claude Code OAuth token (if you have Claude Code installed):",
        "    Run:  claude login  (one-time browser flow)",
        "    Then: ANIMA will pick it up automatically next time.",
        "",
        "  Token format: sk-ant-api01-... or sk-ant-oat01-...",
      ].join("\n"),
      "Getting your API key",
    );

    const entered = await text({
      message: "Paste your Anthropic API key:",
      placeholder: "sk-ant-api01-...",
      validate: (val) => {
        if (!val.trim()) {
          return "Token is required.";
        }
        if (!isValidTokenFormat(val.trim())) {
          return "Token should start with sk-ant- (Anthropic format).";
        }
      },
    });

    if (!entered || typeof entered !== "string") {
      cancel("Setup cancelled.");
      runtime.exit(0);
      return;
    }

    token = entered.trim();
  }

  if (!isValidTokenFormat(token)) {
    cancel(`Invalid token format. Expected sk-ant-... Got: ${token.slice(0, 20)}...`);
    runtime.exit(1);
    return;
  }

  // Validate the token against the live API
  if (opts.skipValidation !== true) {
    const s = spinner();
    s.start("Validating token against api.anthropic.com…");

    const result = await testAnthropicToken(token);

    if (!result.ok) {
      s.stop("Token validation failed ✗");
      note(
        [
          `The token could not be verified:`,
          `  ${result.error ?? "Unknown error"}`,
          ``,
          `Check that the key is valid and has not been revoked.`,
          `Visit: https://console.anthropic.com/settings/keys`,
        ].join("\n"),
        "Token invalid",
      );
      runtime.exit(1);
      return;
    }

    s.stop("Token valid ✓  (api.anthropic.com responded)");
  }

  // Save to auth profile store
  const store = loadAuthProfileStore();
  store.profiles[PROFILE_ID] = {
    type: "token",
    provider: "anthropic",
    token,
  };
  store.lastGood ??= {};
  store.lastGood.anthropic = PROFILE_ID;
  saveAuthProfileStore(store);

  const masked = token.slice(0, 16) + "…" + token.slice(-4);
  outro(
    [
      `Token saved to: ~/.anima/agents/main/agent/auth-profiles.json`,
      `Profile:        ${PROFILE_ID}`,
      `Token:          ${masked}`,
      ``,
      `ANIMA will now use this token for all agent turns — no claude CLI login needed.`,
      ``,
      `Next steps:`,
      `  anima start    — launch the gateway and dashboard`,
      `  anima wander   — run an autonomous heartbeat session`,
      `  anima agent    — send a one-shot message`,
    ].join("\n"),
  );
}

/** Non-interactive JSON mode for scripting and CI */
async function setupTokenJson(opts: SetupTokenOptions): Promise<void> {
  const token = opts.token?.trim() ?? autoDetectToken() ?? "";

  if (!token) {
    console.log(
      JSON.stringify({
        ok: false,
        error: "No token provided. Pass --token or set ANTHROPIC_API_KEY.",
      }),
    );
    process.exit(1);
    return;
  }

  if (!isValidTokenFormat(token)) {
    console.log(JSON.stringify({ ok: false, error: "Invalid token format." }));
    process.exit(1);
    return;
  }

  if (opts.skipValidation !== true) {
    const result = await testAnthropicToken(token);
    if (!result.ok) {
      console.log(JSON.stringify({ ok: false, error: result.error }));
      process.exit(1);
      return;
    }
  }

  const store = loadAuthProfileStore();
  store.profiles[PROFILE_ID] = { type: "token", provider: "anthropic", token };
  store.lastGood ??= {};
  store.lastGood.anthropic = PROFILE_ID;
  saveAuthProfileStore(store);

  console.log(JSON.stringify({ ok: true, profileId: PROFILE_ID }));
}

export { autoDetectToken };
