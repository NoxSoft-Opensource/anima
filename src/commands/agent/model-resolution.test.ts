import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../agents/model-catalog.js", () => ({
  loadModelCatalog: vi.fn(),
}));

import type { AnimaConfig } from "../../config/config.js";
import { loadModelCatalog } from "../../agents/model-catalog.js";
import { resolveAgentModelSelection } from "./model-resolution.js";

describe("resolveAgentModelSelection", () => {
  beforeEach(() => {
    vi.mocked(loadModelCatalog).mockReset();
    vi.mocked(loadModelCatalog).mockResolvedValue([]);
  });

  it("prefers an explicit model override", async () => {
    const cfg = {
      agents: {
        defaults: {
          model: { primary: "google/gemini-flash-latest" },
          models: {
            "google/gemini-flash-latest": {},
            "openai/gpt-5.2-codex": {},
          },
        },
      },
    } as AnimaConfig;

    const resolved = await resolveAgentModelSelection({
      cfg,
      explicitModel: "openai/gpt-5.2-codex",
    });

    expect(resolved.provider).toBe("openai-codex");
    expect(resolved.model).toBe("gpt-5.2-codex");
    expect(resolved.source).toBe("explicit");
  });

  it("uses a valid stored session override when no explicit model is provided", async () => {
    const cfg = {
      agents: {
        defaults: {
          model: { primary: "anthropic/claude-opus-4-5" },
          models: {
            "anthropic/claude-opus-4-5": {},
            "openai/gpt-4.1-mini": {},
          },
        },
      },
    } as AnimaConfig;

    const resolved = await resolveAgentModelSelection({
      cfg,
      sessionEntry: {
        sessionId: "s1",
        updatedAt: Date.now(),
        providerOverride: "openai",
        modelOverride: "gpt-4.1-mini",
      },
    });

    expect(resolved.provider).toBe("openai");
    expect(resolved.model).toBe("gpt-4.1-mini");
    expect(resolved.source).toBe("session");
    expect(resolved.storedOverrideValid).toBe(true);
  });

  it("falls back to the default model when a stored override is not allowed", async () => {
    const cfg = {
      agents: {
        defaults: {
          model: { primary: "anthropic/claude-opus-4-5" },
          models: {
            "anthropic/claude-opus-4-5": {},
          },
        },
      },
    } as AnimaConfig;

    const resolved = await resolveAgentModelSelection({
      cfg,
      sessionEntry: {
        sessionId: "s1",
        updatedAt: Date.now(),
        providerOverride: "openrouter",
        modelOverride: "moonshotai/kimi-k2",
      },
    });

    expect(resolved.provider).toBe("anthropic");
    expect(resolved.model).toBe("claude-opus-4-5");
    expect(resolved.source).toBe("default");
    expect(resolved.storedOverrideValid).toBe(false);
  });
});
