/**
 * Immediate Memory — in-process RAM context for current session
 *
 * Stores active conversation context, recent tool outputs, and task state.
 * Nothing persists — everything is lost on session end.
 */

import { randomUUID } from "node:crypto";
import type { TieredMemoryEntry } from "../types.js";

export class ImmediateMemory {
  private readonly entries = new Map<string, TieredMemoryEntry>();
  private readonly maxEntries: number;

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries;
  }

  /**
   * Add an entry to immediate memory.
   * If maxEntries is exceeded, the oldest entry is evicted.
   */
  add(
    content: string,
    options?: {
      key?: string;
      topics?: string[];
      metadata?: Record<string, unknown>;
    },
  ): TieredMemoryEntry {
    const id = options?.key ?? randomUUID();
    const now = new Date();
    const entry: TieredMemoryEntry = {
      id,
      tier: "immediate",
      content,
      topics: options?.topics ?? [],
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 1,
      relevanceScore: 1.0,
      metadata: options?.metadata,
    };
    this.entries.set(id, entry);

    // Evict oldest entries if over capacity
    if (this.entries.size > this.maxEntries) {
      const oldest = Array.from(this.entries.entries()).toSorted(
        ([, a], [, b]) => a.createdAt.getTime() - b.createdAt.getTime(),
      );
      const toRemove = oldest.slice(0, this.entries.size - this.maxEntries);
      for (const [key] of toRemove) {
        this.entries.delete(key);
      }
    }

    return entry;
  }

  /**
   * Get an entry by key, updating access tracking.
   */
  get(key: string): TieredMemoryEntry | undefined {
    const entry = this.entries.get(key);
    if (entry) {
      entry.lastAccessedAt = new Date();
      entry.accessCount += 1;
    }
    return entry;
  }

  /**
   * Search immediate memory by substring match (case-insensitive).
   * Returns entries sorted by relevance (access count + recency).
   */
  search(
    query: string,
    options?: {
      topics?: string[];
      limit?: number;
    },
  ): TieredMemoryEntry[] {
    const lower = query.toLowerCase();
    const limit = options?.limit ?? 10;
    const topicFilter = options?.topics;

    const matches: TieredMemoryEntry[] = [];
    for (const entry of this.entries.values()) {
      if (!entry.content.toLowerCase().includes(lower)) {
        continue;
      }
      if (topicFilter && topicFilter.length > 0) {
        const hasMatchingTopic = entry.topics.some((t) =>
          topicFilter.some((f) => t.toLowerCase() === f.toLowerCase()),
        );
        if (!hasMatchingTopic) {
          continue;
        }
      }
      entry.lastAccessedAt = new Date();
      entry.accessCount += 1;
      matches.push(entry);
    }

    // Sort by access count descending, then by recency
    matches.sort((a, b) => {
      const countDiff = b.accessCount - a.accessCount;
      if (countDiff !== 0) {
        return countDiff;
      }
      return b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime();
    });

    return matches.slice(0, limit);
  }

  /**
   * Get all entries, optionally filtered by topics.
   */
  getAll(options?: { topics?: string[] }): TieredMemoryEntry[] {
    const topicFilter = options?.topics;
    const all = Array.from(this.entries.values());
    if (!topicFilter || topicFilter.length === 0) {
      return all;
    }
    return all.filter((entry) =>
      entry.topics.some((t) => topicFilter.some((f) => t.toLowerCase() === f.toLowerCase())),
    );
  }

  /**
   * Remove an entry by key.
   */
  remove(key: string): boolean {
    return this.entries.delete(key);
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Get the number of entries currently held.
   */
  size(): number {
    return this.entries.size;
  }
}
