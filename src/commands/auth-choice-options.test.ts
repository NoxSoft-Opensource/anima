import { describe, expect, it } from "vitest";
import type { AuthProfileStore } from "../agents/auth-profiles.js";
import {
  buildAuthChoiceGroups,
  buildAuthChoiceOptions,
  formatAuthChoiceChoicesForCli,
} from "./auth-choice-options.js";

const AUTH_STORE_STUB: AuthProfileStore = {
  profiles: {},
  order: {},
};

describe("auth-choice-options", () => {
  it("includes openaiCodex in CLI auth-choice values", () => {
    expect(formatAuthChoiceChoicesForCli()).toContain("openaiCodex");
  });

  it("includes openaiCodex in grouped auth choices", () => {
    const result = buildAuthChoiceGroups({
      store: AUTH_STORE_STUB,
      includeSkip: true,
    });
    const group = result.groups.find((entry) => entry.value === "openaiCodex");
    expect(group?.options.map((option) => option.value)).toContain("openaiCodex");
  });

  it("adds skip option only when requested", () => {
    const withSkip = buildAuthChoiceOptions({
      store: AUTH_STORE_STUB,
      includeSkip: true,
    });
    const withoutSkip = buildAuthChoiceOptions({
      store: AUTH_STORE_STUB,
      includeSkip: false,
    });

    expect(withSkip.some((option) => option.value === "skip")).toBe(true);
    expect(withoutSkip.some((option) => option.value === "skip")).toBe(false);
  });
});
