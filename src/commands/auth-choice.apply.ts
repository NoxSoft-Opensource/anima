import type { AnimaConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import type { AuthChoice } from "./onboard-types.js";
import { ensureAuthenticated } from "../auth/noxsoft-auth.js";
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
  if (params.authChoice === "noxsoft") {
    const auth = await ensureAuthenticated({
      description: "ANIMA auth profile selection",
    });
    params.runtime.log(
      `NoxSoft ${auth.registered ? "registered" : "authenticated"}: ${auth.agent.display_name} (@${auth.agent.name})`,
    );
    return { config: params.config };
  }

  const result = await applyAuthChoiceAnthropic(params);
  if (result) {
    return result;
  }

  return { config: params.config };
}
