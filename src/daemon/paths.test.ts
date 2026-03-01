import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveGatewayStateDir } from "./paths.js";

describe("resolveGatewayStateDir", () => {
  it("uses the default state dir when no overrides are set", () => {
    const env = { HOME: "/Users/test" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".anima"));
  });

  it("appends the profile suffix when set", () => {
    const env = { HOME: "/Users/test", ANIMA_PROFILE: "rescue" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".anima-rescue"));
  });

  it("treats default profiles as the base state dir", () => {
    const env = { HOME: "/Users/test", ANIMA_PROFILE: "Default" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".anima"));
  });

  it("uses ANIMA_STATE_DIR when provided", () => {
    const env = { HOME: "/Users/test", ANIMA_STATE_DIR: "/var/lib/anima" };
    expect(resolveGatewayStateDir(env)).toBe(path.resolve("/var/lib/anima"));
  });

  it("expands ~ in ANIMA_STATE_DIR", () => {
    const env = { HOME: "/Users/test", ANIMA_STATE_DIR: "~/anima-state" };
    expect(resolveGatewayStateDir(env)).toBe(path.resolve("/Users/test/anima-state"));
  });

  it("preserves Windows absolute paths without HOME", () => {
    const env = { ANIMA_STATE_DIR: "C:\\State\\anima" };
    expect(resolveGatewayStateDir(env)).toBe("C:\\State\\anima");
  });
});
