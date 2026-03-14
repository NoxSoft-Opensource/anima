import type { AuthProfileStore } from "../agents/auth-profiles.js";
import type { AuthChoice, AuthChoiceGroupId } from "./onboard-types.js";

export type { AuthChoiceGroupId };

export type AuthChoiceOption = {
  value: AuthChoice;
  label: string;
  hint?: string;
};
export type AuthChoiceGroup = {
  value: AuthChoiceGroupId;
  label: string;
  hint?: string;
  options: AuthChoiceOption[];
};

const AUTH_CHOICE_GROUP_DEFS: {
  value: AuthChoiceGroupId;
  label: string;
  hint?: string;
  choices: AuthChoice[];
}[] = [
  {
    value: "noxsoft",
    label: "Platform Identity",
    hint: "NoxSoft account link for platform access (not a model backend)",
    choices: ["noxsoft"],
  },
  {
    value: "openaiCodex",
    label: "OpenAI Codex OAuth",
    hint: "Import Codex CLI OAuth credentials for latest GPT Codex models",
    choices: ["openaiCodex"],
  },
  {
    value: "anthropic",
    label: "Anthropic API Key",
    hint: "Direct Anthropic API key for Claude",
    choices: ["apiKey"],
  },
  {
    value: "gemini",
    label: "Google Gemini API Key",
    hint: "Direct Google API key for Gemini models",
    choices: ["geminiApiKey"],
  },
];

const BASE_AUTH_CHOICE_OPTIONS: ReadonlyArray<AuthChoiceOption> = [
  {
    value: "noxsoft",
    label: "NoxSoft Platform Account",
    hint: "Account link for NoxSoft platform access",
  },
  {
    value: "openaiCodex",
    label: "OpenAI Codex OAuth",
    hint: "Use Codex CLI credentials (gpt-5.2-codex)",
  },
  { value: "apiKey", label: "Anthropic API key" },
  { value: "geminiApiKey", label: "Google Gemini API key", hint: "For Gemini 2.0 models" },
];

export function formatAuthChoiceChoicesForCli(params?: {
  includeSkip?: boolean;
  includeLegacyAliases?: boolean;
}): string {
  const includeSkip = params?.includeSkip ?? true;
  const values: string[] = BASE_AUTH_CHOICE_OPTIONS.map((opt) => opt.value);

  if (includeSkip) {
    values.push("skip");
  }

  return values.join("|");
}

export function buildAuthChoiceOptions(params: {
  store: AuthProfileStore;
  includeSkip: boolean;
}): AuthChoiceOption[] {
  void params.store;
  const options: AuthChoiceOption[] = [...BASE_AUTH_CHOICE_OPTIONS];

  if (params.includeSkip) {
    options.push({ value: "skip", label: "Skip for now" });
  }

  return options;
}

export function buildAuthChoiceGroups(params: { store: AuthProfileStore; includeSkip: boolean }): {
  groups: AuthChoiceGroup[];
  skipOption?: AuthChoiceOption;
} {
  const options = buildAuthChoiceOptions({
    ...params,
    includeSkip: false,
  });
  const optionByValue = new Map<AuthChoice, AuthChoiceOption>(
    options.map((opt) => [opt.value, opt]),
  );

  const groups = AUTH_CHOICE_GROUP_DEFS.map((group) => ({
    ...group,
    options: group.choices
      .map((choice) => optionByValue.get(choice))
      .filter((opt): opt is AuthChoiceOption => Boolean(opt)),
  }));

  const skipOption = params.includeSkip
    ? ({ value: "skip", label: "Skip for now" } satisfies AuthChoiceOption)
    : undefined;

  return { groups, skipOption };
}
