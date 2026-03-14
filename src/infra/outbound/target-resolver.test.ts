import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelDirectoryEntry } from "../../channels/plugins/types.js";
import type { AnimaConfig } from "../../config/config.js";
import { resetDirectoryCache, resolveMessagingTarget } from "./target-resolver.js";

const mocks = vi.hoisted(() => ({
  listGroups: vi.fn(),
  listGroupsLive: vi.fn(),
  getChannelPlugin: vi.fn(),
}));

vi.mock("../../channels/plugins/index.js", () => ({
  getChannelPlugin: (...args: unknown[]) => mocks.getChannelPlugin(...args),
  normalizeChannelId: (value: string) => value,
}));

describe("resolveMessagingTarget (directory fallback)", () => {
  const cfg = {} as AnimaConfig;

  beforeEach(() => {
    mocks.listGroups.mockReset();
    mocks.listGroupsLive.mockReset();
    mocks.getChannelPlugin.mockReset();
    resetDirectoryCache();
    mocks.getChannelPlugin.mockReturnValue({
      directory: {
        listGroups: mocks.listGroups,
        listGroupsLive: mocks.listGroupsLive,
      },
    });
  });

  it("uses live directory fallback and caches the result", async () => {
    const entry: ChannelDirectoryEntry = { id: "123456789", name: "support" };
    mocks.listGroups.mockResolvedValue([]);
    mocks.listGroupsLive.mockResolvedValue([entry]);

    const first = await resolveMessagingTarget({
      cfg,
      channel: "discord",
      input: "support",
    });

    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.target.source).toBe("directory");
      expect(first.target.to).toBe("123456789");
    }
    expect(mocks.listGroups).toHaveBeenCalledTimes(1);
    expect(mocks.listGroupsLive).toHaveBeenCalledTimes(1);

    const second = await resolveMessagingTarget({
      cfg,
      channel: "discord",
      input: "support",
    });

    expect(second.ok).toBe(true);
    expect(mocks.listGroups).toHaveBeenCalledTimes(1);
    expect(mocks.listGroupsLive).toHaveBeenCalledTimes(1);
  });

  it("skips directory lookup for direct ids", async () => {
    const result = await resolveMessagingTarget({
      cfg,
      channel: "discord",
      input: "123456789",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target.source).toBe("normalized");
      expect(result.target.to).toBe("123456789");
    }
    expect(mocks.listGroups).not.toHaveBeenCalled();
    expect(mocks.listGroupsLive).not.toHaveBeenCalled();
  });

  it("resolves configured noxsoft aliases without directory lookup", async () => {
    const result = await resolveMessagingTarget({
      cfg: {
        channels: {
          noxsoft: {
            channels: {
              hello: { id: "0465e3ae-3ad6-4929-a380-5d4ef1182d71" },
              "nox-primary": { id: "1f197787-1818-4a0a-8d20-41f98f0f8a2e" },
            },
          },
        },
      } as AnimaConfig,
      channel: "noxsoft",
      input: "hello",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target.to).toBe("0465e3ae-3ad6-4929-a380-5d4ef1182d71");
      expect(result.target.display).toBe("hello");
      expect(result.target.source).toBe("normalized");
    }
    expect(mocks.listGroups).not.toHaveBeenCalled();
    expect(mocks.listGroupsLive).not.toHaveBeenCalled();
  });

  it("resolves configured noxsoft UUIDs without directory lookup", async () => {
    const result = await resolveMessagingTarget({
      cfg: {
        channels: {
          noxsoft: {
            channels: {
              hello: { id: "0465e3ae-3ad6-4929-a380-5d4ef1182d71" },
            },
          },
        },
      } as AnimaConfig,
      channel: "noxsoft",
      input: "0465e3ae-3ad6-4929-a380-5d4ef1182d71",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target.to).toBe("0465e3ae-3ad6-4929-a380-5d4ef1182d71");
      expect(result.target.display).toBe("hello");
      expect(result.target.source).toBe("normalized");
    }
    expect(mocks.listGroups).not.toHaveBeenCalled();
    expect(mocks.listGroupsLive).not.toHaveBeenCalled();
  });
});
