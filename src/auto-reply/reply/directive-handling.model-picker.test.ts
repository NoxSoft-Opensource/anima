import { describe, expect, it } from "vitest";
import { buildModelPickerItems } from "./directive-handling.model-picker.js";

describe("buildModelPickerItems", () => {
  it("prefers Codex-capable OpenAI providers ahead of plain OpenAI", () => {
    const items = buildModelPickerItems([
      { provider: "openai", id: "gpt-5.2", name: "GPT-5.2" },
      { provider: "openai-codex", id: "gpt-5.2-codex", name: "GPT-5.2 Codex" },
    ]);

    expect(items).toEqual([
      { provider: "openai-codex", model: "gpt-5.2-codex" },
      { provider: "openai", model: "gpt-5.2" },
    ]);
  });
});
