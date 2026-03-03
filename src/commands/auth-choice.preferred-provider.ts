import type { AuthChoice } from "./onboard-types.js";

const PREFERRED_PROVIDER_BY_AUTH_CHOICE: Partial<Record<AuthChoice, string>> = {
  noxsoft: "anthropic",
  openaiCodex: "openai-codex",
  apiKey: "anthropic",
};

export function resolvePreferredProviderForAuthChoice(choice: AuthChoice): string | undefined {
  return PREFERRED_PROVIDER_BY_AUTH_CHOICE[choice];
}
