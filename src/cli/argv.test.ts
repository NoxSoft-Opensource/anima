import { describe, expect, it } from "vitest";
import {
  buildParseArgv,
  getFlagValue,
  getCommandPath,
  getPrimaryCommand,
  getPositiveIntFlagValue,
  getVerboseFlag,
  hasHelpOrVersion,
  hasFlag,
  shouldMigrateState,
  shouldMigrateStateFromPath,
} from "./argv.js";

describe("argv helpers", () => {
  it("detects help/version flags", () => {
    expect(hasHelpOrVersion(["node", "anima", "--help"])).toBe(true);
    expect(hasHelpOrVersion(["node", "anima", "-V"])).toBe(true);
    expect(hasHelpOrVersion(["node", "anima", "status"])).toBe(false);
  });

  it("extracts command path ignoring flags and terminator", () => {
    expect(getCommandPath(["node", "anima", "status", "--json"], 2)).toEqual(["status"]);
    expect(getCommandPath(["node", "anima", "agents", "list"], 2)).toEqual(["agents", "list"]);
    expect(getCommandPath(["node", "anima", "status", "--", "ignored"], 2)).toEqual(["status"]);
  });

  it("returns primary command", () => {
    expect(getPrimaryCommand(["node", "anima", "agents", "list"])).toBe("agents");
    expect(getPrimaryCommand(["node", "anima"])).toBeNull();
  });

  it("parses boolean flags and ignores terminator", () => {
    expect(hasFlag(["node", "anima", "status", "--json"], "--json")).toBe(true);
    expect(hasFlag(["node", "anima", "--", "--json"], "--json")).toBe(false);
  });

  it("extracts flag values with equals and missing values", () => {
    expect(getFlagValue(["node", "anima", "status", "--timeout", "5000"], "--timeout")).toBe(
      "5000",
    );
    expect(getFlagValue(["node", "anima", "status", "--timeout=2500"], "--timeout")).toBe(
      "2500",
    );
    expect(getFlagValue(["node", "anima", "status", "--timeout"], "--timeout")).toBeNull();
    expect(getFlagValue(["node", "anima", "status", "--timeout", "--json"], "--timeout")).toBe(
      null,
    );
    expect(getFlagValue(["node", "anima", "--", "--timeout=99"], "--timeout")).toBeUndefined();
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "anima", "status", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "anima", "status", "--debug"])).toBe(false);
    expect(getVerboseFlag(["node", "anima", "status", "--debug"], { includeDebug: true })).toBe(
      true,
    );
  });

  it("parses positive integer flag values", () => {
    expect(getPositiveIntFlagValue(["node", "anima", "status"], "--timeout")).toBeUndefined();
    expect(
      getPositiveIntFlagValue(["node", "anima", "status", "--timeout"], "--timeout"),
    ).toBeNull();
    expect(
      getPositiveIntFlagValue(["node", "anima", "status", "--timeout", "5000"], "--timeout"),
    ).toBe(5000);
    expect(
      getPositiveIntFlagValue(["node", "anima", "status", "--timeout", "nope"], "--timeout"),
    ).toBeUndefined();
  });

  it("builds parse argv from raw args", () => {
    const nodeArgv = buildParseArgv({
      programName: "anima",
      rawArgs: ["node", "anima", "status"],
    });
    expect(nodeArgv).toEqual(["node", "anima", "status"]);

    const versionedNodeArgv = buildParseArgv({
      programName: "anima",
      rawArgs: ["node-22", "anima", "status"],
    });
    expect(versionedNodeArgv).toEqual(["node-22", "anima", "status"]);

    const versionedNodeWindowsArgv = buildParseArgv({
      programName: "anima",
      rawArgs: ["node-22.2.0.exe", "anima", "status"],
    });
    expect(versionedNodeWindowsArgv).toEqual(["node-22.2.0.exe", "anima", "status"]);

    const versionedNodePatchlessArgv = buildParseArgv({
      programName: "anima",
      rawArgs: ["node-22.2", "anima", "status"],
    });
    expect(versionedNodePatchlessArgv).toEqual(["node-22.2", "anima", "status"]);

    const versionedNodeWindowsPatchlessArgv = buildParseArgv({
      programName: "anima",
      rawArgs: ["node-22.2.exe", "anima", "status"],
    });
    expect(versionedNodeWindowsPatchlessArgv).toEqual(["node-22.2.exe", "anima", "status"]);

    const versionedNodeWithPathArgv = buildParseArgv({
      programName: "anima",
      rawArgs: ["/usr/bin/node-22.2.0", "anima", "status"],
    });
    expect(versionedNodeWithPathArgv).toEqual(["/usr/bin/node-22.2.0", "anima", "status"]);

    const nodejsArgv = buildParseArgv({
      programName: "anima",
      rawArgs: ["nodejs", "anima", "status"],
    });
    expect(nodejsArgv).toEqual(["nodejs", "anima", "status"]);

    const nonVersionedNodeArgv = buildParseArgv({
      programName: "anima",
      rawArgs: ["node-dev", "anima", "status"],
    });
    expect(nonVersionedNodeArgv).toEqual(["node", "anima", "node-dev", "anima", "status"]);

    const directArgv = buildParseArgv({
      programName: "anima",
      rawArgs: ["anima", "status"],
    });
    expect(directArgv).toEqual(["node", "anima", "status"]);

    const bunArgv = buildParseArgv({
      programName: "anima",
      rawArgs: ["bun", "src/entry.ts", "status"],
    });
    expect(bunArgv).toEqual(["bun", "src/entry.ts", "status"]);
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "anima",
      fallbackArgv: ["status"],
    });
    expect(fallbackArgv).toEqual(["node", "anima", "status"]);
  });

  it("decides when to migrate state", () => {
    expect(shouldMigrateState(["node", "anima", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "anima", "health"])).toBe(false);
    expect(shouldMigrateState(["node", "anima", "sessions"])).toBe(false);
    expect(shouldMigrateState(["node", "anima", "config", "get", "update"])).toBe(false);
    expect(shouldMigrateState(["node", "anima", "config", "unset", "update"])).toBe(false);
    expect(shouldMigrateState(["node", "anima", "models", "list"])).toBe(false);
    expect(shouldMigrateState(["node", "anima", "models", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "anima", "memory", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "anima", "agent", "--message", "hi"])).toBe(false);
    expect(shouldMigrateState(["node", "anima", "agents", "list"])).toBe(true);
    expect(shouldMigrateState(["node", "anima", "message", "send"])).toBe(true);
  });

  it("reuses command path for migrate state decisions", () => {
    expect(shouldMigrateStateFromPath(["status"])).toBe(false);
    expect(shouldMigrateStateFromPath(["config", "get"])).toBe(false);
    expect(shouldMigrateStateFromPath(["models", "status"])).toBe(false);
    expect(shouldMigrateStateFromPath(["agents", "list"])).toBe(true);
  });
});
