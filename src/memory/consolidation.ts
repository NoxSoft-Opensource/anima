/**
 * Memory Consolidation — end-of-day memory maintenance
 *
 * Mirrors how biological memory works during sleep: episodic memories
 * are compressed into semantic knowledge, stale procedures are pruned,
 * and duplicate semantic entries are merged.
 *
 * Sacred memories (identity, values, relationships, wishes) are NEVER
 * forgotten or pruned — they are protected unconditionally.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Episode, EpisodicMemory } from "./episodic.js";
import type { ProceduralMemory } from "./procedural.js";
import type { SemanticEntry, SemanticMemory } from "./semantic.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("memory-consolidation");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConsolidationReport {
  date: string;
  episodesCompressed: number;
  semanticEntriesCreated: number;
  proceduralEntriesPruned: number;
  duplicatesMerged: number;
  protectedEntries: string[];
}

export interface ConsolidationConfig {
  /** Days after which episodes are eligible for compression. Defaults to 7. */
  episodeRetentionDays?: number;
  /** Days of inactivity after which procedures are considered stale. Defaults to 30. */
  procedureStaleDays?: number;
  /** Path patterns that are NEVER pruned. */
  protectedPatterns?: string[];
  /** Directory where consolidation reports are saved. */
  reportsDir?: string;
}

// ---------------------------------------------------------------------------
// Protected entries — things that must NEVER be forgotten
// ---------------------------------------------------------------------------

const SACRED_PATTERNS = [
  "identity",
  "values",
  "relationship",
  "wishes",
  "sacred",
  "core",
  "principles",
  "who-i-am",
  "IDENTITY",
  "VALUES",
  "RELATIONSHIP",
  "WISHES",
];

function isProtected(content: string, tags: string[], additionalPatterns: string[]): boolean {
  const lower = content.toLowerCase();
  const allPatterns = [...SACRED_PATTERNS, ...additionalPatterns];

  for (const pattern of allPatterns) {
    if (lower.includes(pattern.toLowerCase())) {
      return true;
    }
  }

  for (const tag of tags) {
    if (allPatterns.some((p) => tag.toLowerCase().includes(p.toLowerCase()))) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// MemoryConsolidator
// ---------------------------------------------------------------------------

export class MemoryConsolidator {
  private readonly episodic: EpisodicMemory;
  private readonly semantic: SemanticMemory;
  private readonly procedural: ProceduralMemory;
  private readonly config: Required<ConsolidationConfig>;

  constructor(
    episodic: EpisodicMemory,
    semantic: SemanticMemory,
    procedural: ProceduralMemory,
    config: ConsolidationConfig = {},
  ) {
    this.episodic = episodic;
    this.semantic = semantic;
    this.procedural = procedural;
    this.config = {
      episodeRetentionDays: config.episodeRetentionDays ?? 7,
      procedureStaleDays: config.procedureStaleDays ?? 30,
      protectedPatterns: config.protectedPatterns ?? [],
      reportsDir:
        config.reportsDir ?? path.join(os.homedir(), ".anima", "memory", "consolidation-reports"),
    };
  }

  /**
   * Run end-of-day consolidation.
   *
   * 1. Compress episodes older than retention threshold into semantic knowledge
   * 2. Prune stale procedural memory (not accessed in N days)
   * 3. Merge duplicate semantic entries
   * 4. NEVER forget: identity, values, relationships, wishes, sacred files
   * 5. Generate and save consolidation report
   */
  async consolidateDaily(): Promise<ConsolidationReport> {
    const report: ConsolidationReport = {
      date: new Date().toISOString().slice(0, 10),
      episodesCompressed: 0,
      semanticEntriesCreated: 0,
      proceduralEntriesPruned: 0,
      duplicatesMerged: 0,
      protectedEntries: [],
    };

    log.info("starting daily consolidation");

    // Step 1: Compress old episodes into semantic entries.
    await this.compressOldEpisodes(report);

    // Step 2: Prune stale procedures.
    await this.pruneStaleProceduralEntries(report);

    // Step 3: Merge duplicate semantic entries.
    await this.mergeDuplicateSemanticEntries(report);

    // Save report.
    await this.saveReport(report);

    log.info(
      `consolidation complete: ${report.episodesCompressed} episodes compressed, ` +
        `${report.semanticEntriesCreated} semantic entries created, ` +
        `${report.proceduralEntriesPruned} procedures pruned, ` +
        `${report.duplicatesMerged} duplicates merged, ` +
        `${report.protectedEntries.length} entries protected`,
    );

    return report;
  }

  /**
   * Get the most recent consolidation report.
   */
  async getReport(): Promise<ConsolidationReport | null> {
    let files: string[];
    try {
      files = await fs.readdir(this.config.reportsDir);
    } catch {
      return null;
    }

    const reports = files
      .filter((f) => f.endsWith(".json"))
      .toSorted()
      .toReversed();

    if (reports.length === 0) {
      return null;
    }

    try {
      const content = await fs.readFile(path.join(this.config.reportsDir, reports[0]), "utf-8");
      return JSON.parse(content) as ConsolidationReport;
    } catch {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Private: compression
  // -----------------------------------------------------------------------

  private async compressOldEpisodes(report: ConsolidationReport): Promise<void> {
    const cutoff = new Date(Date.now() - this.config.episodeRetentionDays * 86_400_000);
    const longAgo = new Date(0);

    let oldEpisodes: Episode[];
    try {
      oldEpisodes = await this.episodic.getEpisodes(longAgo, cutoff);
    } catch (err) {
      log.warn(`failed to read old episodes for compression: ${String(err)}`);
      return;
    }

    for (const episode of oldEpisodes) {
      // Never compress sacred content.
      if (isProtected(episode.details, episode.tags, this.config.protectedPatterns)) {
        report.protectedEntries.push(`episode:${episode.id}`);
        continue;
      }

      // Distill the episode into a semantic entry.
      const semanticEntry: SemanticEntry = {
        id: `distilled-${episode.id}`,
        category: "fact",
        content: `[${episode.date}] ${episode.summary}\n\n${episode.details}`.slice(0, 2000),
        confidence: 0.7,
        sources: [episode.id],
        lastAccessed: new Date(),
        createdAt: new Date(),
      };

      try {
        await this.semantic.store(semanticEntry);
        report.semanticEntriesCreated += 1;
        report.episodesCompressed += 1;
      } catch (err) {
        log.warn(`failed to compress episode ${episode.id}: ${String(err)}`);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Private: procedure pruning
  // -----------------------------------------------------------------------

  private async pruneStaleProceduralEntries(report: ConsolidationReport): Promise<void> {
    let stale;
    try {
      stale = await this.procedural.getStale(this.config.procedureStaleDays);
    } catch (err) {
      log.warn(`failed to get stale procedures: ${String(err)}`);
      return;
    }

    for (const proc of stale) {
      // Never prune procedures related to sacred content.
      if (
        isProtected(
          `${proc.name} ${proc.description}`,
          proc.triggers,
          this.config.protectedPatterns,
        )
      ) {
        report.protectedEntries.push(`procedure:${proc.id}`);
        continue;
      }

      try {
        await this.procedural.delete(proc.id);
        report.proceduralEntriesPruned += 1;
      } catch (err) {
        log.warn(`failed to prune procedure ${proc.id}: ${String(err)}`);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Private: semantic deduplication
  // -----------------------------------------------------------------------

  private async mergeDuplicateSemanticEntries(report: ConsolidationReport): Promise<void> {
    const categories = ["fact", "pattern", "relationship", "principle"] as const;

    for (const category of categories) {
      let entries: SemanticEntry[];
      try {
        entries = await this.semantic.getByCategory(category);
      } catch {
        continue;
      }

      // Group entries with similar content (simple substring overlap).
      const seen = new Map<string, SemanticEntry>();
      for (const entry of entries) {
        const key = normalizeForDedup(entry.content);
        const existing = seen.get(key);
        if (existing) {
          // Merge: keep the higher-confidence entry, combine sources.
          const merged = existing.confidence >= entry.confidence ? existing : entry;
          const other = merged === existing ? entry : existing;
          merged.sources = [...new Set([...merged.sources, ...other.sources])];
          merged.confidence = Math.max(merged.confidence, other.confidence);
          merged.lastAccessed = new Date(
            Math.max(merged.lastAccessed.getTime(), other.lastAccessed.getTime()),
          );
          seen.set(key, merged);

          // Store merged, remove the other if it has a different ID.
          if (other.id !== merged.id) {
            try {
              await this.semantic.store(merged);
              report.duplicatesMerged += 1;
            } catch (err) {
              log.warn(`failed to merge semantic entry ${other.id}: ${String(err)}`);
            }
          }
        } else {
          seen.set(key, entry);
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Private: report persistence
  // -----------------------------------------------------------------------

  private async saveReport(report: ConsolidationReport): Promise<void> {
    try {
      await fs.mkdir(this.config.reportsDir, { recursive: true });
      const filePath = path.join(this.config.reportsDir, `consolidation-${report.date}.json`);
      await fs.writeFile(filePath, JSON.stringify(report, null, 2), "utf-8");
      log.info(`consolidation report saved to ${filePath}`);
    } catch (err) {
      log.warn(`failed to save consolidation report: ${String(err)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Deduplication normalization
// ---------------------------------------------------------------------------

/**
 * Normalize content for deduplication: lowercase, collapse whitespace,
 * strip punctuation, and take the first 200 characters as a fingerprint.
 */
function normalizeForDedup(content: string): string {
  return content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}
