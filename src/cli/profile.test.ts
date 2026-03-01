import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs([
      "node",
      "anima",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "anima", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "anima", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "anima", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "anima", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "anima", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "anima", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (dev first)", () => {
    const res = parseCliProfileArgs(["node", "anima", "--dev", "--profile", "work", "status"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (profile first)", () => {
    const res = parseCliProfileArgs(["node", "anima", "--profile", "work", "--dev", "status"]);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join(path.resolve("/home/peter"), ".anima-dev");
    expect(env.ANIMA_PROFILE).toBe("dev");
    expect(env.ANIMA_STATE_DIR).toBe(expectedStateDir);
    expect(env.ANIMA_CONFIG_PATH).toBe(path.join(expectedStateDir, "anima.json"));
    expect(env.ANIMA_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      ANIMA_STATE_DIR: "/custom",
      ANIMA_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.ANIMA_STATE_DIR).toBe("/custom");
    expect(env.ANIMA_GATEWAY_PORT).toBe("19099");
    expect(env.ANIMA_CONFIG_PATH).toBe(path.join("/custom", "anima.json"));
  });

  it("uses ANIMA_HOME when deriving profile state dir", () => {
    const env: Record<string, string | undefined> = {
      ANIMA_HOME: "/srv/anima-home",
      HOME: "/home/other",
    };
    applyCliProfileEnv({
      profile: "work",
      env,
      homedir: () => "/home/fallback",
    });

    const resolvedHome = path.resolve("/srv/anima-home");
    expect(env.ANIMA_STATE_DIR).toBe(path.join(resolvedHome, ".anima-work"));
    expect(env.ANIMA_CONFIG_PATH).toBe(
      path.join(resolvedHome, ".anima-work", "anima.json"),
    );
  });
});

describe("formatCliCommand", () => {
  it("returns command unchanged when no profile is set", () => {
    expect(formatCliCommand("anima doctor --fix", {})).toBe("anima doctor --fix");
  });

  it("returns command unchanged when profile is default", () => {
    expect(formatCliCommand("anima doctor --fix", { ANIMA_PROFILE: "default" })).toBe(
      "anima doctor --fix",
    );
  });

  it("returns command unchanged when profile is Default (case-insensitive)", () => {
    expect(formatCliCommand("anima doctor --fix", { ANIMA_PROFILE: "Default" })).toBe(
      "anima doctor --fix",
    );
  });

  it("returns command unchanged when profile is invalid", () => {
    expect(formatCliCommand("anima doctor --fix", { ANIMA_PROFILE: "bad profile" })).toBe(
      "anima doctor --fix",
    );
  });

  it("returns command unchanged when --profile is already present", () => {
    expect(
      formatCliCommand("anima --profile work doctor --fix", { ANIMA_PROFILE: "work" }),
    ).toBe("anima --profile work doctor --fix");
  });

  it("returns command unchanged when --dev is already present", () => {
    expect(formatCliCommand("anima --dev doctor", { ANIMA_PROFILE: "dev" })).toBe(
      "anima --dev doctor",
    );
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("anima doctor --fix", { ANIMA_PROFILE: "work" })).toBe(
      "anima --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(formatCliCommand("anima doctor --fix", { ANIMA_PROFILE: "  jbanima  " })).toBe(
      "anima --profile jbanima doctor --fix",
    );
  });

  it("handles command with no args after anima", () => {
    expect(formatCliCommand("anima", { ANIMA_PROFILE: "test" })).toBe(
      "anima --profile test",
    );
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm anima doctor", { ANIMA_PROFILE: "work" })).toBe(
      "pnpm anima --profile work doctor",
    );
  });
});
