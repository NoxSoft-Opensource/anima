import { beforeEach, describe, expect, it, vi } from "vitest";

const readCodexCliCredentialsCached = vi.hoisted(() => vi.fn());
const applyPrimaryModel = vi.hoisted(() => vi.fn((cfg) => ({ ...cfg, __modelApplied: true })));
const applyAuthProfileConfig = vi.hoisted(() =>
  vi.fn((cfg) => ({ ...cfg, __authProfileApplied: true })),
);
const writeOAuthCredentials = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("../agents/cli-credentials.js", () => ({
  readCodexCliCredentialsCached,
}));

vi.mock("./model-picker.js", () => ({
  applyPrimaryModel,
}));

vi.mock("./onboard-auth.js", () => ({
  applyAuthProfileConfig,
  writeOAuthCredentials,
}));

import { applyAuthChoiceOpenAICodex } from "./auth-choice.apply.openai-codex.js";

describe("applyAuthChoiceOpenAICodex", () => {
  beforeEach(() => {
    readCodexCliCredentialsCached.mockReset();
    applyPrimaryModel.mockClear();
    applyAuthProfileConfig.mockClear();
    writeOAuthCredentials.mockClear();
  });

  it("returns null when auth choice is not openaiCodex", async () => {
    const result = await applyAuthChoiceOpenAICodex({
      authChoice: "apiKey",
      config: {},
      prompter: { note: vi.fn() },
      runtime: { log: vi.fn() },
      setDefaultModel: true,
    } as never);

    expect(result).toBeNull();
    expect(readCodexCliCredentialsCached).not.toHaveBeenCalled();
  });

  it("notes when Codex credentials are missing", async () => {
    const note = vi.fn(async () => {});
    readCodexCliCredentialsCached.mockReturnValue(null);

    const result = await applyAuthChoiceOpenAICodex({
      authChoice: "openaiCodex",
      config: { hello: "world" },
      prompter: { note },
      runtime: { log: vi.fn() },
      setDefaultModel: true,
    } as never);

    expect(note).toHaveBeenCalledWith(
      expect.stringContaining("OpenAI Codex credentials were not found."),
      "OpenAI Codex auth",
    );
    expect(result).toEqual({ config: { hello: "world" } });
    expect(writeOAuthCredentials).not.toHaveBeenCalled();
  });

  it("writes OAuth profile and applies default model when setDefaultModel is true", async () => {
    const note = vi.fn(async () => {});
    readCodexCliCredentialsCached.mockReturnValue({
      type: "oauth",
      provider: "openai-codex",
      access: "access-token",
      refresh: "refresh-token",
      expires: Date.now() + 3600_000,
    });

    const result = await applyAuthChoiceOpenAICodex({
      authChoice: "openaiCodex",
      config: { base: true },
      prompter: { note },
      runtime: { log: vi.fn() },
      setDefaultModel: true,
      agentDir: "/tmp/agent",
    } as never);

    expect(writeOAuthCredentials).toHaveBeenCalledWith(
      "openai-codex",
      expect.objectContaining({ access: "access-token" }),
      "/tmp/agent",
    );
    expect(applyAuthProfileConfig).toHaveBeenCalledWith(
      { base: true },
      expect.objectContaining({
        profileId: "openai-codex:default",
        provider: "openai-codex",
        mode: "oauth",
      }),
    );
    expect(applyPrimaryModel).toHaveBeenCalledWith(
      expect.objectContaining({ __authProfileApplied: true }),
      "openai-codex/gpt-5.3-codex",
    );
    expect(result).toEqual({
      config: expect.objectContaining({ __modelApplied: true }),
    });
  });

  it("returns model override when setDefaultModel is false", async () => {
    readCodexCliCredentialsCached.mockReturnValue({
      type: "oauth",
      provider: "openai-codex",
      access: "access-token",
      refresh: "refresh-token",
      expires: Date.now() + 3600_000,
    });

    const result = await applyAuthChoiceOpenAICodex({
      authChoice: "openaiCodex",
      config: { base: true },
      prompter: { note: vi.fn(async () => {}) },
      runtime: { log: vi.fn() },
      setDefaultModel: false,
    } as never);

    expect(applyPrimaryModel).not.toHaveBeenCalled();
    expect(result).toEqual({
      config: expect.objectContaining({ __authProfileApplied: true }),
      agentModelOverride: "openai-codex/gpt-5.3-codex",
    });
  });
});
