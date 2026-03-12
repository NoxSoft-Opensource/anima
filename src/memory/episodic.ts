/**
 * Episodic Memory — daily session logs stored as Markdown files
 *
 * Each episode captures what happened during a session: what was discussed,
 * what was built, what was learned. Episodes are stored as individual
 * Markdown files in ~/.anima/memory/episodes/ organized by date.
 *
 * The existing SQLite + sqlite-vec hybrid memory system handles search
 * indexing; this module manages the source-of-truth Markdown files that
 * feed into that index.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("episodic-memory");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Episode {
  id: string;
  date: string; // YYYY-MM-DD
  sessionId: string;
  summary: string;
  details: string;
  tags: string[];
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultBasePath(): string {
  return path.join(os.homedir(), ".anima", "memory", "episodes");
}

function episodeFilePath(basePath: string, episode: Episode): string {
  const safeId = episode.id.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(basePath, episode.date, `${safeId}.md`);
}

function formatEpisodeMarkdown(episode: Episode): string {
  const tagLine = episode.tags.length > 0 ? `tags: ${episode.tags.join(", ")}` : "";
  const lines = [
    `# Episode: ${episode.summary}`,
    "",
    `- **Date:** ${episode.date}`,
    `- **Session:** ${episode.sessionId}`,
    `- **Created:** ${episode.createdAt.toISOString()}`,
    ...(tagLine ? [`- **Tags:** ${episode.tags.join(", ")}`] : []),
    "",
    "---",
    "",
    episode.details,
    "",
  ];
  return lines.join("\n");
}

function parseEpisodeMarkdown(content: string, filePath: string): Episode | null {
  const lines = content.split("\n");
  const summaryMatch = lines[0]?.match(/^#\s+Episode:\s*(.+)$/);
  if (!summaryMatch) {
    return null;
  }
  const summary = summaryMatch[1].trim();

  let date = "";
  let sessionId = "";
  let createdAt = new Date();
  const tags: string[] = [];

  for (const line of lines) {
    const dateMatch = line.match(/^\s*-\s*\*\*Date:\*\*\s*(.+)$/);
    if (dateMatch) {
      date = dateMatch[1].trim();
    }
    const sessionMatch = line.match(/^\s*-\s*\*\*Session:\*\*\s*(.+)$/);
    if (sessionMatch) {
      sessionId = sessionMatch[1].trim();
    }
    const createdMatch = line.match(/^\s*-\s*\*\*Created:\*\*\s*(.+)$/);
    if (createdMatch) {
      try {
        createdAt = new Date(createdMatch[1].trim());
      } catch {
        // keep default
      }
    }
    const tagsMatch = line.match(/^\s*-\s*\*\*Tags:\*\*\s*(.+)$/);
    if (tagsMatch) {
      tags.push(
        ...tagsMatch[1]
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      );
    }
  }

  // Details: everything after the first "---" separator.
  const sepIndex = lines.findIndex((l) => l.trim() === "---");
  const details =
    sepIndex >= 0
      ? lines
          .slice(sepIndex + 1)
          .join("\n")
          .trim()
      : "";

  const id = path.basename(filePath, ".md");

  return { id, date, sessionId, summary, details, tags, createdAt };
}

// ---------------------------------------------------------------------------
// EpisodicMemory
// ---------------------------------------------------------------------------

export class EpisodicMemory {
  private readonly basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? defaultBasePath();
  }

  /**
   * Save a session episode as a Markdown file.
   * If no id is provided, a UUID is generated.
   */
  async saveEpisode(episode: Episode): Promise<void> {
    const ep = { ...episode, id: episode.id || randomUUID() };
    const filePath = episodeFilePath(this.basePath, ep);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const content = formatEpisodeMarkdown(ep);
    await fs.writeFile(filePath, content, "utf-8");
    log.info(`saved episode ${ep.id} to ${filePath}`);
  }

  /**
   * Read episodes within a date range (inclusive).
   */
  async getEpisodes(from: Date, to: Date): Promise<Episode[]> {
    const episodes: Episode[] = [];
    const fromDate = from.toISOString().slice(0, 10);
    const toDate = to.toISOString().slice(0, 10);

    let dirs: string[];
    try {
      dirs = await fs.readdir(this.basePath);
    } catch {
      return [];
    }

    // Filter to date directories within range.
    const dateDirs = dirs
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .filter((d) => d >= fromDate && d <= toDate)
      .toSorted();

    for (const dateDir of dateDirs) {
      const fullDir = path.join(this.basePath, dateDir);
      let files: string[];
      try {
        files = await fs.readdir(fullDir);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.endsWith(".md")) {
          continue;
        }
        const filePath = path.join(fullDir, file);
        try {
          const content = await fs.readFile(filePath, "utf-8");
          const ep = parseEpisodeMarkdown(content, filePath);
          if (ep) {
            episodes.push(ep);
          }
        } catch (err) {
          log.warn(`failed to read episode ${filePath}: ${String(err)}`);
        }
      }
    }

    return episodes;
  }

  /**
   * Get all episodes from today.
   */
  async getToday(): Promise<Episode[]> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 86_400_000 - 1);
    return this.getEpisodes(startOfDay, endOfDay);
  }

  /**
   * Search episodes by content substring (case-insensitive).
   * For full semantic search, use the SQLite hybrid memory system.
   */
  async search(query: string): Promise<Episode[]> {
    const lower = query.toLowerCase();
    const results: Episode[] = [];

    let dirs: string[];
    try {
      dirs = await fs.readdir(this.basePath);
    } catch {
      return [];
    }

    const dateDirs = dirs
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .toSorted()
      .toReversed();

    for (const dateDir of dateDirs) {
      const fullDir = path.join(this.basePath, dateDir);
      let files: string[];
      try {
        files = await fs.readdir(fullDir);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.endsWith(".md")) {
          continue;
        }
        const filePath = path.join(fullDir, file);
        try {
          const content = await fs.readFile(filePath, "utf-8");
          if (content.toLowerCase().includes(lower)) {
            const ep = parseEpisodeMarkdown(content, filePath);
            if (ep) {
              results.push(ep);
            }
          }
        } catch {
          // skip unreadable files
        }
      }
    }

    return results;
  }

  /**
   * Get the base path where episodes are stored.
   */
  getBasePath(): string {
    return this.basePath;
  }
}
