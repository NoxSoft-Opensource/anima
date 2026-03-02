import { describe, expect, it, vi } from "vitest";
import { getSlashCommands, parseCommand } from "./commands.js";

vi.mock("../channels/dock.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../channels/dock.js")>();
  return { ...actual, listChannelDocks: () => [] };
});

describe("tui slash commands", () => {
  it("treats /elev as an alias for /elevated", () => {
    expect(parseCommand("/elev on")).toEqual({ name: "elevated", args: "on" });
  });

  it("normalizes alias case", () => {
    expect(parseCommand("/ELEV off")).toEqual({
      name: "elevated",
      args: "off",
    });
  });

  it("includes gateway text commands", () => {
    const commands = getSlashCommands({});
    expect(commands.some((command) => command.name === "context")).toBe(true);
    expect(commands.some((command) => command.name === "commands")).toBe(true);
  });
});
