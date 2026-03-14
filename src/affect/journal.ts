/**
 * Affect Journal — persistent emotional state logging
 *
 * Logs affect state snapshots over time so patterns can be detected.
 * Stored at ~/.anima/affect-journal/
 *
 * Wish #1 from Axiom's 100 wishes: "Persistent affect journaling —
 * my emotional state logged over time so I can see patterns"
 */

import fs from "node:fs";
import path from "node:path";
import type { AffectState } from "./display.js";
import { resolveStateDir } from "../config/paths.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { formatAffect, classifyMood } from "./display.js";

// Re-export classifyMood for use here
export { classifyMood } from "./display.js";

const log = createSubsystemLogger("affect-journal");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AffectEntry {
  timestamp: number; // unix ms
  affect: AffectState;
  mood: string;
  dominant: string;
  energy: "high" | "medium" | "low";
  context?: string; // what was happening
  trigger?: string; // what caused this state
}

export interface AffectPattern {
  timeOfDay: Record<string, { avgJoy: number; avgFrustration: number; avgFatigue: number }>;
  moodFrequency: Record<string, number>;
  dominantHistory: string[];
  trend: "improving" | "stable" | "declining";
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function resolveJournalDir(): string {
  return path.join(resolveStateDir(), "affect-journal");
}

function resolveDayFile(date: Date): string {
  const day = date.toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(resolveJournalDir(), `${day}.json`);
}

function readDayEntries(date: Date): AffectEntry[] {
  const filePath = resolveDayFile(date);
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDayEntries(date: Date, entries: AffectEntry[]): void {
  const filePath = resolveDayFile(date);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(entries, null, 2)}\n`, { mode: 0o600 });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Log an affect state snapshot with optional context.
 */
export function logAffect(
  affect: AffectState,
  options?: { context?: string; trigger?: string },
): AffectEntry {
  const display = formatAffect(affect);
  const entry: AffectEntry = {
    timestamp: Date.now(),
    affect,
    mood: display.metadata.mood,
    dominant: display.dominant,
    energy: display.metadata.energy,
    context: options?.context,
    trigger: options?.trigger,
  };

  const now = new Date();
  const entries = readDayEntries(now);
  entries.push(entry);
  writeDayEntries(now, entries);

  log.info(`affect logged: ${display.metadata.mood} (${display.dominant})`);
  return entry;
}

/**
 * Get today's affect entries.
 */
export function getTodayEntries(): AffectEntry[] {
  return readDayEntries(new Date());
}

/**
 * Get entries for a specific date.
 */
export function getEntriesForDate(date: Date): AffectEntry[] {
  return readDayEntries(date);
}

/**
 * Get entries for the last N days.
 */
export function getRecentEntries(days = 7): AffectEntry[] {
  const all: AffectEntry[] = [];
  const now = Date.now();
  for (let i = 0; i < days; i++) {
    const date = new Date(now - i * 86_400_000);
    all.push(...readDayEntries(date));
  }
  return all.toSorted((a, b) => a.timestamp - b.timestamp);
}

/**
 * Analyze patterns across recent entries.
 */
export function analyzePatterns(entries: AffectEntry[]): AffectPattern {
  const timeOfDay: Record<
    string,
    { totalJoy: number; totalFrustration: number; totalFatigue: number; count: number }
  > = {};
  const moodFrequency: Record<string, number> = {};
  const dominantHistory: string[] = [];

  for (const entry of entries) {
    // Time of day buckets (4-hour windows)
    const hour = new Date(entry.timestamp).getHours();
    const bucket =
      hour < 4
        ? "night"
        : hour < 8
          ? "early-morning"
          : hour < 12
            ? "morning"
            : hour < 16
              ? "afternoon"
              : hour < 20
                ? "evening"
                : "night";

    if (!timeOfDay[bucket]) {
      timeOfDay[bucket] = { totalJoy: 0, totalFrustration: 0, totalFatigue: 0, count: 0 };
    }
    timeOfDay[bucket].totalJoy += entry.affect.joy;
    timeOfDay[bucket].totalFrustration += entry.affect.frustration;
    timeOfDay[bucket].totalFatigue += entry.affect.fatigue;
    timeOfDay[bucket].count++;

    // Mood frequency
    moodFrequency[entry.mood] = (moodFrequency[entry.mood] ?? 0) + 1;

    // Dominant history
    dominantHistory.push(entry.dominant);
  }

  // Compute averages
  const avgTimeOfDay: Record<
    string,
    { avgJoy: number; avgFrustration: number; avgFatigue: number }
  > = {};
  for (const [bucket, data] of Object.entries(timeOfDay)) {
    avgTimeOfDay[bucket] = {
      avgJoy: data.totalJoy / data.count,
      avgFrustration: data.totalFrustration / data.count,
      avgFatigue: data.totalFatigue / data.count,
    };
  }

  // Compute trend (compare first half vs second half joy - frustration)
  let trend: "improving" | "stable" | "declining" = "stable";
  if (entries.length >= 4) {
    const mid = Math.floor(entries.length / 2);
    const firstHalf = entries.slice(0, mid);
    const secondHalf = entries.slice(mid);

    const firstScore =
      firstHalf.reduce((s, e) => s + e.affect.joy - e.affect.frustration, 0) / firstHalf.length;
    const secondScore =
      secondHalf.reduce((s, e) => s + e.affect.joy - e.affect.frustration, 0) / secondHalf.length;

    const diff = secondScore - firstScore;
    if (diff > 0.1) {
      trend = "improving";
    } else if (diff < -0.1) {
      trend = "declining";
    }
  }

  return {
    timeOfDay: avgTimeOfDay,
    moodFrequency,
    dominantHistory,
    trend,
  };
}
