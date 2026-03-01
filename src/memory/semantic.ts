/**
 * Semantic Memory — distilled knowledge store
 *
 * Stores facts, patterns, relationships, and principles extracted from
 * episodic memory during consolidation. Each entry has a confidence score
 * that can be updated as new evidence is observed.
 *
 * Entries are stored as individual Markdown files in
 * ~/.anima/memory/semantic/ organized by category.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("semantic-memory");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SemanticCategory = "fact" | "pattern" | "relationship" | "principle";

export interface SemanticEntry {
  id: string;
  category: SemanticCategory;
  content: string;
  confidence: number; // 0-1
  sources: string[]; // episode IDs that contributed
  lastAccessed: Date;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultBasePath(): string {
  return path.join(os.homedir(), ".anima", "memory", "semantic");
}

function entryFilePath(basePath: string, entry: SemanticEntry): string {
  const safeId = entry.id.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(basePath, entry.category, `${safeId}.md`);
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function formatSemanticMarkdown(entry: SemanticEntry): string {
  const lines = [
    `# ${entry.id}`,
    "",
    `- **Category:** ${entry.category}`,
    `- **Confidence:** ${entry.confidence.toFixed(3)}`,
    `- **Sources:** ${entry.sources.join(", ") || "none"}`,
    `- **Last Accessed:** ${entry.lastAccessed.toISOString()}`,
    `- **Created:** ${entry.createdAt.toISOString()}`,
    "",
    "---",
    "",
    entry.content,
    "",
  ];
  return lines.join("\n");
}

function parseSemanticMarkdown(content: string, filePath: string): SemanticEntry | null {
  const lines = content.split("\n");
  const idMatch = lines[0]?.match(/^#\s+(.+)$/);
  const id = idMatch ? idMatch[1].trim() : path.basename(filePath, ".md");

  let category: SemanticCategory = "fact";
  let confidence = 0.5;
  let sources: string[] = [];
  let lastAccessed = new Date();
  let createdAt = new Date();

  for (const line of lines) {
    const catMatch = line.match(/^\s*-\s*\*\*Category:\*\*\s*(.+)$/);
    if (catMatch) {
      const raw = catMatch[1].trim() as SemanticCategory;
      if (["fact", "pattern", "relationship", "principle"].includes(raw)) {
        category = raw;
      }
    }
    const confMatch = line.match(/^\s*-\s*\*\*Confidence:\*\*\s*(.+)$/);
    if (confMatch) {
      const parsed = parseFloat(confMatch[1].trim());
      if (Number.isFinite(parsed)) {
        confidence = clampConfidence(parsed);
      }
    }
    const srcMatch = line.match(/^\s*-\s*\*\*Sources:\*\*\s*(.+)$/);
    if (srcMatch) {
      const raw = srcMatch[1].trim();
      if (raw !== "none") {
        sources = raw.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }
    const laMatch = line.match(/^\s*-\s*\*\*Last Accessed:\*\*\s*(.+)$/);
    if (laMatch) {
      try {
        lastAccessed = new Date(laMatch[1].trim());
      } catch {
        // keep default
      }
    }
    const caMatch = line.match(/^\s*-\s*\*\*Created:\*\*\s*(.+)$/);
    if (caMatch) {
      try {
        createdAt = new Date(caMatch[1].trim());
      } catch {
        // keep default
      }
    }
  }

  const sepIndex = lines.findIndex((l) => l.trim() === "---");
  const entryContent = sepIndex >= 0 ? lines.slice(sepIndex + 1).join("\n").trim() : "";

  return { id, category, content: entryContent, confidence, sources, lastAccessed, createdAt };
}

// ---------------------------------------------------------------------------
// SemanticMemory
// ---------------------------------------------------------------------------

export class SemanticMemory {
  private readonly basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? defaultBasePath();
  }

  /**
   * Store a semantic entry. Overwrites if an entry with the same ID
   * already exists.
   */
  async store(entry: SemanticEntry): Promise<void> {
    const e = { ...entry, id: entry.id || randomUUID() };
    e.confidence = clampConfidence(e.confidence);
    const filePath = entryFilePath(this.basePath, e);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, formatSemanticMarkdown(e), "utf-8");
    log.info(`stored semantic entry ${e.id} (${e.category})`);
  }

  /**
   * Retrieve all entries in a given category.
   */
  async getByCategory(category: SemanticCategory): Promise<SemanticEntry[]> {
    const catDir = path.join(this.basePath, category);
    let files: string[];
    try {
      files = await fs.readdir(catDir);
    } catch {
      return [];
    }

    const entries: SemanticEntry[] = [];
    for (const file of files) {
      if (!file.endsWith(".md")) {
        continue;
      }
      try {
        const content = await fs.readFile(path.join(catDir, file), "utf-8");
        const entry = parseSemanticMarkdown(content, file);
        if (entry) {
          entries.push(entry);
        }
      } catch (err) {
        log.warn(`failed to read semantic entry ${file}: ${String(err)}`);
      }
    }

    return entries;
  }

  /**
   * Search semantic memory by content substring (case-insensitive).
   */
  async search(query: string): Promise<SemanticEntry[]> {
    const lower = query.toLowerCase();
    const results: SemanticEntry[] = [];

    const categories: SemanticCategory[] = ["fact", "pattern", "relationship", "principle"];
    for (const category of categories) {
      const entries = await this.getByCategory(category);
      for (const entry of entries) {
        if (entry.content.toLowerCase().includes(lower)) {
          results.push(entry);
        }
      }
    }

    // Sort by confidence descending.
    results.sort((a, b) => b.confidence - a.confidence);
    return results;
  }

  /**
   * Update the confidence of an entry by a delta (positive or negative).
   * The result is clamped to [0, 1].
   */
  async updateConfidence(id: string, delta: number): Promise<void> {
    const entry = await this.findById(id);
    if (!entry) {
      log.warn(`cannot update confidence: entry ${id} not found`);
      return;
    }
    entry.confidence = clampConfidence(entry.confidence + delta);
    entry.lastAccessed = new Date();
    await this.store(entry);
    log.info(`updated confidence for ${id}: ${entry.confidence.toFixed(3)}`);
  }

  /**
   * Find a single entry by ID across all categories.
   */
  async findById(id: string): Promise<SemanticEntry | null> {
    const categories: SemanticCategory[] = ["fact", "pattern", "relationship", "principle"];
    for (const category of categories) {
      const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_");
      const filePath = path.join(this.basePath, category, `${safeId}.md`);
      try {
        const content = await fs.readFile(filePath, "utf-8");
        return parseSemanticMarkdown(content, filePath);
      } catch {
        // not in this category; try next
      }
    }
    return null;
  }

  /**
   * Get the base path where semantic entries are stored.
   */
  getBasePath(): string {
    return this.basePath;
  }
}
