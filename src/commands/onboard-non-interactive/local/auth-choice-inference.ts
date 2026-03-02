import type { AuthChoice, OnboardOptions } from "../../onboard-types.js";
import { ONBOARD_PROVIDER_AUTH_FLAGS } from "../../onboard-provider-auth-flags.js";

type AuthChoiceFlag = {
  optionKey: string;
  authChoice: AuthChoice;
  label: string;
};

export type AuthChoiceInference = {
  choice?: AuthChoice;
  matches: AuthChoiceFlag[];
};

function hasStringValue(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

// Infer auth choice from explicit provider API key flags.
export function inferAuthChoiceFromFlags(opts: OnboardOptions): AuthChoiceInference {
  const matches: AuthChoiceFlag[] = ONBOARD_PROVIDER_AUTH_FLAGS.filter(({ optionKey }) =>
    hasStringValue(opts[optionKey]),
  ).map((flag) => ({
    optionKey: flag.optionKey,
    authChoice: flag.authChoice,
    label: flag.cliFlag,
  }));

  return {
    choice: matches[0]?.authChoice,
    matches,
  };
}
