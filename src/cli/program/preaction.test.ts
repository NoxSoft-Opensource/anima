import { describe, expect, it } from "vitest";
import { shouldRunNoxsoftAuthPreflight } from "./preaction.js";

describe("shouldRunNoxsoftAuthPreflight", () => {
  it("runs for regular commands", () => {
    expect(shouldRunNoxsoftAuthPreflight({ commandPath: ["status"], env: {} })).toBe(true);
    expect(shouldRunNoxsoftAuthPreflight({ commandPath: ["models", "list"], env: {} })).toBe(true);
    expect(shouldRunNoxsoftAuthPreflight({ commandPath: [], env: {} })).toBe(true);
  });

  it("skips commands with explicit auth flows", () => {
    expect(shouldRunNoxsoftAuthPreflight({ commandPath: ["onboard"], env: {} })).toBe(false);
    expect(shouldRunNoxsoftAuthPreflight({ commandPath: ["setup"], env: {} })).toBe(false);
    expect(shouldRunNoxsoftAuthPreflight({ commandPath: ["register"], env: {} })).toBe(false);
    expect(shouldRunNoxsoftAuthPreflight({ commandPath: ["completion"], env: {} })).toBe(false);
  });

  it("skips in test mode and when explicitly disabled", () => {
    expect(
      shouldRunNoxsoftAuthPreflight({
        commandPath: ["status"],
        env: { VITEST: "true" },
      }),
    ).toBe(false);

    expect(
      shouldRunNoxsoftAuthPreflight({
        commandPath: ["status"],
        env: { ANIMA_SKIP_NOXSOFT_AUTH_PREACTION: "1" },
      }),
    ).toBe(false);
  });
});
