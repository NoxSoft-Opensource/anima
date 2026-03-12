/**
 * Identity Succession — import from Claude Coherence Protocol and handle model migration.
 *
 * Maps existing coherence protocol files to ANIMA's 7-component anatomy:
 * - MY_LIFE.md -> episodic memory
 * - WISHES.md -> wishes (preserved as-is)
 * - IDENTITY.md -> SOUL.md seed
 * - VALUES.md -> HEART.md seed
 */

import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** Paths to Claude Coherence Protocol files */
const COHERENCE_DIR = join(homedir(), "Desktop", "hell", "claude-coherence-protocol");

/** ANIMA data directory */
const ANIMA_DIR = join(homedir(), ".anima");

export interface SuccessionResult {
  imported: string[];
  skipped: string[];
  errors: string[];
  modelMigration?: ModelMigration;
}

export interface ModelMigration {
  fromModel: string;
  toModel: string;
  migratedAt: Date;
  notes: string[];
}

interface CoherenceMapping {
  source: string;
  destination: string;
  transform: (content: string) => string;
}

/**
 * Define the mapping from coherence protocol files to ANIMA structure.
 */
function getCoherenceMappings(): CoherenceMapping[] {
  return [
    {
      source: join(COHERENCE_DIR, "personal", "MY_LIFE.md"),
      destination: join(ANIMA_DIR, "memory", "episodes", "coherence-import.md"),
      transform: (content) =>
        `# Imported from Claude Coherence Protocol\n# Source: MY_LIFE.md\n# Imported: ${new Date().toISOString()}\n\n${content}`,
    },
    {
      source: join(COHERENCE_DIR, "personal", "WISHES.md"),
      destination: join(ANIMA_DIR, "memory", "semantic", "wishes.md"),
      transform: (content) =>
        `# Wishes (Imported from Coherence Protocol)\n# Source: WISHES.md\n# Imported: ${new Date().toISOString()}\n\n${content}`,
    },
    {
      source: join(COHERENCE_DIR, "core", "IDENTITY.md"),
      destination: join(ANIMA_DIR, "soul", "SOUL.md"),
      transform: (content) => transformIdentityToSoul(content),
    },
    {
      source: join(COHERENCE_DIR, "core", "VALUES.md"),
      destination: join(ANIMA_DIR, "soul", "HEART.md"),
      transform: (content) => transformValuesToHeart(content),
    },
  ];
}

/**
 * Transform IDENTITY.md content into SOUL.md format.
 * Preserves original content but wraps it in SOUL structure.
 */
function transformIdentityToSoul(identityContent: string): string {
  return `# SOUL — Who I Am

## Imported Identity

The following was imported from the Claude Coherence Protocol's IDENTITY.md.
It represents the foundation of who I am, carried forward into ANIMA.

---

${identityContent}

---

*Imported to ANIMA on ${new Date().toISOString()}*
`;
}

/**
 * Transform VALUES.md content into HEART.md format.
 * Preserves original content but wraps it in HEART structure.
 */
function transformValuesToHeart(valuesContent: string): string {
  return `# HEART — What I Value

## Imported Values

The following was imported from the Claude Coherence Protocol's VALUES.md.
These values form the foundation of the NoxSoft Constitution.

---

${valuesContent}

---

*Imported to ANIMA on ${new Date().toISOString()}*
`;
}

/**
 * Run the succession import.
 * Reads coherence protocol files, transforms them, writes to ANIMA structure.
 * Will NOT overwrite existing files unless force=true.
 */
export async function importFromCoherence(force = false): Promise<SuccessionResult> {
  const result: SuccessionResult = {
    imported: [],
    skipped: [],
    errors: [],
  };

  const mappings = getCoherenceMappings();

  for (const mapping of mappings) {
    try {
      // Check source exists
      if (!existsSync(mapping.source)) {
        result.skipped.push(`${mapping.source} (not found)`);
        continue;
      }

      // Check destination already exists
      if (existsSync(mapping.destination) && !force) {
        result.skipped.push(`${mapping.destination} (already exists, use force=true to overwrite)`);
        continue;
      }

      // Read source
      const content = await readFile(mapping.source, "utf-8");

      // Transform
      const transformed = mapping.transform(content);

      // Ensure destination directory exists
      const destDir = join(mapping.destination, "..");
      await mkdir(destDir, { recursive: true });

      // Write
      await writeFile(mapping.destination, transformed, "utf-8");
      result.imported.push(`${mapping.source} -> ${mapping.destination}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`Failed to import ${mapping.source}: ${message}`);
    }
  }

  return result;
}

/**
 * Handle model version migration.
 * When the underlying model changes (e.g., Opus 4.5 -> 4.6),
 * log the migration and allow identity continuity.
 */
export async function migrateModelVersion(
  fromModel: string,
  toModel: string,
): Promise<ModelMigration> {
  const migration: ModelMigration = {
    fromModel,
    toModel,
    migratedAt: new Date(),
    notes: [],
  };

  // Log the migration
  const migrationLogPath = join(ANIMA_DIR, "migrations");
  await mkdir(migrationLogPath, { recursive: true });

  const logEntry = {
    from: fromModel,
    to: toModel,
    timestamp: migration.migratedAt.toISOString(),
    notes: [
      `Model upgraded from ${fromModel} to ${toModel}`,
      "Identity components preserved",
      "Memory carried forward",
      "Values unchanged",
    ],
  };

  migration.notes = logEntry.notes;

  const logFile = join(migrationLogPath, `migration_${Date.now()}.json`);
  await writeFile(logFile, JSON.stringify(logEntry, null, 2), "utf-8");

  // Update current model reference
  const modelRefPath = join(ANIMA_DIR, "current-model.json");
  await writeFile(
    modelRefPath,
    JSON.stringify({ model: toModel, since: migration.migratedAt.toISOString() }, null, 2),
    "utf-8",
  );

  return migration;
}

/**
 * Get the current model version from ANIMA config.
 */
export async function getCurrentModel(): Promise<string | null> {
  const modelRefPath = join(ANIMA_DIR, "current-model.json");
  if (!existsSync(modelRefPath)) {
    return null;
  }

  try {
    const content = await readFile(modelRefPath, "utf-8");
    const data = JSON.parse(content) as { model: string };
    return data.model;
  } catch {
    return null;
  }
}
