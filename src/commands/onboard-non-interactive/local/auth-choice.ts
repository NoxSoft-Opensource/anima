import type { AnimaConfig } from "../../../config/config.js";
import type { RuntimeEnv } from "../../../runtime.js";
import type { AuthChoice, OnboardOptions } from "../../onboard-types.js";
import { readCodexCliCredentialsCached } from "../../../agents/cli-credentials.js";
import { applyPrimaryModel } from "../../model-picker.js";
import {
  applyAuthProfileConfig,
  setAnthropicApiKey,
  writeOAuthCredentials,
} from "../../onboard-auth.js";
import { resolveNonInteractiveApiKey } from "../api-keys.js";

const OPENAI_CODEX_PROVIDER = "openai-codex";
const OPENAI_CODEX_PROFILE_ID = "openai-codex:default";
const OPENAI_CODEX_DEFAULT_MODEL = "openai-codex/gpt-5.2-codex";
const OPENAI_CODEX_LOGIN_COMMAND = "anima models auth login --provider openai-codex";

export async function applyNonInteractiveAuthChoice(params: {
  nextConfig: AnimaConfig;
  authChoice: AuthChoice;
  opts: OnboardOptions;
  runtime: RuntimeEnv;
  baseConfig: AnimaConfig;
}): Promise<AnimaConfig | null> {
  const { authChoice, opts, runtime, baseConfig } = params;
  let nextConfig = params.nextConfig;

  if (authChoice === "apiKey") {
    const resolved = await resolveNonInteractiveApiKey({
      provider: "anthropic",
      cfg: baseConfig,
      flagValue: opts.anthropicApiKey,
      flagName: "--anthropic-api-key",
      envVar: "ANTHROPIC_API_KEY",
      runtime,
    });
    if (!resolved) {
      return null;
    }
    if (resolved.source !== "profile") {
      await setAnthropicApiKey(resolved.key);
    }
    return applyAuthProfileConfig(nextConfig, {
      profileId: "anthropic:default",
      provider: "anthropic",
      mode: "api_key",
    });
  }

  if (authChoice === "openaiCodex") {
    const credentials = readCodexCliCredentialsCached({ ttlMs: 30_000 });
    if (!credentials) {
      runtime.error(
        [
          "OpenAI Codex credentials were not found.",
          `Run \`${OPENAI_CODEX_LOGIN_COMMAND}\` and re-run onboarding.`,
        ].join("\n"),
      );
      runtime.exit(1);
      return null;
    }

    await writeOAuthCredentials(OPENAI_CODEX_PROVIDER, credentials);
    nextConfig = applyAuthProfileConfig(nextConfig, {
      profileId: OPENAI_CODEX_PROFILE_ID,
      provider: OPENAI_CODEX_PROVIDER,
      mode: "oauth",
    });
    return applyPrimaryModel(nextConfig, OPENAI_CODEX_DEFAULT_MODEL);
  }

  if (authChoice === "noxsoft") {
    // NoxSoft auth is handled by the NoxSoft auth module, not here.
    // The Anthropic API key is still resolved from env vars.
    return nextConfig;
  }

  return nextConfig;
}
