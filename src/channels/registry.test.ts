import { describe, expect, it } from "vitest";
import {
  formatChannelSelectionLine,
  listChatChannels,
  normalizeChatChannelId,
} from "./registry.js";

describe("channel registry", () => {
  it("normalizes known channel IDs", () => {
    expect(normalizeChatChannelId("noxsoft")).toBe("noxsoft");
    expect(normalizeChatChannelId("unknown")).toBeNull();
  });

  it("keeps noxsoft first in the default order", () => {
    const channels = listChatChannels();
    expect(channels[0]?.id).toBe("noxsoft");
  });

  it("formats selection lines with docs labels", () => {
    const channels = listChatChannels();
    const first = channels[0];
    if (!first) {
      throw new Error("Missing channel metadata.");
    }
    const line = formatChannelSelectionLine(first, (path, label) =>
      [label, path].filter(Boolean).join(":"),
    );
    expect(line).toContain("/channels/noxsoft");
    expect(line).toContain("https://chat.noxsoft.net");
  });
});
