import { describe, expect, it } from "vitest";
import { findLegacyConfigIssues } from "../config/legacy.js";
import { validateConfigObjectRawWithPlugins } from "../config/validation.js";
import { buildDefaultAnimaConfig } from "./init.js";

describe("buildDefaultAnimaConfig", () => {
  it("produces a schema-valid config", () => {
    const config = buildDefaultAnimaConfig();
    const result = validateConfigObjectRawWithPlugins(config);
    expect(result.ok).toBe(true);
  });

  it("does not emit legacy config keys", () => {
    const config = buildDefaultAnimaConfig();
    const issues = findLegacyConfigIssues(config);
    expect(issues).toHaveLength(0);
  });

  it("enables 5-minute heartbeat by default", () => {
    const config = buildDefaultAnimaConfig();
    expect(config.agents?.defaults?.heartbeat?.every).toBe("5m");
  });
});
