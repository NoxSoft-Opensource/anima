import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTempHome as withTempHomeBase } from "../../test/helpers/temp-home.js";

vi.mock("../agents/pi-embedded.js", () => ({
  abortEmbeddedPiRun: vi.fn().mockReturnValue(false),
  runEmbeddedPiAgent: vi.fn(),
  resolveEmbeddedSessionLane: (key: string) => `session:${key.trim() || "main"}`,
}));

vi.mock("../agents/model-catalog.js", () => ({
  loadModelCatalog: vi.fn(),
}));

import type { AnimaConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { loadModelCatalog } from "../agents/model-catalog.js";
import { runEmbeddedPiAgent } from "../agents/pi-embedded.js";
import * as configModule from "../config/config.js";
import { agentCommand } from "./agent.js";

const runtime: RuntimeEnv = {
  log: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(),
};

const configSpy = vi.spyOn(configModule, "loadConfig");

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  return withTempHomeBase(fn, { prefix: "anima-agent-model-switch-" });
}

function mockConfig(home: string, storePath: string) {
  configSpy.mockReturnValue({
    agents: {
      defaults: {
        model: { primary: "google/gemini-flash-latest" },
        models: {
          "google/gemini-flash-latest": {},
        },
        workspace: path.join(home, "anima"),
      },
    },
    session: { store: storePath, mainKey: "main" },
  } as AnimaConfig);
}

describe("agentCommand --model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadModelCatalog).mockResolvedValue([]);
    vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
      payloads: [{ text: "ok" }],
      meta: {
        durationMs: 5,
        agentMeta: { sessionId: "s1", provider: "openai-codex", model: "gpt-5.3-codex" },
      },
    });
  });

  it("persists and forwards an explicit CLI model override", async () => {
    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      mockConfig(home, store);

      await agentCommand(
        {
          message: "build anima 6",
          agentId: "main",
          model: "openai/gpt-5.3-codex",
        },
        runtime,
      );

      const callArgs = vi.mocked(runEmbeddedPiAgent).mock.calls.at(-1)?.[0];
      expect(callArgs?.provider).toBe("openai-codex");
      expect(callArgs?.model).toBe("gpt-5.3-codex");

      const saved = JSON.parse(fs.readFileSync(store, "utf-8")) as Record<
        string,
        { providerOverride?: string; modelOverride?: string }
      >;
      expect(saved["agent:main:main"]?.providerOverride).toBe("openai-codex");
      expect(saved["agent:main:main"]?.modelOverride).toBe("gpt-5.3-codex");
    });
  });
});
