/**
 * Request Queue — priority-sorted task queue with persistence.
 *
 * Tasks from any source (REPL, heartbeat, API, channel) are queued here
 * and processed in priority order (urgent > high > normal > low > freedom).
 */

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type Priority = "urgent" | "high" | "normal" | "low" | "freedom";
export type QueueItemStatus = "queued" | "running" | "completed" | "failed";

export interface QueueItem {
  id: string;
  prompt: string;
  priority: Priority;
  status: QueueItemStatus;
  source: string; // 'repl' | 'heartbeat' | 'api' | 'channel'
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: string;
  error?: string;
}

/** Serializable form of QueueItem for JSON persistence */
interface QueueItemJSON {
  id: string;
  prompt: string;
  priority: Priority;
  status: QueueItemStatus;
  source: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: string;
  error?: string;
}

const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
  freedom: 4,
};

function comparePriority(a: QueueItem, b: QueueItem): number {
  const pa = PRIORITY_ORDER[a.priority];
  const pb = PRIORITY_ORDER[b.priority];
  if (pa !== pb) {
    return pa - pb;
  }
  // Within same priority, FIFO
  return a.createdAt.getTime() - b.createdAt.getTime();
}

function itemToJSON(item: QueueItem): QueueItemJSON {
  return {
    id: item.id,
    prompt: item.prompt,
    priority: item.priority,
    status: item.status,
    source: item.source,
    createdAt: item.createdAt.toISOString(),
    startedAt: item.startedAt?.toISOString(),
    completedAt: item.completedAt?.toISOString(),
    result: item.result,
    error: item.error,
  };
}

function jsonToItem(json: QueueItemJSON): QueueItem {
  return {
    id: json.id,
    prompt: json.prompt,
    priority: json.priority,
    status: json.status,
    source: json.source,
    createdAt: new Date(json.createdAt),
    startedAt: json.startedAt ? new Date(json.startedAt) : undefined,
    completedAt: json.completedAt ? new Date(json.completedAt) : undefined,
    result: json.result,
    error: json.error,
  };
}

export class RequestQueue {
  private items: QueueItem[] = [];
  private persistPath: string;

  constructor(persistPath?: string) {
    this.persistPath = persistPath || join(homedir(), ".anima", "queue");
  }

  /**
   * Add to queue, sorted by priority then FIFO.
   */
  enqueue(prompt: string, priority: Priority, source: string): QueueItem {
    const item: QueueItem = {
      id: randomUUID().slice(0, 8),
      prompt,
      priority,
      status: "queued",
      source,
      createdAt: new Date(),
    };

    this.items.push(item);
    this.items.sort(comparePriority);
    return item;
  }

  /**
   * Get next item to process (highest priority queued item).
   */
  dequeue(): QueueItem | null {
    const next = this.items.find((item) => item.status === "queued");
    return next || null;
  }

  /**
   * Get all items.
   */
  getAll(): QueueItem[] {
    return [...this.items];
  }

  /**
   * Get pending (queued) items.
   */
  getPending(): QueueItem[] {
    return this.items.filter((item) => item.status === "queued");
  }

  /**
   * Get the currently running item.
   */
  getRunning(): QueueItem | null {
    return this.items.find((item) => item.status === "running") || null;
  }

  /**
   * Mark an item as running.
   */
  markRunning(id: string): void {
    const item = this.items.find((i) => i.id === id);
    if (item) {
      item.status = "running";
      item.startedAt = new Date();
    }
  }

  /**
   * Mark an item as completed.
   */
  markCompleted(id: string, result: string): void {
    const item = this.items.find((i) => i.id === id);
    if (item) {
      item.status = "completed";
      item.completedAt = new Date();
      item.result = result;
    }
  }

  /**
   * Mark an item as failed.
   */
  markFailed(id: string, error: string): void {
    const item = this.items.find((i) => i.id === id);
    if (item) {
      item.status = "failed";
      item.completedAt = new Date();
      item.error = error;
    }
  }

  /**
   * Persist queue to disk.
   */
  async save(): Promise<void> {
    await mkdir(this.persistPath, { recursive: true });

    const filePath = join(this.persistPath, "queue.json");
    const data = {
      version: 1,
      savedAt: new Date().toISOString(),
      items: this.items.map(itemToJSON),
    };

    await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  /**
   * Load queue from disk.
   */
  async load(): Promise<void> {
    const filePath = join(this.persistPath, "queue.json");
    if (!existsSync(filePath)) {
      return;
    }

    try {
      const content = await readFile(filePath, "utf-8");
      const data = JSON.parse(content) as {
        version: number;
        items: QueueItemJSON[];
      };

      this.items = data.items.map(jsonToItem);
      this.items.sort(comparePriority);
    } catch {
      // Corrupt file — start fresh
      this.items = [];
    }
  }

  /**
   * Get queue statistics.
   */
  getStats(): {
    queued: number;
    running: number;
    completed: number;
    failed: number;
  } {
    let queued = 0;
    let running = 0;
    let completed = 0;
    let failed = 0;

    for (const item of this.items) {
      switch (item.status) {
        case "queued":
          queued++;
          break;
        case "running":
          running++;
          break;
        case "completed":
          completed++;
          break;
        case "failed":
          failed++;
          break;
      }
    }

    return { queued, running, completed, failed };
  }

  /**
   * Get the total number of items.
   */
  get size(): number {
    return this.items.length;
  }

  /**
   * Clear completed and failed items older than the given age (in ms).
   */
  prune(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    const before = this.items.length;

    this.items = this.items.filter((item) => {
      if (item.status === "completed" || item.status === "failed") {
        const ts = item.completedAt?.getTime() || item.createdAt.getTime();
        return ts > cutoff;
      }
      return true;
    });

    return before - this.items.length;
  }
}
