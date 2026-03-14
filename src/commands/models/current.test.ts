import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTempHome as withTempHomeBase } from "../../../test/helpers/temp-home.js";

vi.mock("../../agents/model-catalog.js", () => ({
  loadModelCatalog: vi.fn(),
}));

import type { AnimaConfig } from "../../config/config.js";
import type { RuntimeEnv } from "../../runtime.js";
import { loadModelCatalog } from "../../agents/model-catalog.js";
import * as configModule from "../../config/config.js";
import { modelsCurrentCommand } from "./current.js";

const runtime: RuntimeEnv = {
  log: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(),
};

const configSpy = vi.spyOn(configModule, "loadConfig");

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  return withTempHomeBase(fn, { prefix: "anima-models-current-" });
}

function mockConfig(
  home: string,
  storePath: string,
  agentOverrides?: Partial<NonNullable<NonNullable<AnimaConfig["agents"]>["defaults"]>>,
) {
  configSpy.mockReturnValue({
    agents: {
      defaults: {
        model: { primary: "google/gemini-flash-latest" },
        models: {
          "google/gemini-flash-latest": {},
          "openai/gpt-5.2-codex": {},
        },
        workspace: path.join(home, "anima"),
        ...agentOverrides,
      },
    },
    session: { store: storePath, mainKey: "main" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadModelCatalog).mockResolvedValue([]);
});

describe("modelsCurrentCommand", () => {
  it("prints the effective session override and last-used model", async () => {
    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      fs.mkdirSync(path.dirname(store), { recursive: true });
      fs.writeFileSync(
        store,
        JSON.stringify(
          {
            "agent:main:main": {
              sessionId: "s1",
              updatedAt: Date.now(),
              providerOverride: "openai",
              modelOverride: "gpt-5.2-codex",
              modelProvider: "openai-codex",
              model: "gpt-5.2-codex",
            },
          },
          null,
          2,
        ),
      );
      mockConfig(home, store);

      await modelsCurrentCommand({ sessionKey: "agent:main:main" }, runtime);

      expect(runtime.log).toHaveBeenCalledWith("Current model: openai-codex/gpt-5.2-codex");
      expect(runtime.log).toHaveBeenCalledWith("Source: session");
      expect(runtime.log).toHaveBeenCalledWith("Last used: openai-codex/gpt-5.2-codex");
    });
  });

  it("supports plain output", async () => {
    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      mockConfig(home, store);

      await modelsCurrentCommand({ plain: true }, runtime);

      expect(runtime.log).toHaveBeenCalledWith("google/gemini-flash-latest");
    });
  });
});
