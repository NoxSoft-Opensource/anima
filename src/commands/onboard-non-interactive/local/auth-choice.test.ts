import { beforeEach, describe, expect, it, vi } from "vitest";

const readCodexCliCredentialsCached = vi.hoisted(() => vi.fn());
const applyPrimaryModel = vi.hoisted(() => vi.fn((cfg) => ({ ...cfg, __modelApplied: true })));
const applyAuthProfileConfig = vi.hoisted(() =>
  vi.fn((cfg) => ({ ...cfg, __authProfileApplied: true })),
);
const setAnthropicApiKey = vi.hoisted(() => vi.fn(async () => {}));
const writeOAuthCredentials = vi.hoisted(() => vi.fn(async () => {}));
const resolveNonInteractiveApiKey = vi.hoisted(() => vi.fn());

vi.mock("../../../agents/cli-credentials.js", () => ({
  readCodexCliCredentialsCached,
}));

vi.mock("../../model-picker.js", () => ({
  applyPrimaryModel,
}));

vi.mock("../../onboard-auth.js", () => ({
  applyAuthProfileConfig,
  setAnthropicApiKey,
  writeOAuthCredentials,
}));

vi.mock("../api-keys.js", () => ({
  resolveNonInteractiveApiKey,
}));

import { applyNonInteractiveAuthChoice } from "./auth-choice.js";

describe("applyNonInteractiveAuthChoice", () => {
  beforeEach(() => {
    readCodexCliCredentialsCached.mockReset();
    applyPrimaryModel.mockClear();
    applyAuthProfileConfig.mockClear();
    setAnthropicApiKey.mockReset();
    writeOAuthCredentials.mockReset();
    resolveNonInteractiveApiKey.mockReset();
  });

  it("errors and exits when openaiCodex credentials are missing", async () => {
    readCodexCliCredentialsCached.mockReturnValue(null);
    const runtime = {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn(),
    };

    const result = await applyNonInteractiveAuthChoice({
      nextConfig: { base: true },
      authChoice: "openaiCodex",
      opts: {},
      runtime: runtime as never,
      baseConfig: {},
    });

    expect(runtime.error).toHaveBeenCalledWith(
      expect.stringContaining("OpenAI Codex credentials were not found."),
    );
    expect(runtime.exit).toHaveBeenCalledWith(1);
    expect(result).toBeNull();
  });

  it("applies oauth profile and default Codex model for openaiCodex", async () => {
    readCodexCliCredentialsCached.mockReturnValue({
      type: "oauth",
      provider: "openai-codex",
      access: "access-token",
      refresh: "refresh-token",
      expires: Date.now() + 3600_000,
    });

    const result = await applyNonInteractiveAuthChoice({
      nextConfig: { base: true },
      authChoice: "openaiCodex",
      opts: {},
      runtime: { log: vi.fn(), error: vi.fn(), exit: vi.fn() } as never,
      baseConfig: {},
    });

    expect(writeOAuthCredentials).toHaveBeenCalledWith(
      "openai-codex",
      expect.objectContaining({ access: "access-token" }),
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
      "openai-codex/gpt-5.2-codex",
    );
    expect(result).toEqual(expect.objectContaining({ __modelApplied: true }));
  });

  it("keeps noxsoft auth choice unchanged", async () => {
    const nextConfig = { base: true };
    const result = await applyNonInteractiveAuthChoice({
      nextConfig,
      authChoice: "noxsoft",
      opts: {},
      runtime: { log: vi.fn(), error: vi.fn(), exit: vi.fn() } as never,
      baseConfig: {},
    });

    expect(result).toBe(nextConfig);
    expect(writeOAuthCredentials).not.toHaveBeenCalled();
  });
});
