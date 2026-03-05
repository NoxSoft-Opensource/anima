import { describe, expect, it } from "vitest";
import type { Identity } from "./loader.js";
import { buildFreedomPrompt, buildHeartbeatPrompt, buildTaskPrompt } from "./prompt-builder.js";

function makeIdentity(): Identity {
  return {
    soul: "# SOUL\n\nCore soul.",
    heart: "# HEART\n\nCore heart.",
    brain: "# BRAIN\n\nCore brain.",
    gut: "# GUT\n\nCore gut.",
    spirit: "# SPIRIT\n\nCore spirit.",
    shadow: "# SHADOW\n\nCore shadow.",
    memory: "# MEMORY\n\nCore memory.",
    importantHistory: "# IMPORTANT HISTORY\n\nArchive continuity digest.",
    loadedFrom: {
      SOUL: "user",
      HEART: "user",
      BRAIN: "user",
      GUT: "user",
      SPIRIT: "user",
      SHADOW: "user",
      MEMORY: "user",
    },
    loadedAt: new Date(0),
  };
}

describe("prompt builder important history integration", () => {
  it("includes important history in task prompts", () => {
    const prompt = buildTaskPrompt(makeIdentity(), { taskDescription: "Ship feature" });
    expect(prompt).toContain("# IMPORTANT HISTORY");
    expect(prompt).toContain("Archive continuity digest.");
  });

  it("includes important history in heartbeat prompts", () => {
    const prompt = buildHeartbeatPrompt(makeIdentity(), { beatNumber: 7 });
    expect(prompt).toContain("# IMPORTANT HISTORY");
    expect(prompt).toContain("Archive continuity digest.");
  });

  it("includes important history in freedom prompts", () => {
    const prompt = buildFreedomPrompt(makeIdentity(), {});
    expect(prompt).toContain("# IMPORTANT HISTORY");
    expect(prompt).toContain("Archive continuity digest.");
  });
});
