import { describe, expect, it } from "vitest";
import type { AnimaConfig } from "../config/config.js";
import { AnimaSchema } from "../config/zod-schema.js";
import { applyAutoModelRouting, resolveWorkingModeModelSelection } from "./model-auto.js";

const cfg = {
  agents: {
    defaults: {
      model: {
        primary: "anthropic/claude-opus-4-6",
        auto: {
          enabled: true,
          byWorkingMode: {
            read: ["openai/gpt-5-mini"],
            write: ["code"],
          },
        },
      },
      models: {
        "openai-codex/gpt-5.2-codex": {
          alias: "code",
        },
      },
    },
  },
} as AnimaConfig;

describe("resolveWorkingModeModelSelection", () => {
  it("accepts model.auto.byWorkingMode in config schema", () => {
    const parsed = AnimaSchema.parse(cfg);
    expect(parsed.agents?.defaults?.model?.auto?.byWorkingMode?.read).toEqual([
      "openai/gpt-5-mini",
    ]);
    expect(parsed.agents?.defaults?.model?.auto?.byWorkingMode?.write).toEqual(["code"]);
  });

  it("resolves configured mode-specific models", () => {
    expect(
      resolveWorkingModeModelSelection({
        cfg,
        workingMode: "read",
      }),
    ).toEqual({
      provider: "openai",
      model: "gpt-5-mini",
    });
  });

  it("resolves aliases in working-mode model lists", () => {
    expect(
      resolveWorkingModeModelSelection({
        cfg,
        workingMode: "write",
      }),
    ).toEqual({
      provider: "openai-codex",
      model: "gpt-5.2-codex",
    });
  });

  it("returns null when auto routing is disabled or missing", () => {
    expect(resolveWorkingModeModelSelection({ cfg: {} as AnimaConfig, workingMode: "read" })).toBe(
      null,
    );
  });
});

describe("applyAutoModelRouting", () => {
  it("prepends mode-preferred models ahead of the existing candidate list", async () => {
    const result = await applyAutoModelRouting({
      cfg,
      workingMode: "write",
      candidates: [
        { provider: "anthropic", model: "claude-opus-4-6" },
        { provider: "openai", model: "gpt-5-mini" },
      ],
    });

    expect(result.candidates).toEqual([
      { provider: "openai-codex", model: "gpt-5.2-codex" },
      { provider: "anthropic", model: "claude-opus-4-6" },
      { provider: "openai", model: "gpt-5-mini" },
    ]);
    expect(result.autoConfigured).toBe(true);
  });

  it("keeps the primary candidate first when preservePrimary is enabled", async () => {
    const result = await applyAutoModelRouting({
      cfg,
      workingMode: "write",
      preservePrimary: true,
      candidates: [
        { provider: "anthropic", model: "claude-opus-4-6" },
        { provider: "openai", model: "gpt-5-mini" },
      ],
    });

    expect(result.candidates).toEqual([
      { provider: "anthropic", model: "claude-opus-4-6" },
      { provider: "openai-codex", model: "gpt-5.2-codex" },
      { provider: "openai", model: "gpt-5-mini" },
    ]);
  });
});
