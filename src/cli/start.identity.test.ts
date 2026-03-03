import { describe, expect, it } from "vitest";
import { resolveStartupIdentityName } from "./start.js";

describe("resolveStartupIdentityName", () => {
  it("prefers ui assistant identity", () => {
    const name = resolveStartupIdentityName({
      ui: { assistant: { name: "Axiom" } },
      agents: {
        list: [{ id: "main", default: true, identity: { name: "Fallback" } }],
      },
    });
    expect(name).toBe("Axiom");
  });

  it("falls back to agent identity", () => {
    const name = resolveStartupIdentityName({
      agents: {
        list: [{ id: "main", default: true, identity: { name: "Forge" } }],
      },
    });
    expect(name).toBe("Forge");
  });

  it("uses built-in default when no identity is configured", () => {
    const name = resolveStartupIdentityName({});
    expect(name).toBe("Assistant");
  });
});
