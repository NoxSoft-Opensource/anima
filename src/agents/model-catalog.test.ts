import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnimaConfig } from "../config/config.js";
import {
  __setModelCatalogImportForTest,
  loadModelCatalog,
  resetModelCatalogCacheForTest,
} from "./model-catalog.js";

type PiSdkModule = typeof import("./pi-model-discovery.js");

vi.mock("./models-config.js", () => ({
  ensureAnimaModelsJson: vi.fn().mockResolvedValue({ agentDir: "/tmp", wrote: false }),
}));

vi.mock("./agent-paths.js", () => ({
  resolveAnimaAgentDir: () => "/tmp/anima",
}));

describe("loadModelCatalog", () => {
  beforeEach(() => {
    resetModelCatalogCacheForTest();
  });

  afterEach(() => {
    __setModelCatalogImportForTest();
    resetModelCatalogCacheForTest();
    vi.restoreAllMocks();
  });

  it("retries after import failure without poisoning the cache", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    let call = 0;

    __setModelCatalogImportForTest(async () => {
      call += 1;
      if (call === 1) {
        throw new Error("boom");
      }
      return {
        AuthStorage: { create: () => ({}) },
        ModelRegistry: class {
          getAll() {
            return [{ id: "claude-opus-4-5", name: "Claude Opus 4.5", provider: "anthropic" }];
          }
        },
      } as unknown as PiSdkModule;
    });

    const cfg = {} as AnimaConfig;
    const first = await loadModelCatalog({ config: cfg });
    expect(first).toEqual([]);

    const second = await loadModelCatalog({ config: cfg });
    expect(second).toEqual([
      { id: "claude-opus-4-5", name: "Claude Opus 4.5", provider: "anthropic" },
    ]);
    expect(call).toBe(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("returns partial results on discovery errors", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    __setModelCatalogImportForTest(
      async () =>
        ({
          AuthStorage: { create: () => ({}) },
          ModelRegistry: class {
            getAll() {
              return [
                { id: "claude-opus-4-5", name: "Claude Opus 4.5", provider: "anthropic" },
                {
                  get id() {
                    throw new Error("boom");
                  },
                  provider: "anthropic",
                  name: "bad",
                },
              ];
            }
          },
        }) as unknown as PiSdkModule,
    );

    const result = await loadModelCatalog({ config: {} as AnimaConfig });
    expect(result).toEqual([
      { id: "claude-opus-4-5", name: "Claude Opus 4.5", provider: "anthropic" },
    ]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
