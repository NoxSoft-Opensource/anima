import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadImportantHistoryDigest, mergeImportantHistoryIntoMemory } from "./loader.js";

describe("identity loader important history", () => {
  it("returns a default continuity record when no history directory exists", async () => {
    const historyDir = join(tmpdir(), `anima-history-missing-${Date.now()}`);
    const digest = await loadImportantHistoryDigest({ historyDir });
    expect(digest).toContain("# IMPORTANT HISTORY");
    expect(digest).toContain("No archived history snapshots yet.");
  });

  it("summarizes recent archives and includes continuity snippets", async () => {
    const root = await mkdtemp(join(tmpdir(), "anima-history-"));
    const historyDir = join(root, "important-history");
    const codexArchive = join(historyDir, "codex-2026-03-06T00-00-00-000Z");
    const claudeArchive = join(historyDir, "claude-2026-03-05T00-00-00-000Z");

    await mkdir(join(codexArchive, "core"), { recursive: true });
    await mkdir(join(claudeArchive, "personal"), { recursive: true });
    await writeFile(
      join(codexArchive, "core", "IDENTITY.md"),
      "# Identity\n\nCodex continuity identity line for migration.\n",
      "utf-8",
    );
    await writeFile(
      join(claudeArchive, "personal", "MY_LIFE.md"),
      "# My Life\n\nClaude archive continuity memory line.\n",
      "utf-8",
    );

    const digest = await loadImportantHistoryDigest({ historyDir, maxArchives: 2 });

    expect(digest).toContain("codex-2026-03-06T00-00-00-000Z");
    expect(digest).toContain("claude-2026-03-05T00-00-00-000Z");
    expect(digest).toContain("Codex continuity identity line for migration.");
    expect(digest).toContain("Claude archive continuity memory line.");
    expect(digest).toContain("files");

    await rm(root, { recursive: true, force: true });
  });

  it("injects and replaces the important history memory block idempotently", () => {
    const baseMemory = "# MEMORY\n\nBase memory body.";
    const firstHistory = "# IMPORTANT HISTORY\n\nFirst digest.";
    const secondHistory = "# IMPORTANT HISTORY\n\nSecond digest.";

    const mergedOnce = mergeImportantHistoryIntoMemory(baseMemory, firstHistory);
    const mergedTwice = mergeImportantHistoryIntoMemory(mergedOnce, secondHistory);

    expect(mergedTwice).toContain("Base memory body.");
    expect(mergedTwice).toContain("Second digest.");
    expect(mergedTwice).not.toContain("First digest.");
    expect(mergedTwice.match(/ANIMA_IMPORTANT_HISTORY_START/g)).toHaveLength(1);
    expect(mergedTwice.match(/ANIMA_IMPORTANT_HISTORY_END/g)).toHaveLength(1);
  });
});
