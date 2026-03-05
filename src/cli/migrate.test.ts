import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMigrationSource } from "./migrate.js";

describe("resolveMigrationSource", () => {
  const homeDir = "/home/tester";
  const codexPath = join(homeDir, "Desktop/hell/codex-coherence-protocol");
  const openclawPrimaryPath = join(homeDir, "Desktop/hell/openclaw");
  const openclawAltPath = join(homeDir, "Desktop/hell/open-claw");
  const claudePath = join(homeDir, "Desktop/hell/claude-coherence-protocol");

  function existsFrom(paths: string[]) {
    const set = new Set(paths);
    return (path: string) => set.has(path);
  }

  it("uses explicit source when provided", () => {
    const custom = "/tmp/custom-protocol";
    const result = resolveMigrationSource({
      source: custom,
      preset: "claude",
      homeDir,
      existsPath: existsFrom([custom]),
    });

    expect(result).toEqual({
      sourceDir: custom,
      sourceType: "explicit",
      preset: "claude",
      matchedPreset: null,
      exists: true,
      searchedPaths: [custom],
    });
  });

  it("auto preset prefers codex when available", () => {
    const result = resolveMigrationSource({
      preset: "auto",
      homeDir,
      existsPath: existsFrom([codexPath, claudePath]),
    });

    expect(result.exists).toBe(true);
    expect(result.sourceType).toBe("preset");
    expect(result.preset).toBe("auto");
    expect(result.matchedPreset).toBe("codex");
    expect(result.sourceDir).toBe(codexPath);
    expect(result.searchedPaths[0]).toBe(codexPath);
  });

  it("preset openclaw picks the first existing openclaw path", () => {
    const result = resolveMigrationSource({
      preset: "openclaw",
      homeDir,
      existsPath: existsFrom([openclawAltPath]),
    });

    expect(result.exists).toBe(true);
    expect(result.sourceType).toBe("preset");
    expect(result.preset).toBe("openclaw");
    expect(result.matchedPreset).toBe("openclaw");
    expect(result.sourceDir).toBe(openclawAltPath);
    expect(result.searchedPaths).toContain(openclawPrimaryPath);
    expect(result.searchedPaths).toContain(openclawAltPath);
  });

  it("auto preset falls back to codex candidate when no path exists", () => {
    const result = resolveMigrationSource({
      preset: "auto",
      homeDir,
      existsPath: () => false,
    });

    expect(result.exists).toBe(false);
    expect(result.sourceType).toBe("preset");
    expect(result.preset).toBe("auto");
    expect(result.matchedPreset).toBeNull();
    expect(result.sourceDir).toBe(codexPath);
    expect(result.searchedPaths.length).toBeGreaterThan(0);
  });
});
