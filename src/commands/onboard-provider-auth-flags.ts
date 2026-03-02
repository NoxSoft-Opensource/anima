import type { AuthChoice, OnboardOptions } from "./onboard-types.js";

export type OnboardProviderAuthFlag = {
  optionKey: keyof Pick<OnboardOptions, "anthropicApiKey">;
  authChoice: AuthChoice;
  cliFlag: `--${string}`;
  cliOption: `--${string} <key>`;
  description: string;
};

// Only Anthropic API key flag remains.
export const ONBOARD_PROVIDER_AUTH_FLAGS: ReadonlyArray<OnboardProviderAuthFlag> = [
  {
    optionKey: "anthropicApiKey",
    authChoice: "apiKey",
    cliFlag: "--anthropic-api-key",
    cliOption: "--anthropic-api-key <key>",
    description: "Anthropic API key",
  },
];
