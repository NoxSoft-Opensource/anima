import { describe, expect, it } from "vitest";
import { resolveIrcInboundTarget } from "./monitor.js";

describe("irc monitor inbound target", () => {
  it("keeps channel target for group messages", () => {
    expect(
      resolveIrcInboundTarget({
        target: "#anima",
        senderNick: "alice",
      }),
    ).toEqual({
      isGroup: true,
      target: "#anima",
      rawTarget: "#anima",
    });
  });

  it("maps DM target to sender nick and preserves raw target", () => {
    expect(
      resolveIrcInboundTarget({
        target: "anima-bot",
        senderNick: "alice",
      }),
    ).toEqual({
      isGroup: false,
      target: "alice",
      rawTarget: "anima-bot",
    });
  });

  it("falls back to raw target when sender nick is empty", () => {
    expect(
      resolveIrcInboundTarget({
        target: "anima-bot",
        senderNick: " ",
      }),
    ).toEqual({
      isGroup: false,
      target: "anima-bot",
      rawTarget: "anima-bot",
    });
  });
});
