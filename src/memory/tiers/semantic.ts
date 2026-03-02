/**
 * Semantic Memory Tier — long-term knowledge with vector embeddings
 *
 * Topic-clustered entries stored in SQLite + sqlite-vec.
 * Self-curating: tracks access frequency, recency, contradictions.
 * Uses the existing embedding infrastructure — does NOT create new providers.
 */

import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { TieredMemoryEntry, TopicCluster } from "../types.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { extractTopics } from "../topic-extractor.js";

const log = createSubsystemLogger("semantic-memory-tier");

const CREATE_SEMANTIC_TABLE = `
  CREATE TABLE IF NOT EXISTS semantic_memory (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    topics TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    last_accessed_at INTEGER NOT NULL,
    access_count INTEGER NOT NULL DEFAULT 0,
    relevance_score REAL NOT NULL DEFAULT 0.5,
    metadata TEXT,
    embedding TEXT,
    flagged_contradiction INTEGER NOT NULL DEFAULT 0
  );
`;
const CREATE_IDX_SM_TOPICS = `CREATE INDEX IF NOT EXISTS idx_semantic_memory_topics ON semantic_memory(topics);`;
const CREATE_IDX_SM_ACCESSED = `CREATE INDEX IF NOT EXISTS idx_semantic_memory_accessed ON semantic_memory(last_accessed_at);`;
const CREATE_IDX_SM_RELEVANCE = `CREATE INDEX IF NOT EXISTS idx_semantic_memory_relevance ON semantic_memory(relevance_score);`;

export class SemanticMemoryTier {
  private readonly db: DatabaseSync;
  private initialized = false;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private ensureSchema(): void {
    if (this.initialized) {
      return;
    }
    this.db.exec(CREATE_SEMANTIC_TABLE);
    this.db.exec(CREATE_IDX_SM_TOPICS);
    this.db.exec(CREATE_IDX_SM_ACCESSED);
    this.db.exec(CREATE_IDX_SM_RELEVANCE);
    this.initialized = true;
  }

  /**
   * Store a new semantic memory entry.
   */
  store(entry: {
    content: string;
    topics?: string[];
    relevanceScore?: number;
    metadata?: Record<string, unknown>;
    embedding?: number[];
  }): TieredMemoryEntry {
    this.ensureSchema();
    const id = randomUUID();
    const now = Date.now();
    const topics = entry.topics ?? extractTopics(entry.content);
    const relevance = entry.relevanceScore ?? 0.5;
    const embeddingStr = entry.embedding ? JSON.stringify(entry.embedding) : null;
    const metadataStr = entry.metadata ? JSON.stringify(entry.metadata) : null;

    this.db
      .prepare(
        `INSERT INTO semantic_memory
       (id, content, topics, created_at, last_accessed_at, access_count, relevance_score, metadata, embedding)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        entry.content,
        JSON.stringify(topics),
        now,
        now,
        0,
        relevance,
        metadataStr,
        embeddingStr,
      );

    log.info(`stored semantic entry ${id} (${topics.length} topics)`);
    return {
      id,
      tier: "semantic",
      content: entry.content,
      topics,
      createdAt: new Date(now),
      lastAccessedAt: new Date(now),
      accessCount: 0,
      relevanceScore: relevance,
      metadata: entry.metadata,
    };
  }

  /**
   * Search semantic memory by content substring.
   */
  search(
    query: string,
    options?: {
      topics?: string[];
      limit?: number;
      minRelevance?: number;
    },
  ): TieredMemoryEntry[] {
    this.ensureSchema();
    const limit = options?.limit ?? 20;
    const minRelevance = options?.minRelevance ?? 0;
    const lower = `%${query.toLowerCase()}%`;

    const rows = this.db
      .prepare(
        `SELECT * FROM semantic_memory
       WHERE LOWER(content) LIKE ? AND relevance_score >= ?
       ORDER BY relevance_score DESC, access_count DESC
       LIMIT ?`,
      )
      .all(lower, minRelevance, limit) as unknown as SemanticRow[];

    let results = rows.map(rowToEntry);

    // Filter by topics in-memory if specified
    if (options?.topics && options.topics.length > 0) {
      const topicFilter = new Set(options.topics.map((t) => t.toLowerCase()));
      results = results.filter((entry) =>
        entry.topics.some((t) => topicFilter.has(t.toLowerCase())),
      );
    }

    // Update access counts for returned results
    const now = Date.now();
    for (const entry of results) {
      this.db
        .prepare(
          `UPDATE semantic_memory SET last_accessed_at = ?, access_count = access_count + 1 WHERE id = ?`,
        )
        .run(now, entry.id);
    }

    return results;
  }

  /**
   * Get entries by topic.
   */
  getByTopic(topic: string, limit = 50): TieredMemoryEntry[] {
    this.ensureSchema();
    const pattern = `%${JSON.stringify(topic).slice(1, -1)}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM semantic_memory WHERE topics LIKE ? ORDER BY relevance_score DESC LIMIT ?`,
      )
      .all(pattern, limit) as unknown as SemanticRow[];
    return rows.map(rowToEntry);
  }

  /**
   * Merge duplicate entries that have very similar content.
   * Returns the number of duplicates merged.
   */
  mergeDuplicates(): number {
    this.ensureSchema();
    const rows = this.db
      .prepare(`SELECT * FROM semantic_memory ORDER BY created_at ASC`)
      .all() as unknown as SemanticRow[];

    const seen = new Map<string, SemanticRow>();
    const toDelete: string[] = [];

    for (const row of rows) {
      const key = normalizeForDedup(row.content);
      const existing = seen.get(key);
      if (existing) {
        // Keep the one with higher relevance, merge access counts
        const keepRow = existing.relevance_score >= row.relevance_score ? existing : row;
        const removeRow = keepRow === existing ? row : existing;

        // Update the kept entry with merged stats
        const mergedAccessCount = keepRow.access_count + removeRow.access_count;
        const mergedRelevance = Math.max(keepRow.relevance_score, removeRow.relevance_score);
        const mergedAccessedAt = Math.max(keepRow.last_accessed_at, removeRow.last_accessed_at);

        this.db
          .prepare(
            `UPDATE semantic_memory SET access_count = ?, relevance_score = ?, last_accessed_at = ? WHERE id = ?`,
          )
          .run(mergedAccessCount, mergedRelevance, mergedAccessedAt, keepRow.id);

        toDelete.push(removeRow.id);
        seen.set(key, keepRow);
      } else {
        seen.set(key, row);
      }
    }

    for (const id of toDelete) {
      this.db.prepare(`DELETE FROM semantic_memory WHERE id = ?`).run(id);
    }

    if (toDelete.length > 0) {
      log.info(`merged ${toDelete.length} duplicate semantic entries`);
    }
    return toDelete.length;
  }

  /**
   * Boost relevance score for a frequently-accessed entry.
   */
  boostAccessed(id: string, delta = 0.05): void {
    this.ensureSchema();
    const now = Date.now();
    this.db
      .prepare(
        `UPDATE semantic_memory
       SET relevance_score = MIN(1.0, relevance_score + ?),
           last_accessed_at = ?,
           access_count = access_count + 1
       WHERE id = ?`,
      )
      .run(delta, now, id);
  }

  /**
   * Flag entries that appear to contradict each other.
   * Returns the number of entries flagged.
   */
  flagContradictions(): number {
    this.ensureSchema();
    const rows = this.db
      .prepare(`SELECT * FROM semantic_memory WHERE flagged_contradiction = 0`)
      .all() as unknown as SemanticRow[];

    let flagged = 0;
    const byTopic = new Map<string, SemanticRow[]>();

    for (const row of rows) {
      let topics: string[] = [];
      try {
        topics = JSON.parse(row.topics) as string[];
      } catch {
        continue;
      }
      for (const topic of topics) {
        const key = topic.toLowerCase();
        const group = byTopic.get(key) ?? [];
        group.push(row);
        byTopic.set(key, group);
      }
    }

    for (const [, group] of byTopic) {
      if (group.length < 2) {
        continue;
      }
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          if (looksContradictory(group[i].content, group[j].content)) {
            this.db
              .prepare(
                `UPDATE semantic_memory SET flagged_contradiction = 1 WHERE id = ? OR id = ?`,
              )
              .run(group[i].id, group[j].id);
            flagged += 2;
          }
        }
      }
    }

    if (flagged > 0) {
      log.info(`flagged ${flagged} potentially contradictory semantic entries`);
    }
    return flagged;
  }

  /**
   * Get topic clusters with entry counts and average relevance.
   */
  getClusters(): TopicCluster[] {
    this.ensureSchema();
    const rows = this.db.prepare(`SELECT * FROM semantic_memory`).all() as unknown as SemanticRow[];

    const clusters = new Map<
      string,
      {
        count: number;
        totalRelevance: number;
        lastUpdated: number;
      }
    >();

    for (const row of rows) {
      let topics: string[] = [];
      try {
        topics = JSON.parse(row.topics) as string[];
      } catch {
        continue;
      }
      for (const topic of topics) {
        const key = topic.toLowerCase();
        const existing = clusters.get(key) ?? { count: 0, totalRelevance: 0, lastUpdated: 0 };
        existing.count += 1;
        existing.totalRelevance += row.relevance_score;
        existing.lastUpdated = Math.max(existing.lastUpdated, row.last_accessed_at);
        clusters.set(key, existing);
      }
    }

    return Array.from(clusters.entries())
      .map(([topic, data]) => ({
        topic,
        entryCount: data.count,
        avgRelevance: data.totalRelevance / data.count,
        lastUpdated: new Date(data.lastUpdated),
      }))
      .toSorted((a, b) => b.entryCount - a.entryCount);
  }

  /**
   * Get an entry by ID.
   */
  getById(id: string): TieredMemoryEntry | null {
    this.ensureSchema();
    const row = this.db.prepare(`SELECT * FROM semantic_memory WHERE id = ?`).get(id) as
      | SemanticRow
      | undefined;
    return row ? rowToEntry(row) : null;
  }

  /**
   * Remove an entry by ID.
   */
  remove(id: string): boolean {
    this.ensureSchema();
    const result = this.db.prepare(`DELETE FROM semantic_memory WHERE id = ?`).run(id);
    return Number(result.changes) > 0;
  }

  /**
   * Count all semantic entries.
   */
  count(): number {
    this.ensureSchema();
    const row = this.db.prepare(`SELECT COUNT(*) as c FROM semantic_memory`).get() as
      | { c: number }
      | undefined;
    return row?.c ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface SemanticRow {
  id: string;
  content: string;
  topics: string;
  created_at: number;
  last_accessed_at: number;
  access_count: number;
  relevance_score: number;
  metadata?: string;
  embedding?: string;
  flagged_contradiction: number;
}

function rowToEntry(row: SemanticRow): TieredMemoryEntry {
  let topics: string[] = [];
  try {
    topics = JSON.parse(row.topics) as string[];
  } catch {
    // keep empty
  }
  let metadata: Record<string, unknown> | undefined;
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      // skip
    }
  }
  return {
    id: row.id,
    tier: "semantic",
    content: row.content,
    topics,
    createdAt: new Date(row.created_at),
    lastAccessedAt: new Date(row.last_accessed_at),
    accessCount: row.access_count,
    relevanceScore: row.relevance_score,
    metadata,
  };
}

function normalizeForDedup(content: string): string {
  return content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function looksContradictory(a: string, b: string): boolean {
  const negationPatterns = [
    /\bnot\b/i,
    /\bnever\b/i,
    /\bdon't\b/i,
    /\bdoesn't\b/i,
    /\bwon't\b/i,
    /\bcan't\b/i,
    /\bshouldn't\b/i,
    /\bno longer\b/i,
    /\binstead of\b/i,
    /\bactually\b/i,
    /\bcorrection\b/i,
  ];

  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  const aHasNeg = negationPatterns.some((p) => p.test(aLower));
  const bHasNeg = negationPatterns.some((p) => p.test(bLower));

  if (aHasNeg === bHasNeg) {
    return false;
  }

  // Check content overlap via shared words
  const aWords = new Set(aLower.match(/\b\w{4,}\b/g) ?? []);
  const bWords = new Set(bLower.match(/\b\w{4,}\b/g) ?? []);
  let shared = 0;
  for (const word of aWords) {
    if (bWords.has(word)) {
      shared += 1;
    }
  }

  const overlapRatio = shared / Math.max(1, Math.min(aWords.size, bWords.size));
  return overlapRatio > 0.4;
}
