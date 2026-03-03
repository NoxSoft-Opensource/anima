import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { readCodexCliCredentialsCached } from "../agents/cli-credentials.js";
import { applyPrimaryModel } from "./model-picker.js";
import { applyAuthProfileConfig, writeOAuthCredentials } from "./onboard-auth.js";

const OPENAI_CODEX_PROVIDER = "openai-codex";
const OPENAI_CODEX_PROFILE_ID = "openai-codex:default";
const OPENAI_CODEX_DEFAULT_MODEL = "openai-codex/gpt-5.3-codex";
const OPENAI_CODEX_LOGIN_COMMAND = "anima models auth login --provider openai-codex";

export async function applyAuthChoiceOpenAICodex(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "openaiCodex") {
    return null;
  }

  if (params.opts?.tokenProvider && params.opts.tokenProvider !== OPENAI_CODEX_PROVIDER) {
    return null;
  }

  const credentials = readCodexCliCredentialsCached({ ttlMs: 30_000 });
  if (!credentials) {
    await params.prompter.note(
      [
        "OpenAI Codex credentials were not found.",
        `Run \`${OPENAI_CODEX_LOGIN_COMMAND}\` and re-run onboarding.`,
      ].join("\n"),
      "OpenAI Codex auth",
    );
    return { config: params.config };
  }

  await writeOAuthCredentials(OPENAI_CODEX_PROVIDER, credentials, params.agentDir);
  let nextConfig = applyAuthProfileConfig(params.config, {
    profileId: OPENAI_CODEX_PROFILE_ID,
    provider: OPENAI_CODEX_PROVIDER,
    mode: "oauth",
  });

  if (params.setDefaultModel) {
    nextConfig = applyPrimaryModel(nextConfig, OPENAI_CODEX_DEFAULT_MODEL);
    await params.prompter.note(
      `Default model set to ${OPENAI_CODEX_DEFAULT_MODEL}`,
      "Model configured",
    );
    return { config: nextConfig };
  }

  return {
    config: nextConfig,
    agentModelOverride: OPENAI_CODEX_DEFAULT_MODEL,
  };
}
