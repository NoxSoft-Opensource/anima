import type { AnimaConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import type { AuthChoice } from "./onboard-types.js";
import { applyAuthChoiceAnthropic } from "./auth-choice.apply.anthropic.js";

export type ApplyAuthChoiceParams = {
  authChoice: AuthChoice;
  config: AnimaConfig;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  agentDir?: string;
  setDefaultModel: boolean;
  agentId?: string;
  opts?: {
    tokenProvider?: string;
    token?: string;
  };
};

export type ApplyAuthChoiceResult = {
  config: AnimaConfig;
  agentModelOverride?: string;
};

export async function applyAuthChoice(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult> {
  const result = await applyAuthChoiceAnthropic(params);
  if (result) {
    return result;
  }

  return { config: params.config };
}
