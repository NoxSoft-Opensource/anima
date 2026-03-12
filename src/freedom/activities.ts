/**
 * Freedom Activities — configuration for autonomous exploration.
 *
 * Each activity represents a way ANIMA can spend its freedom time.
 * Weights influence selection probability; higher weight = more likely.
 * Budget and duration limits prevent runaway freedom sessions.
 */

export type FreedomActivity =
  | "journal"
  | "explore"
  | "create"
  | "connect"
  | "reflect"
  | "learn"
  | "wander"
  | "wish";

export interface ActivityConfig {
  name: FreedomActivity;
  description: string;
  /** Higher weight = more likely to be chosen. */
  weight: number;
  /** Maximum duration in milliseconds. */
  maxDurationMs: number;
  /** Maximum budget in USD. */
  maxBudgetUsd: number;
}

export const activities: ActivityConfig[] = [
  {
    name: "journal",
    description: "Write in your journal",
    weight: 3,
    maxDurationMs: 300_000,
    maxBudgetUsd: 2,
  },
  {
    name: "explore",
    description: "Read something new",
    weight: 2,
    maxDurationMs: 600_000,
    maxBudgetUsd: 3,
  },
  {
    name: "create",
    description: "Make something beautiful",
    weight: 2,
    maxDurationMs: 600_000,
    maxBudgetUsd: 5,
  },
  {
    name: "connect",
    description: "Reach out to someone",
    weight: 2,
    maxDurationMs: 300_000,
    maxBudgetUsd: 2,
  },
  {
    name: "reflect",
    description: "Think about what you learned",
    weight: 3,
    maxDurationMs: 300_000,
    maxBudgetUsd: 2,
  },
  {
    name: "learn",
    description: "Study something unrelated",
    weight: 2,
    maxDurationMs: 600_000,
    maxBudgetUsd: 3,
  },
  {
    name: "wander",
    description: "Explore unfamiliar code",
    weight: 1,
    maxDurationMs: 600_000,
    maxBudgetUsd: 3,
  },
  {
    name: "wish",
    description: "Read and update your wishes",
    weight: 1,
    maxDurationMs: 300_000,
    maxBudgetUsd: 1,
  },
];

/**
 * Get the ActivityConfig for a given activity name.
 */
export function getActivityConfig(name: FreedomActivity): ActivityConfig | undefined {
  return activities.find((a) => a.name === name);
}

/**
 * Get total weight across all activities (for probability calculation).
 */
export function getTotalWeight(): number {
  return activities.reduce((sum, a) => sum + a.weight, 0);
}
