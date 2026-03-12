import { describe, expect, it } from "vitest";
import { migrateLegacyHellPath, normalizeRegistryServerPaths, type MCPServer } from "./registry.js";

describe("migrateLegacyHellPath", () => {
  it("moves Desktop hell paths into .hell when the new path exists", () => {
    const home = "/Users/tester";
    const legacy = "/Users/tester/Desktop/hell/claude-coherence-mcp/dist/index.js";
    const migrated = migrateLegacyHellPath(legacy, {
      home,
      pathExists: (candidate) =>
        candidate === "/Users/tester/.hell/claude-coherence-mcp/dist/index.js",
    });

    expect(migrated).toBe("/Users/tester/.hell/claude-coherence-mcp/dist/index.js");
  });

  it("keeps the legacy path when the replacement path does not exist", () => {
    const legacy = "/Users/tester/Desktop/hell/noxsoft-mcp";

    expect(migrateLegacyHellPath(legacy, { home: "/Users/tester", pathExists: () => false })).toBe(
      legacy,
    );
  });
});

describe("normalizeRegistryServerPaths", () => {
  it("updates both localPath and absolute args for legacy Desktop entries", () => {
    const server: MCPServer = {
      name: "coherence",
      gitSource: "git@example.com/coherence.git",
      localPath: "/Users/tester/Desktop/hell/claude-coherence-mcp",
      autoUpdate: true,
      healthCheckTool: "mcp__coherence__ground_yourself",
      command: "node",
      args: ["/Users/tester/Desktop/hell/claude-coherence-mcp/dist/index.js", "--stdio"],
      env: {},
      status: "unknown",
      consecutiveFailures: 0,
    };

    const normalized = normalizeRegistryServerPaths(server, {
      home: "/Users/tester",
      pathExists: (candidate) =>
        candidate === "/Users/tester/.hell/claude-coherence-mcp" ||
        candidate === "/Users/tester/.hell/claude-coherence-mcp/dist/index.js",
    });

    expect(normalized.localPath).toBe("/Users/tester/.hell/claude-coherence-mcp");
    expect(normalized.args).toEqual([
      "/Users/tester/.hell/claude-coherence-mcp/dist/index.js",
      "--stdio",
    ]);
  });
});
