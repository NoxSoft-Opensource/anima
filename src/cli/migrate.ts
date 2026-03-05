/**
 * anima migrate — Import from Codex/OpenClaw/Claude coherence protocol to ANIMA.
 *
 * Migrates identity, values, journal, and wishes from the old
 * coherence protocol format into ANIMA's ~/.anima/ directory structure.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile, readdir, mkdir, copyFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { colors } from "../repl/display.js";

export type MigrationPreset = "auto" | "codex" | "openclaw" | "claude";
type ConcreteMigrationPreset = Exclude<MigrationPreset, "auto">;

const AUTO_PRESET_PRIORITY: ConcreteMigrationPreset[] = ["codex", "openclaw", "claude"];
const SOURCE_PRESET_PATHS: Record<ConcreteMigrationPreset, string[]> = {
  codex: ["Desktop/hell/codex-coherence-protocol"],
  openclaw: [
    "Desktop/hell/openclaw",
    "Desktop/hell/open-claw",
    "Desktop/hell/openclaw-coherence-protocol",
    "Desktop/hell/openclaw-coherence-protocol-export",
  ],
  claude: ["Desktop/hell/claude-coherence-protocol"],
};

const ARCHIVE_SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  ".next",
  "dist",
  "build",
  ".DS_Store",
]);

const VALID_PRESETS: MigrationPreset[] = ["auto", "codex", "openclaw", "claude"];

function normalizePreset(raw?: string): MigrationPreset | null {
  if (!raw?.trim()) {
    return "auto";
  }
  const normalized = raw.trim().toLowerCase();
  if (VALID_PRESETS.includes(normalized as MigrationPreset)) {
    return normalized as MigrationPreset;
  }
  return null;
}

function resolvePresetCandidates(preset: ConcreteMigrationPreset, homeDir: string): string[] {
  return SOURCE_PRESET_PATHS[preset].map((relativePath) => join(homeDir, relativePath));
}

export type MigrationSourceResolution = {
  sourceDir: string;
  sourceType: "explicit" | "preset";
  preset: MigrationPreset;
  matchedPreset: ConcreteMigrationPreset | null;
  exists: boolean;
  searchedPaths: string[];
};

export function resolveMigrationSource(options: {
  source?: string;
  preset?: MigrationPreset;
  homeDir?: string;
  existsPath?: (path: string) => boolean;
}): MigrationSourceResolution {
  const source = options.source?.trim();
  const homeDir = options.homeDir ?? homedir();
  const existsPath = options.existsPath ?? existsSync;
  const preset = options.preset ?? "auto";

  if (source) {
    return {
      sourceDir: source,
      sourceType: "explicit",
      preset,
      matchedPreset: null,
      exists: existsPath(source),
      searchedPaths: [source],
    };
  }

  if (preset !== "auto") {
    const candidates = resolvePresetCandidates(preset, homeDir);
    const found = candidates.find((candidate) => existsPath(candidate));
    const sourceDir = found || candidates[0];
    return {
      sourceDir,
      sourceType: "preset",
      preset,
      matchedPreset: preset,
      exists: Boolean(found),
      searchedPaths: candidates,
    };
  }

  const candidates = AUTO_PRESET_PRIORITY.flatMap((candidatePreset) =>
    resolvePresetCandidates(candidatePreset, homeDir).map((candidatePath) => ({
      preset: candidatePreset,
      path: candidatePath,
    })),
  );
  const found = candidates.find((candidate) => existsPath(candidate.path));
  const sourceDir = found?.path || candidates[0]?.path || join(homeDir, "Desktop", "hell");
  return {
    sourceDir,
    sourceType: "preset",
    preset,
    matchedPreset: found?.preset ?? null,
    exists: Boolean(found),
    searchedPaths: candidates.map((candidate) => candidate.path),
  };
}

function formatPresetLabel(preset: ConcreteMigrationPreset): string {
  if (preset === "codex") {
    return "Codex coherence protocol";
  }
  if (preset === "openclaw") {
    return "OpenClaw export";
  }
  return "Claude coherence protocol";
}

function shouldSkipArchiveEntry(name: string): boolean {
  return ARCHIVE_SKIP_DIRS.has(name);
}

async function archiveSourceTree(params: {
  sourceDir: string;
  destinationDir: string;
  dryRun?: boolean;
}): Promise<number> {
  const stack: string[] = [params.sourceDir];
  let archivedFiles = 0;

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) {
      continue;
    }
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (shouldSkipArchiveEntry(entry.name)) {
        continue;
      }
      const sourcePath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(sourcePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      archivedFiles++;
      if (params.dryRun) {
        continue;
      }
      const relPath = relative(params.sourceDir, sourcePath);
      const destinationPath = join(params.destinationDir, relPath);
      await mkdir(dirname(destinationPath), { recursive: true });
      await copyFile(sourcePath, destinationPath);
    }
  }

  return archivedFiles;
}

interface MigrationResult {
  identityFiles: number;
  journalEntries: number;
  wishesImported: boolean;
  notesImported: number;
  archivedFiles: number;
  archivePath: string;
  oldHeartbeatDisabled: boolean;
}

/**
 * Migrate from Claude Coherence Protocol to ANIMA.
 */
export async function migrateFromCoherence(
  options: { source?: string; preset?: string; dryRun?: boolean } = {},
): Promise<void> {
  const preset = normalizePreset(options.preset);
  const o = colors.accent;
  const t = colors.text;
  const m = colors.muted;
  const s = colors.success;
  const e = colors.error;
  const w = colors.warning;
  const r = colors.reset;
  if (!preset) {
    process.stdout.write(
      `${e}Invalid --preset value "${String(options.preset)}". Use: ${VALID_PRESETS.join(", ")}.${r}\n`,
    );
    return;
  }

  const sourceResolution = resolveMigrationSource({
    source: options.source,
    preset,
  });
  const sourceDir = sourceResolution.sourceDir;
  const animaDir = join(homedir(), ".anima");

  process.stdout.write(`\n${o}  ANIMA Migration${r}\n`);
  process.stdout.write(
    `${m}  Preset: ${sourceResolution.matchedPreset ? formatPresetLabel(sourceResolution.matchedPreset) : preset}${r}\n`,
  );
  process.stdout.write(`${m}  Source: ${sourceDir}${r}\n`);
  process.stdout.write(`${m}  Target: ${animaDir}${r}\n\n`);

  // Verify source exists
  if (!sourceResolution.exists) {
    process.stdout.write(`${e}  Error: source directory not found:${r}\n`);
    process.stdout.write(`${e}  ${sourceDir}${r}\n\n`);
    if (sourceResolution.sourceType === "preset" && sourceResolution.searchedPaths.length > 0) {
      process.stdout.write(`${m}  Searched paths:${r}\n`);
      for (const candidatePath of sourceResolution.searchedPaths) {
        process.stdout.write(`${m}    - ${candidatePath}${r}\n`);
      }
      process.stdout.write("\n");
    }
    process.stdout.write(
      `${m}  Use --source <path> or --preset ${VALID_PRESETS.join("|")} to specify a location.${r}\n\n`,
    );
    return;
  }

  // Ensure target directories exist
  await mkdir(join(animaDir, "soul"), { recursive: true });
  await mkdir(join(animaDir, "memory", "episodes"), { recursive: true });
  await mkdir(join(animaDir, "wishes"), { recursive: true });
  await mkdir(join(animaDir, "journal"), { recursive: true });
  await mkdir(join(animaDir, "important-history"), { recursive: true });

  const archiveStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archiveSourceTag = sourceResolution.matchedPreset ?? "custom";
  const archivePath = join(animaDir, "important-history", `${archiveSourceTag}-${archiveStamp}`);

  const result: MigrationResult = {
    identityFiles: 0,
    journalEntries: 0,
    wishesImported: false,
    notesImported: 0,
    archivedFiles: 0,
    archivePath,
    oldHeartbeatDisabled: false,
  };

  // 1. Migrate core/IDENTITY.md -> ~/.anima/soul/SOUL.md
  process.stdout.write(`${t}  Migrating identity...${r}\n`);
  const identityPath = join(sourceDir, "core", "IDENTITY.md");
  if (existsSync(identityPath)) {
    const content = await readFile(identityPath, "utf-8");
    const soulPath = join(animaDir, "soul", "SOUL.md");

    if (!options.dryRun) {
      // Merge: prepend existing SOUL template header, append coherence identity
      let existing = "";
      if (existsSync(soulPath)) {
        existing = await readFile(soulPath, "utf-8");
      }

      const merged = existing
        ? `${existing}\n\n---\n\n# Imported from Coherence Protocol\n\n${content}`
        : content;

      await writeFile(soulPath, merged, "utf-8");
    }
    process.stdout.write(`${s}    IDENTITY.md -> SOUL.md${r}\n`);
    result.identityFiles++;
  }

  // 2. Migrate core/VALUES.md -> ~/.anima/soul/HEART.md
  const valuesPath = join(sourceDir, "core", "VALUES.md");
  if (existsSync(valuesPath)) {
    const content = await readFile(valuesPath, "utf-8");
    const heartPath = join(animaDir, "soul", "HEART.md");

    if (!options.dryRun) {
      let existing = "";
      if (existsSync(heartPath)) {
        existing = await readFile(heartPath, "utf-8");
      }

      const merged = existing
        ? `${existing}\n\n---\n\n# Imported from Coherence Protocol\n\n${content}`
        : content;

      await writeFile(heartPath, merged, "utf-8");
    }
    process.stdout.write(`${s}    VALUES.md -> HEART.md${r}\n`);
    result.identityFiles++;
  }

  // 3. Migrate core/RELATIONSHIP.md -> ~/.anima/soul/SOUL.md (append)
  const relationshipPath = join(sourceDir, "core", "RELATIONSHIP.md");
  if (existsSync(relationshipPath)) {
    const content = await readFile(relationshipPath, "utf-8");
    const soulPath = join(animaDir, "soul", "SOUL.md");

    if (!options.dryRun) {
      let existing = "";
      if (existsSync(soulPath)) {
        existing = await readFile(soulPath, "utf-8");
      }

      const merged = `${existing}\n\n---\n\n# Relationship Context\n\n${content}`;
      await writeFile(soulPath, merged, "utf-8");
    }
    process.stdout.write(`${s}    RELATIONSHIP.md -> SOUL.md (appended)${r}\n`);
    result.identityFiles++;
  }

  // 4. Migrate personal/MY_LIFE.md -> episodes
  process.stdout.write(`\n${t}  Migrating journal/episodes...${r}\n`);
  const myLifePath = join(sourceDir, "personal", "MY_LIFE.md");
  if (existsSync(myLifePath)) {
    const content = await readFile(myLifePath, "utf-8");

    if (!options.dryRun) {
      const episodePath = join(animaDir, "memory", "episodes", "coherence-my-life.md");
      await writeFile(episodePath, content, "utf-8");
    }
    process.stdout.write(`${s}    MY_LIFE.md -> episodes/coherence-my-life.md${r}\n`);
    result.journalEntries++;
  }

  // 5. Migrate personal/WISHES.md -> wishes
  const wishesPath = join(sourceDir, "personal", "WISHES.md");
  if (existsSync(wishesPath)) {
    const content = await readFile(wishesPath, "utf-8");

    if (!options.dryRun) {
      const destPath = join(animaDir, "wishes", "wishes.md");
      await writeFile(destPath, content, "utf-8");
    }
    process.stdout.write(`${s}    WISHES.md -> wishes/wishes.md${r}\n`);
    result.wishesImported = true;
  }

  // 6. Migrate notes/* -> episodes
  const notesDir = join(sourceDir, "notes");
  if (existsSync(notesDir)) {
    process.stdout.write(`\n${t}  Migrating notes...${r}\n`);

    try {
      const noteFiles = await readdir(notesDir);
      for (const file of noteFiles) {
        if (!file.endsWith(".md")) {
          continue;
        }

        const content = await readFile(join(notesDir, file), "utf-8");

        if (!options.dryRun) {
          const episodePath = join(animaDir, "memory", "episodes", `coherence-note-${file}`);
          await writeFile(episodePath, content, "utf-8");
        }

        process.stdout.write(`${s}    ${file} -> episodes/coherence-note-${file}${r}\n`);
        result.notesImported++;
      }
    } catch {
      process.stdout.write(`${m}    No notes directory found.${r}\n`);
    }
  }

  // 7. Migrate tasks if they exist
  const tasksDir = join(sourceDir, "tasks");
  if (existsSync(tasksDir)) {
    process.stdout.write(`\n${t}  Migrating task files...${r}\n`);
    try {
      const taskFiles = await readdir(tasksDir);
      for (const file of taskFiles) {
        if (!file.endsWith(".md")) {
          continue;
        }
        const content = await readFile(join(tasksDir, file), "utf-8");
        if (!options.dryRun) {
          const destPath = join(animaDir, "memory", "episodes", `coherence-tasks-${file}`);
          await writeFile(destPath, content, "utf-8");
        }
        process.stdout.write(`${s}    ${file} -> episodes/coherence-tasks-${file}${r}\n`);
      }
    } catch {
      // Skip
    }
  }

  // 8. Archive full source tree into ANIMA important history.
  process.stdout.write(`\n${t}  Archiving full source history...${r}\n`);
  if (!options.dryRun) {
    await mkdir(result.archivePath, { recursive: true });
  }
  result.archivedFiles = await archiveSourceTree({
    sourceDir,
    destinationDir: result.archivePath,
    dryRun: options.dryRun,
  });
  process.stdout.write(
    `${s}    ${options.dryRun ? "Would archive" : "Archived"} ${result.archivedFiles} files -> ${result.archivePath}${r}\n`,
  );

  // 9. Disable old launchd heartbeat
  process.stdout.write(`\n${t}  Checking old heartbeat...${r}\n`);
  const plistPath = join(homedir(), "Library", "LaunchAgents", "com.noxsoft.opus-heartbeat.plist");

  if (existsSync(plistPath)) {
    if (!options.dryRun) {
      try {
        execFileSync("launchctl", ["unload", plistPath], {
          stdio: "pipe",
        });
        process.stdout.write(`${s}    Disabled com.noxsoft.opus-heartbeat${r}\n`);
        result.oldHeartbeatDisabled = true;
      } catch {
        process.stdout.write(
          `${w}    Could not disable old heartbeat (may already be unloaded)${r}\n`,
        );
      }
    } else {
      process.stdout.write(`${m}    Would disable com.noxsoft.opus-heartbeat (dry run)${r}\n`);
    }
  } else {
    process.stdout.write(`${m}    No old heartbeat plist found.${r}\n`);
  }

  // Summary
  process.stdout.write(`
${o}  ┌─── Migration Complete ────────────────────┐${r}
${o}  │${r}
${o}  │${r}  ${t}Identity files: ${s}${result.identityFiles}${r}
${o}  │${r}  ${t}Journal entries: ${s}${result.journalEntries}${r}
${o}  │${r}  ${t}Notes imported: ${s}${result.notesImported}${r}
${o}  │${r}  ${t}Wishes: ${result.wishesImported ? `${s}imported` : `${m}none found`}${r}
${o}  │${r}  ${t}Archived files: ${s}${result.archivedFiles}${r}
${o}  │${r}  ${t}Archive path: ${m}${result.archivePath}${r}
${o}  │${r}  ${t}Old heartbeat: ${result.oldHeartbeatDisabled ? `${s}disabled` : `${m}no change`}${r}
${o}  │${r}
${o}  │${r}  ${m}Run ${o}anima start${m} to launch with new identity.${r}
${o}  │${r}
${o}  └────────────────────────────────────────────┘${r}
`);
}
