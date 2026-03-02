import type { AuthChoice } from "./onboard-types.js";

export const AUTH_CHOICE_LEGACY_ALIASES_FOR_CLI: ReadonlyArray<AuthChoice> = [];

export function normalizeLegacyOnboardAuthChoice(
  authChoice: AuthChoice | undefined,
): AuthChoice | undefined {
  return authChoice;
}

export function isDeprecatedAuthChoice(_authChoice: AuthChoice | undefined): boolean {
  return false;
}
