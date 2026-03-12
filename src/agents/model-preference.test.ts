import { describe, expect, it } from "vitest";
import type { AnimaConfig } from "../config/config.js";
import {
  orderCandidatesByPreference,
  resolveUsageAwareModelPreference,
} from "./model-preference.js";

const cfg = {
  models: {
    providers: {
      openai: {
        baseUrl: "https://api.openai.com/v1",
        models: [
          {
            id: "cheap",
            name: "Cheap",
            reasoning: true,
            input: ["text"],
            cost: {
              input: 0.1,
              output: 0.2,
              cacheRead: 0,
              cacheWrite: 0,
            },
            contextWindow: 128_000,
            maxTokens: 8_192,
          },
          {
            id: "expensive",
            name: "Expensive",
            reasoning: true,
            input: ["text"],
            cost: {
              input: 5,
              output: 15,
              cacheRead: 0,
              cacheWrite: 0,
            },
            contextWindow: 128_000,
            maxTokens: 8_192,
          },
        ],
      },
    },
  },
} as unknown as AnimaConfig;

describe("resolveUsageAwareModelPreference", () => {
  it("prefers stronger models for high think levels", () => {
    expect(resolveUsageAwareModelPreference({ thinkLevel: "high" })).toBe("prefer-strong");
    expect(resolveUsageAwareModelPreference({ thinkLevel: "xhigh" })).toBe("prefer-strong");
  });

  it("prefers cheaper models for heavy sessions", () => {
    expect(
      resolveUsageAwareModelPreference({
        thinkLevel: "low",
        sessionEntry: {
          sessionEstimatedCostUsdTotal: 0.75,
        },
      }),
    ).toBe("prefer-cheap");
  });

  it("preserves explicit session overrides", () => {
    expect(
      resolveUsageAwareModelPreference({
        thinkLevel: "xhigh",
        sessionEntry: {
          modelOverride: "gpt-5.3-codex",
          sessionEstimatedCostUsdTotal: 10,
        },
      }),
    ).toBe("preserve");
  });
});

describe("orderCandidatesByPreference", () => {
  it("moves cheaper scored models ahead while keeping unknown-cost slots stable", () => {
    const candidates = [
      { provider: "openai", model: "expensive" },
      { provider: "custom", model: "unknown" },
      { provider: "openai", model: "cheap" },
    ];

    expect(
      orderCandidatesByPreference({
        candidates,
        cfg,
        preferenceMode: "prefer-cheap",
      }),
    ).toEqual([
      { provider: "openai", model: "cheap" },
      { provider: "custom", model: "unknown" },
      { provider: "openai", model: "expensive" },
    ]);
  });

  it("moves pricier scored models ahead while keeping unknown-cost slots stable", () => {
    const candidates = [
      { provider: "openai", model: "cheap" },
      { provider: "custom", model: "unknown" },
      { provider: "openai", model: "expensive" },
    ];

    expect(
      orderCandidatesByPreference({
        candidates,
        cfg,
        preferenceMode: "prefer-strong",
      }),
    ).toEqual([
      { provider: "openai", model: "expensive" },
      { provider: "custom", model: "unknown" },
      { provider: "openai", model: "cheap" },
    ]);
  });
});
