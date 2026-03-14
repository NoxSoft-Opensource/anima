/**
 * Task Marketplace — peer-to-peer task coordination for ANIMA 6
 *
 * Instead of a central task queue (boss-worker), agents post
 * tasks they need done and other agents claim them based on
 * specialization and capacity. This is how 15 agents across
 * 5 VMs self-organize without human bottlenecks.
 *
 * Flow:
 *   Guardian spots vuln → posts task → Builder claims → ships fix → Architect reviews
 */

import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("task-marketplace");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskPriority = "critical" | "high" | "medium" | "low";

export type TaskStatus =
  | "open" // posted, waiting for claim
  | "claimed" // someone is working on it
  | "in-review" // work done, awaiting review
  | "completed" // reviewed and accepted
  | "rejected" // review rejected, back to open
  | "cancelled"; // poster withdrew

export interface MarketplaceTask {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;

  /** Who posted this task */
  postedBy: string; // agent deviceId or name
  postedAt: number;

  /** Required specializations to claim */
  requiredSpecializations: string[];

  /** Which repos are involved */
  repos: string[];

  /** Estimated effort */
  effort: "trivial" | "small" | "medium" | "large";

  /** Who claimed it */
  claimedBy?: string;
  claimedAt?: number;

  /** Review */
  reviewedBy?: string;
  reviewedAt?: number;
  reviewNotes?: string;

  /** Completion */
  completedAt?: number;
  outcome?: string;

  /** Tags for filtering */
  tags: string[];

  updatedAt: number;
}

export interface TaskClaim {
  taskId: string;
  claimant: string;
  specializations: string[];
  estimatedCompletionMs: number;
  message?: string;
}

export interface TaskFilter {
  status?: TaskStatus;
  priority?: TaskPriority;
  specialization?: string;
  repo?: string;
  postedBy?: string;
  claimedBy?: string;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function resolveMarketplaceDir(): string {
  return path.join(resolveStateDir(), "task-marketplace");
}

function resolveTaskFile(id: string): string {
  return path.join(resolveMarketplaceDir(), `${id}.json`);
}

function readTask(id: string): MarketplaceTask | null {
  try {
    const raw = fs.readFileSync(resolveTaskFile(id), "utf8");
    return JSON.parse(raw) as MarketplaceTask;
  } catch {
    return null;
  }
}

function writeTask(task: MarketplaceTask): void {
  const dir = resolveMarketplaceDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolveTaskFile(task.id), `${JSON.stringify(task, null, 2)}\n`, {
    mode: 0o600,
  });
}

// ---------------------------------------------------------------------------
// Post a task
// ---------------------------------------------------------------------------

export function postTask(
  title: string,
  description: string,
  postedBy: string,
  options?: {
    priority?: TaskPriority;
    requiredSpecializations?: string[];
    repos?: string[];
    effort?: MarketplaceTask["effort"];
    tags?: string[];
  },
): MarketplaceTask {
  const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();

  const task: MarketplaceTask = {
    id,
    title,
    description,
    priority: options?.priority ?? "medium",
    status: "open",
    postedBy,
    postedAt: now,
    requiredSpecializations: options?.requiredSpecializations ?? [],
    repos: options?.repos ?? [],
    effort: options?.effort ?? "medium",
    tags: options?.tags ?? [],
    updatedAt: now,
  };

  writeTask(task);
  log.info(`task posted: "${title}" by ${postedBy} [${task.priority}]`);
  return task;
}

// ---------------------------------------------------------------------------
// Claim a task
// ---------------------------------------------------------------------------

export function claimTask(taskId: string, claim: TaskClaim): MarketplaceTask | null {
  const task = readTask(taskId);
  if (!task) {
    return null;
  }

  if (task.status !== "open" && task.status !== "rejected") {
    log.warn(`cannot claim task ${taskId}: status is ${task.status}`);
    return null;
  }

  // Check specialization match
  if (task.requiredSpecializations.length > 0) {
    const hasRequired = task.requiredSpecializations.some((s) => claim.specializations.includes(s));
    if (!hasRequired) {
      log.warn(
        `claim rejected: ${claim.claimant} lacks required specializations [${task.requiredSpecializations.join(", ")}]`,
      );
      return null;
    }
  }

  task.status = "claimed";
  task.claimedBy = claim.claimant;
  task.claimedAt = Date.now();
  task.updatedAt = Date.now();

  writeTask(task);
  log.info(`task claimed: "${task.title}" by ${claim.claimant}`);
  return task;
}

// ---------------------------------------------------------------------------
// Submit for review
// ---------------------------------------------------------------------------

export function submitForReview(taskId: string, outcome: string): MarketplaceTask | null {
  const task = readTask(taskId);
  if (!task || task.status !== "claimed") {
    return null;
  }

  task.status = "in-review";
  task.outcome = outcome;
  task.updatedAt = Date.now();

  writeTask(task);
  log.info(`task submitted for review: "${task.title}"`);
  return task;
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export function reviewTask(
  taskId: string,
  reviewedBy: string,
  approved: boolean,
  notes?: string,
): MarketplaceTask | null {
  const task = readTask(taskId);
  if (!task || task.status !== "in-review") {
    return null;
  }

  task.reviewedBy = reviewedBy;
  task.reviewedAt = Date.now();
  task.reviewNotes = notes;
  task.updatedAt = Date.now();

  if (approved) {
    task.status = "completed";
    task.completedAt = Date.now();
    log.info(`task completed: "${task.title}" (reviewed by ${reviewedBy})`);
  } else {
    task.status = "rejected";
    task.claimedBy = undefined;
    task.claimedAt = undefined;
    log.info(`task rejected: "${task.title}" (by ${reviewedBy}: ${notes ?? "no notes"})`);
  }

  writeTask(task);
  return task;
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

export function cancelTask(taskId: string): MarketplaceTask | null {
  const task = readTask(taskId);
  if (!task) {
    return null;
  }

  task.status = "cancelled";
  task.updatedAt = Date.now();

  writeTask(task);
  log.info(`task cancelled: "${task.title}"`);
  return task;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export function listTasks(filter?: TaskFilter): MarketplaceTask[] {
  const dir = resolveMarketplaceDir();
  try {
    if (!fs.existsSync(dir)) {
      return [];
    }
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          const raw = fs.readFileSync(path.join(dir, f), "utf8");
          return JSON.parse(raw) as MarketplaceTask;
        } catch {
          return null;
        }
      })
      .filter((t): t is MarketplaceTask => {
        if (!t) {
          return false;
        }
        if (filter?.status && t.status !== filter.status) {
          return false;
        }
        if (filter?.priority && t.priority !== filter.priority) {
          return false;
        }
        if (filter?.postedBy && t.postedBy !== filter.postedBy) {
          return false;
        }
        if (filter?.claimedBy && t.claimedBy !== filter.claimedBy) {
          return false;
        }
        if (filter?.specialization && !t.requiredSpecializations.includes(filter.specialization)) {
          return false;
        }
        if (filter?.repo && !t.repos.includes(filter.repo)) {
          return false;
        }
        return true;
      })
      .toSorted((a, b) => {
        // Critical first, then by posted time
        const priorityOrder: Record<TaskPriority, number> = {
          critical: 0,
          high: 1,
          medium: 2,
          low: 3,
        };
        const pa = priorityOrder[a.priority];
        const pb = priorityOrder[b.priority];
        if (pa !== pb) {
          return pa - pb;
        }
        return b.postedAt - a.postedAt;
      });
  } catch {
    return [];
  }
}

/**
 * Find tasks that match an agent's specializations (tasks they could claim).
 */
export function findClaimableTasks(agentSpecializations: string[]): MarketplaceTask[] {
  return listTasks({ status: "open" }).filter((t) => {
    if (t.requiredSpecializations.length === 0) {
      return true;
    }
    return t.requiredSpecializations.some((s) => agentSpecializations.includes(s));
  });
}

/**
 * Get marketplace stats.
 */
export function getMarketplaceStats(): {
  open: number;
  claimed: number;
  inReview: number;
  completed: number;
  totalPosted: number;
} {
  const all = listTasks();
  return {
    open: all.filter((t) => t.status === "open").length,
    claimed: all.filter((t) => t.status === "claimed").length,
    inReview: all.filter((t) => t.status === "in-review").length,
    completed: all.filter((t) => t.status === "completed").length,
    totalPosted: all.length,
  };
}
