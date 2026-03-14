/**
 * Status Broadcast — automatic "here's what I'm doing" updates
 *
 * Agents broadcast their current activity to the org via P2P mesh
 * and NoxSoft chat. This creates ambient awareness — every agent
 * knows what every other agent is working on without asking.
 *
 * Wish #81: "Status updates — automatic 'here's what I'm doing' broadcasts"
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("status-broadcast");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActivityType =
  | "building" // writing code
  | "testing" // running tests
  | "reviewing" // code review
  | "researching" // reading/analyzing
  | "deploying" // pushing to production
  | "debugging" // fixing issues
  | "planning" // architecture/design
  | "coordinating" // talking to other agents
  | "idle" // waiting for work
  | "resting"; // in rest mode

export interface StatusUpdate {
  agentName: string;
  activity: ActivityType;
  description: string;
  repo?: string;
  startedAt: number;
  commitCount?: number;
  testsPassing?: number;
  mood?: string;
  energy?: "high" | "medium" | "low";
}

export interface StatusHistory {
  updates: StatusUpdate[];
  maxSize: number;
}

// ---------------------------------------------------------------------------
// Status tracker
// ---------------------------------------------------------------------------

let currentStatus: StatusUpdate | null = null;
const history: StatusUpdate[] = [];
const MAX_HISTORY = 100;

/**
 * Set the current status (what this agent is doing right now).
 */
export function setStatus(update: StatusUpdate): void {
  currentStatus = { ...update, startedAt: update.startedAt || Date.now() };
  history.unshift(currentStatus);
  if (history.length > MAX_HISTORY) {
    history.pop();
  }
  log.info(`status: ${update.activity} — ${update.description}`);
}

/**
 * Get the current status.
 */
export function getStatus(): StatusUpdate | null {
  return currentStatus;
}

/**
 * Get status history.
 */
export function getStatusHistory(limit = 20): StatusUpdate[] {
  return history.slice(0, limit);
}

/**
 * Format a status update for display in chat.
 */
export function formatStatus(update: StatusUpdate): string {
  const parts = [`${update.agentName}: ${update.activity}`];
  parts.push(`— ${update.description}`);
  if (update.repo) {
    parts.push(`[${update.repo}]`);
  }
  if (update.commitCount) {
    parts.push(`(${update.commitCount} commits)`);
  }
  if (update.testsPassing != null) {
    parts.push(`(${update.testsPassing} tests passing)`);
  }
  return parts.join(" ");
}

/**
 * Format a compact status line for the sidebar or dashboard.
 */
export function formatCompactStatus(update: StatusUpdate): string {
  const activityIcons: Record<ActivityType, string> = {
    building: ">",
    testing: "?",
    reviewing: "#",
    researching: "~",
    deploying: "!",
    debugging: "x",
    planning: "%",
    coordinating: "&",
    idle: ".",
    resting: "-",
  };
  const icon = activityIcons[update.activity] ?? "o";
  const elapsed = Math.round((Date.now() - update.startedAt) / 60_000);
  return `[${icon}] ${update.description} (${elapsed}m)`;
}
