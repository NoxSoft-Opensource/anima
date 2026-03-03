import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configureCommandWithSections: vi.fn(async () => {}),
  parseConfigureWizardSections: vi.fn((raw: unknown) => {
    const values = Array.isArray(raw)
      ? raw.filter((item): item is string => typeof item === "string")
      : [];
    return { sections: values, invalid: [] };
  }),
  readConfigFileSnapshot: vi.fn(async () => ({
    raw: "{\n  gateway: { port: 18789 }\n}\n",
    resolved: { gateway: { port: 18789 } },
    config: { gateway: { port: 18789 } },
    valid: true,
    hash: "hash-1",
    issues: [],
  })),
  runtimeLog: vi.fn(),
  runtimeError: vi.fn(),
  runtimeExit: vi.fn((code: number) => {
    throw new Error(`exit:${code}`);
  }),
  runConfigGet: vi.fn(async () => {}),
  runConfigSet: vi.fn(async () => {}),
  runConfigUnset: vi.fn(async () => {}),
}));

vi.mock("../commands/configure.js", () => ({
  CONFIGURE_WIZARD_SECTIONS: [
    "workspace",
    "gateway",
    "daemon",
    "identity",
    "memory",
    "heartbeat",
    "health",
  ],
  configureCommandWithSections: mocks.configureCommandWithSections,
  parseConfigureWizardSections: mocks.parseConfigureWizardSections,
}));

vi.mock("../config/config.js", () => ({
  CONFIG_PATH: "/tmp/anima.json",
  readConfigFileSnapshot: mocks.readConfigFileSnapshot,
}));

vi.mock("../runtime.js", () => ({
  defaultRuntime: {
    log: (...args: unknown[]) => mocks.runtimeLog(...args),
    error: (...args: unknown[]) => mocks.runtimeError(...args),
    exit: (code: number) => mocks.runtimeExit(code),
  },
}));

vi.mock("./config-cli.js", () => ({
  runConfigGet: mocks.runConfigGet,
  runConfigSet: mocks.runConfigSet,
  runConfigUnset: mocks.runConfigUnset,
}));

const { registerSettingsCli } = await import("./settings-cli.js");

describe("settings-cli", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs gateway settings shortcut sections", async () => {
    const program = new Command();
    program.exitOverride();
    registerSettingsCli(program);

    await program.parseAsync(["settings", "gateway"], { from: "user" });

    expect(mocks.configureCommandWithSections).toHaveBeenCalledWith(
      ["gateway", "daemon", "health"],
      expect.any(Object),
    );
  });

  it("prints raw settings snapshot in show mode", async () => {
    const program = new Command();
    program.exitOverride();
    registerSettingsCli(program);

    await program.parseAsync(["settings", "show", "--view", "raw"], {
      from: "user",
    });

    expect(mocks.runtimeLog).toHaveBeenCalledWith("{\n  gateway: { port: 18789 }\n}\n");
  });

  it("delegates path get/set/unset commands", async () => {
    const program = new Command();
    program.exitOverride();
    registerSettingsCli(program);

    await program.parseAsync(["settings", "get", "gateway.port", "--json"], {
      from: "user",
    });
    await program.parseAsync(["settings", "set", "gateway.port", "18790", "--json"], {
      from: "user",
    });
    await program.parseAsync(["settings", "unset", "gateway.port"], {
      from: "user",
    });

    expect(mocks.runConfigGet).toHaveBeenCalledWith({
      path: "gateway.port",
      json: true,
      runtime: expect.any(Object),
    });
    expect(mocks.runConfigSet).toHaveBeenCalledWith({
      path: "gateway.port",
      value: "18790",
      json: true,
      runtime: expect.any(Object),
    });
    expect(mocks.runConfigUnset).toHaveBeenCalledWith({
      path: "gateway.port",
      runtime: expect.any(Object),
    });
  });
});
