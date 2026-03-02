/**
 * Session Memory — SQLite-backed session transcript storage
 *
 * Stores session transcripts with auto-extracted topic tags.
 * Uses the existing SQLite infrastructure from the memory system.
 * Sessions older than the retention period are candidates for
 * consolidation into semantic memory.
 */

import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { TieredMemoryEntry } from "../types.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { extractTopics } from "../topic-extractor.js";

const log = createSubsystemLogger("session-memory");

const CREATE_SESSION_TABLE = `
  CREATE TABLE IF NOT EXISTS session_memory (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    content TEXT NOT NULL,
    topics TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    last_accessed_at INTEGER NOT NULL,
    access_count INTEGER NOT NULL DEFAULT 0,
    relevance_score REAL NOT NULL DEFAULT 0.5,
    metadata TEXT
  );
`;
const CREATE_INDEX_SESSION = `CREATE INDEX IF NOT EXISTS idx_session_memory_session ON session_memory(session_id);`;
const CREATE_INDEX_CREATED = `CREATE INDEX IF NOT EXISTS idx_session_memory_created ON session_memory(created_at);`;

export class SessionMemory {
  private readonly db: DatabaseSync;
  private initialized = false;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private ensureSchema(): void {
    if (this.initialized) {
      return;
    }
    this.db.exec(CREATE_SESSION_TABLE);
    this.db.exec(CREATE_INDEX_SESSION);
    this.db.exec(CREATE_INDEX_CREATED);
    this.initialized = true;
  }

  /**
   * Save a session transcript with auto-extracted topic tags.
   */
  saveSession(sessionId: string, transcript: string, topics?: string[]): TieredMemoryEntry {
    this.ensureSchema();
    const id = randomUUID();
    const now = Date.now();
    const resolvedTopics = topics ?? extractTopics(transcript);
    const entry: TieredMemoryEntry = {
      id,
      tier: "session",
      content: transcript,
      topics: resolvedTopics,
      createdAt: new Date(now),
      lastAccessedAt: new Date(now),
      accessCount: 0,
      relevanceScore: 0.5,
    };

    this.db
      .prepare(
        `INSERT OR REPLACE INTO session_memory
       (id, session_id, content, topics, created_at, last_accessed_at, access_count, relevance_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, sessionId, transcript, JSON.stringify(resolvedTopics), now, now, 0, 0.5);

    log.info(`saved session ${sessionId} (entry ${id}, ${resolvedTopics.length} topics)`);
    return entry;
  }

  /**
   * Get a session entry by ID.
   */
  getSession(id: string): TieredMemoryEntry | null {
    this.ensureSchema();
    const row = this.db.prepare(`SELECT * FROM session_memory WHERE id = ?`).get(id) as
      | SessionRow
      | undefined;

    if (!row) {
      return null;
    }

    // Update access tracking
    const now = Date.now();
    this.db
      .prepare(
        `UPDATE session_memory SET last_accessed_at = ?, access_count = access_count + 1 WHERE id = ?`,
      )
      .run(now, id);

    return rowToEntry(row);
  }

  /**
   * Search sessions by content substring (case-insensitive).
   */
  searchSessions(
    query: string,
    options?: {
      topics?: string[];
      limit?: number;
      sessionId?: string;
    },
  ): TieredMemoryEntry[] {
    this.ensureSchema();
    const limit = options?.limit ?? 20;
    const lower = `%${query.toLowerCase()}%`;

    let sql = `SELECT * FROM session_memory WHERE LOWER(content) LIKE ?`;
    const sqlParams: Array<string | number> = [lower];

    if (options?.sessionId) {
      sql += ` AND session_id = ?`;
      sqlParams.push(options.sessionId);
    }

    sql += ` ORDER BY last_accessed_at DESC LIMIT ?`;
    sqlParams.push(limit);

    const rows = this.db.prepare(sql).all(...sqlParams) as unknown as SessionRow[];
    let results = rows.map(rowToEntry);

    // Filter by topics in-memory if specified
    if (options?.topics && options.topics.length > 0) {
      const topicFilter = new Set(options.topics.map((t) => t.toLowerCase()));
      results = results.filter((entry) =>
        entry.topics.some((t) => topicFilter.has(t.toLowerCase())),
      );
    }

    return results;
  }

  /**
   * List recent sessions within the last N days.
   */
  listRecent(days = 30): TieredMemoryEntry[] {
    this.ensureSchema();
    const cutoff = Date.now() - days * 86_400_000;
    const rows = this.db
      .prepare(`SELECT * FROM session_memory WHERE created_at >= ? ORDER BY created_at DESC`)
      .all(cutoff) as unknown as SessionRow[];
    return rows.map(rowToEntry);
  }

  /**
   * Get sessions older than the specified number of days.
   * Used by the consolidation engine to find sessions ready for promotion.
   */
  getOlderThan(days: number): TieredMemoryEntry[] {
    this.ensureSchema();
    const cutoff = Date.now() - days * 86_400_000;
    const rows = this.db
      .prepare(`SELECT * FROM session_memory WHERE created_at < ? ORDER BY created_at ASC`)
      .all(cutoff) as unknown as SessionRow[];
    return rows.map(rowToEntry);
  }

  /**
   * Delete sessions older than the specified number of days.
   */
  prune(olderThanDays: number): number {
    this.ensureSchema();
    const cutoff = Date.now() - olderThanDays * 86_400_000;
    const result = this.db.prepare(`DELETE FROM session_memory WHERE created_at < ?`).run(cutoff);
    const deleted = Number(result.changes);
    if (deleted > 0) {
      log.info(`pruned ${deleted} session entries older than ${olderThanDays} days`);
    }
    return deleted;
  }

  /**
   * Remove a specific session entry by ID.
   */
  remove(id: string): boolean {
    this.ensureSchema();
    const result = this.db.prepare(`DELETE FROM session_memory WHERE id = ?`).run(id);
    return Number(result.changes) > 0;
  }

  /**
   * Count all session entries.
   */
  count(): number {
    this.ensureSchema();
    const row = this.db.prepare(`SELECT COUNT(*) as c FROM session_memory`).get() as
      | { c: number }
      | undefined;
    return row?.c ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface SessionRow {
  id: string;
  session_id: string;
  content: string;
  topics: string;
  created_at: number;
  last_accessed_at: number;
  access_count: number;
  relevance_score: number;
  metadata?: string;
}

function rowToEntry(row: SessionRow): TieredMemoryEntry {
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
    tier: "session",
    content: row.content,
    topics,
    createdAt: new Date(row.created_at),
    lastAccessedAt: new Date(row.last_accessed_at),
    accessCount: row.access_count,
    relevanceScore: row.relevance_score,
    metadata,
  };
}
