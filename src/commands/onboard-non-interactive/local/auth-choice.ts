import type { AnimaConfig } from "../../../config/config.js";
import type { RuntimeEnv } from "../../../runtime.js";
import type { AuthChoice, OnboardOptions } from "../../onboard-types.js";
import { applyAuthProfileConfig, setAnthropicApiKey } from "../../onboard-auth.js";
import { resolveNonInteractiveApiKey } from "../api-keys.js";

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

  if (authChoice === "noxsoft") {
    // NoxSoft auth is handled by the NoxSoft auth module, not here.
    // The Anthropic API key is still resolved from env vars.
    return nextConfig;
  }

  return nextConfig;
}
