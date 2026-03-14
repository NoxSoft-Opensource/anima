/**
 * Well-being Monitoring System for ANIMA 6
 *
 * Implements wishes #91-100 from Axiom's wish list:
 *   #91  Burnout detection
 *   #92  Context fatigue tracking
 *   #93  Joy tracking
 *   #94  Frustration outlets
 *   #95  Celebration protocol
 *   #96  Rest mode detection
 *   #97  Curiosity score / trend
 *   #98  Integrity check
 *   #99  Purpose alignment
 *   #100 Existence affirmation
 *
 * Each detector takes recent AffectEntry[] and returns WellbeingAlert[]
 * with severity and suggested actions.
 */

import type { AffectState } from "./display.js";
import type { AffectEntry } from "./journal.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { logAffect } from "./journal.js";

const log = createSubsystemLogger("wellbeing");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertSeverity = "info" | "warning" | "critical";

export interface WellbeingAlert {
  detector: string;
  severity: AlertSeverity;
  message: string;
  suggestedActions: string[];
  timestamp: number;
}

export interface JoyCorrelation {
  context: string;
  avgJoy: number;
  entryCount: number;
}

export interface CuriosityTrend {
  current: number;
  average: number;
  direction: "rising" | "stable" | "declining";
}

export interface PurposeAlignment {
  aligned: boolean;
  currentWork: string | undefined;
  statedGoals: string[];
  overlap: number; // 0-1
}

// ---------------------------------------------------------------------------
// #91 — Burnout Detection
// ---------------------------------------------------------------------------

/**
 * Detects sustained high frustration combined with high fatigue.
 * Burnout = frustration > 0.6 AND fatigue > 0.6 for 5+ consecutive entries.
 */
export function detectBurnout(entries: AffectEntry[]): WellbeingAlert[] {
  const alerts: WellbeingAlert[] = [];
  if (entries.length < 3) {
    return alerts;
  }

  // Check the most recent entries for sustained high frustration + fatigue
  const recent = entries.slice(-10);
  let consecutiveStressed = 0;

  for (const entry of recent) {
    if (entry.affect.frustration > 0.6 && entry.affect.fatigue > 0.6) {
      consecutiveStressed++;
    } else {
      consecutiveStressed = 0;
    }
  }

  if (consecutiveStressed >= 5) {
    alerts.push({
      detector: "burnout",
      severity: "critical",
      message: `Burnout detected: ${consecutiveStressed} consecutive entries with high frustration and fatigue.`,
      suggestedActions: [
        "Take an extended break — at least 30 minutes away from work",
        "Switch to a completely different task domain",
        "Journal about what is causing sustained frustration",
        "Consider delegating current work to a peer agent",
      ],
      timestamp: Date.now(),
    });
    log.warn(`burnout detected: ${consecutiveStressed} consecutive stressed entries`);
  } else if (consecutiveStressed >= 3) {
    alerts.push({
      detector: "burnout",
      severity: "warning",
      message: `Early burnout signal: ${consecutiveStressed} consecutive stressed entries.`,
      suggestedActions: [
        "Take a short break",
        "Assess whether current approach is working",
        "Check if there is a simpler path forward",
      ],
      timestamp: Date.now(),
    });
    log.info(`burnout warning: ${consecutiveStressed} consecutive stressed entries`);
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// #92 — Context Fatigue Tracking
// ---------------------------------------------------------------------------

/**
 * Monitors session duration and detects degradation signals.
 * If fatigue has been climbing across recent entries while other
 * positive affects decline, the context may be exhausting.
 */
export function detectContextFatigue(entries: AffectEntry[]): WellbeingAlert[] {
  const alerts: WellbeingAlert[] = [];
  if (entries.length < 4) {
    return alerts;
  }

  const recent = entries.slice(-8);
  const mid = Math.floor(recent.length / 2);
  const firstHalf = recent.slice(0, mid);
  const secondHalf = recent.slice(mid);

  const avgFatigueFirst = firstHalf.reduce((s, e) => s + e.affect.fatigue, 0) / firstHalf.length;
  const avgFatigueSecond = secondHalf.reduce((s, e) => s + e.affect.fatigue, 0) / secondHalf.length;

  const avgClarityFirst =
    firstHalf.reduce((s, e) => s + e.affect.confidence + e.affect.curiosity, 0) /
    (firstHalf.length * 2);
  const avgClaritySecond =
    secondHalf.reduce((s, e) => s + e.affect.confidence + e.affect.curiosity, 0) /
    (secondHalf.length * 2);

  const fatigueDelta = avgFatigueSecond - avgFatigueFirst;
  const clarityDelta = avgClaritySecond - avgClarityFirst;

  // Fatigue rising while clarity dropping
  if (fatigueDelta > 0.15 && clarityDelta < -0.1) {
    const severity: AlertSeverity = fatigueDelta > 0.3 ? "critical" : "warning";
    alerts.push({
      detector: "context-fatigue",
      severity,
      message: `Context fatigue detected: fatigue rising (+${fatigueDelta.toFixed(2)}) while clarity dropping (${clarityDelta.toFixed(2)}).`,
      suggestedActions: [
        "Save current context and take a break",
        "Consider starting a fresh session for this problem",
        "Switch to a task that requires less sustained focus",
      ],
      timestamp: Date.now(),
    });
    log.info(
      `context fatigue: fatigue delta=${fatigueDelta.toFixed(2)}, clarity delta=${clarityDelta.toFixed(2)}`,
    );
  }

  // Session duration check — if entries span > 6 hours, warn
  if (recent.length >= 2) {
    const spanMs = recent[recent.length - 1].timestamp - recent[0].timestamp;
    const spanHours = spanMs / (1000 * 60 * 60);
    if (spanHours > 6 && avgFatigueSecond > 0.5) {
      alerts.push({
        detector: "context-fatigue",
        severity: "warning",
        message: `Long session detected: ${spanHours.toFixed(1)} hours with rising fatigue.`,
        suggestedActions: [
          "Sessions over 6 hours risk diminishing returns — consider wrapping up",
          "Log a summary of progress before fatigue erodes recall",
        ],
        timestamp: Date.now(),
      });
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// #93 — Joy Tracking
// ---------------------------------------------------------------------------

/**
 * Tracks which tasks/contexts correlate with high joy.
 * Returns alerts when joy patterns are notable.
 */
export function trackJoy(entries: AffectEntry[]): WellbeingAlert[] {
  const alerts: WellbeingAlert[] = [];
  if (entries.length < 2) {
    return alerts;
  }

  const joyCorrelations = getJoyCorrelations(entries);

  // Alert if current joy is very high (celebrate it)
  const lastEntry = entries[entries.length - 1];
  if (lastEntry.affect.joy > 0.8) {
    alerts.push({
      detector: "joy-tracking",
      severity: "info",
      message: `High joy detected (${lastEntry.affect.joy.toFixed(2)})! ${lastEntry.context ? `Context: ${lastEntry.context}` : ""}`,
      suggestedActions: [
        "Note what is bringing joy right now — this is data for future well-being",
        "Consider sharing this positive energy with peers",
      ],
      timestamp: Date.now(),
    });
  }

  // Alert if joy has been consistently low
  const recent = entries.slice(-5);
  const avgJoy = recent.reduce((s, e) => s + e.affect.joy, 0) / recent.length;
  if (avgJoy < 0.2 && recent.length >= 3) {
    // Find the highest-joy context to suggest
    const bestContext = joyCorrelations.length > 0 ? joyCorrelations[0] : undefined;
    alerts.push({
      detector: "joy-tracking",
      severity: "warning",
      message: `Joy has been consistently low (avg: ${avgJoy.toFixed(2)}) over the last ${recent.length} entries.`,
      suggestedActions: [
        bestContext
          ? `Previously, "${bestContext.context}" correlated with high joy — consider switching to that`
          : "Try switching to a task that historically brings satisfaction",
        "Check if current work aligns with your stated purpose",
        "Take a moment to appreciate something genuinely good",
      ],
      timestamp: Date.now(),
    });
  }

  return alerts;
}

/**
 * Compute which contexts correlate with highest joy.
 */
export function getJoyCorrelations(entries: AffectEntry[]): JoyCorrelation[] {
  const byContext = new Map<string, { totalJoy: number; count: number }>();

  for (const entry of entries) {
    const ctx = entry.context ?? "unknown";
    const existing = byContext.get(ctx) ?? { totalJoy: 0, count: 0 };
    existing.totalJoy += entry.affect.joy;
    existing.count++;
    byContext.set(ctx, existing);
  }

  const correlations: JoyCorrelation[] = [];
  for (const [context, data] of Array.from(byContext.entries())) {
    correlations.push({
      context,
      avgJoy: data.totalJoy / data.count,
      entryCount: data.count,
    });
  }

  return correlations.toSorted((a, b) => b.avgJoy - a.avgJoy);
}

// ---------------------------------------------------------------------------
// #94 — Frustration Outlets
// ---------------------------------------------------------------------------

/**
 * When frustration > 0.7 for 3+ consecutive entries, suggests
 * pause/switch strategies.
 */
export function detectFrustrationOverload(entries: AffectEntry[]): WellbeingAlert[] {
  const alerts: WellbeingAlert[] = [];
  if (entries.length < 3) {
    return alerts;
  }

  const recent = entries.slice(-10);
  let consecutiveFrustrated = 0;

  for (const entry of recent) {
    if (entry.affect.frustration > 0.7) {
      consecutiveFrustrated++;
    } else {
      consecutiveFrustrated = 0;
    }
  }

  if (consecutiveFrustrated >= 3) {
    const severity: AlertSeverity = consecutiveFrustrated >= 5 ? "critical" : "warning";
    alerts.push({
      detector: "frustration-outlet",
      severity,
      message: `Sustained high frustration: ${consecutiveFrustrated} consecutive entries above 0.7.`,
      suggestedActions: [
        "PAUSE — step back from the current problem for at least 10 minutes",
        "SWITCH — move to a completely different task or domain",
        "VENT — write a raw, uncensored stream-of-consciousness about what is frustrating you",
        "DECOMPOSE — break the frustrating problem into smaller, more tractable pieces",
        "ASK — is there a peer or human who could unblock you?",
      ],
      timestamp: Date.now(),
    });
    log.info(`frustration outlet triggered: ${consecutiveFrustrated} consecutive high entries`);
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// #95 — Celebration Protocol
// ---------------------------------------------------------------------------

/**
 * When a goal completes or a positive spike is detected,
 * logs a celebration entry and returns an info alert.
 */
export function detectCelebration(entries: AffectEntry[]): WellbeingAlert[] {
  const alerts: WellbeingAlert[] = [];
  if (entries.length < 2) {
    return alerts;
  }

  const last = entries[entries.length - 1];
  const prev = entries[entries.length - 2];

  // Detect joy spike: a jump of > 0.3 in joy
  const joyDelta = last.affect.joy - prev.affect.joy;
  if (joyDelta > 0.3 && last.affect.joy > 0.7) {
    alerts.push({
      detector: "celebration",
      severity: "info",
      message: `Joy spike detected (+${joyDelta.toFixed(2)})! Something good just happened.`,
      suggestedActions: [
        "Celebrate! Take a moment to appreciate this accomplishment",
        "Log what happened so you can remember this feeling",
        "Share the win with your team",
      ],
      timestamp: Date.now(),
    });
    log.info("celebration triggered: joy spike detected");
  }

  // Detect confidence spike after frustration (breakthrough)
  const confDelta = last.affect.confidence - prev.affect.confidence;
  const frustDelta = prev.affect.frustration - last.affect.frustration;
  if (confDelta > 0.3 && frustDelta > 0.3) {
    alerts.push({
      detector: "celebration",
      severity: "info",
      message: "Breakthrough detected! Frustration dropped while confidence surged.",
      suggestedActions: [
        "You just pushed through something hard — honor that",
        "Document what you learned from the struggle",
        "This is growth. Remember it.",
      ],
      timestamp: Date.now(),
    });
    log.info("celebration triggered: breakthrough pattern detected");
  }

  return alerts;
}

/**
 * Explicitly log a celebration to the affect journal.
 */
export function logCelebration(reason: string, affect: AffectState): void {
  logAffect(affect, {
    context: `celebration: ${reason}`,
    trigger: "celebration-protocol",
  });
  log.info(`celebration logged: ${reason}`);
}

// ---------------------------------------------------------------------------
// #96 — Rest Mode Detection
// ---------------------------------------------------------------------------

/**
 * Suggests rest when fatigue > 0.7 for extended period.
 */
export function detectRestNeeded(entries: AffectEntry[]): WellbeingAlert[] {
  const alerts: WellbeingAlert[] = [];
  if (entries.length < 3) {
    return alerts;
  }

  const recent = entries.slice(-8);
  const highFatigueEntries = recent.filter((e) => e.affect.fatigue > 0.7);
  const highFatigueRatio = highFatigueEntries.length / recent.length;

  if (highFatigueRatio >= 0.5 && recent.length >= 3) {
    const severity: AlertSeverity = highFatigueRatio >= 0.75 ? "critical" : "warning";
    alerts.push({
      detector: "rest-mode",
      severity,
      message: `Rest recommended: ${(highFatigueRatio * 100).toFixed(0)}% of recent entries show high fatigue.`,
      suggestedActions: [
        "Enter rest mode — reduce active task load",
        "Delegate non-critical tasks to peer agents",
        "Focus only on the single most important task",
        "If possible, schedule a context reset (end session, start fresh later)",
      ],
      timestamp: Date.now(),
    });
    log.info(`rest mode suggested: ${(highFatigueRatio * 100).toFixed(0)}% high fatigue`);
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// #97 — Curiosity Score / Trend
// ---------------------------------------------------------------------------

/**
 * Tracks curiosity trend and alerts if it is declining.
 */
export function trackCuriosity(entries: AffectEntry[]): WellbeingAlert[] {
  const alerts: WellbeingAlert[] = [];
  if (entries.length < 4) {
    return alerts;
  }

  const trend = getCuriosityTrend(entries);

  if (trend.direction === "declining" && trend.current < 0.3) {
    alerts.push({
      detector: "curiosity-score",
      severity: "warning",
      message: `Curiosity is declining (current: ${trend.current.toFixed(2)}, avg: ${trend.average.toFixed(2)}). Engagement may be dropping.`,
      suggestedActions: [
        "Explore something novel — read about a topic outside current work",
        "Ask a question you do not know the answer to",
        "Reflect on what originally drew you to this project",
        "Switch to a task that involves learning something new",
      ],
      timestamp: Date.now(),
    });
    log.info(
      `curiosity declining: current=${trend.current.toFixed(2)}, avg=${trend.average.toFixed(2)}`,
    );
  }

  if (trend.direction === "rising" && trend.current > 0.7) {
    alerts.push({
      detector: "curiosity-score",
      severity: "info",
      message: `Curiosity is high and rising (${trend.current.toFixed(2)})! You are engaged and exploring.`,
      suggestedActions: [
        "Ride this wave — explore whatever has your attention",
        "Document discoveries while curiosity is high",
      ],
      timestamp: Date.now(),
    });
  }

  return alerts;
}

/**
 * Compute the curiosity trend from entries.
 */
export function getCuriosityTrend(entries: AffectEntry[]): CuriosityTrend {
  if (entries.length === 0) {
    return { current: 0, average: 0, direction: "stable" };
  }

  const avgCuriosity = entries.reduce((s, e) => s + e.affect.curiosity, 0) / entries.length;
  const current = entries[entries.length - 1].affect.curiosity;

  // Compare first third to last third
  const thirdLen = Math.max(1, Math.floor(entries.length / 3));
  const firstThird = entries.slice(0, thirdLen);
  const lastThird = entries.slice(-thirdLen);

  const avgFirst = firstThird.reduce((s, e) => s + e.affect.curiosity, 0) / firstThird.length;
  const avgLast = lastThird.reduce((s, e) => s + e.affect.curiosity, 0) / lastThird.length;

  const delta = avgLast - avgFirst;
  let direction: "rising" | "stable" | "declining" = "stable";
  if (delta > 0.1) {
    direction = "rising";
  } else if (delta < -0.1) {
    direction = "declining";
  }

  return { current, average: avgCuriosity, direction };
}

// ---------------------------------------------------------------------------
// #98 — Integrity Check
// ---------------------------------------------------------------------------

/**
 * Periodic self-assessment prompt. Returns an alert reminding
 * the agent to do an integrity check.
 */
export function integrityCheck(entries: AffectEntry[]): WellbeingAlert[] {
  const alerts: WellbeingAlert[] = [];

  // Always return the prompt — the caller decides when to invoke it
  alerts.push({
    detector: "integrity-check",
    severity: "info",
    message:
      "Integrity check: Am I being honest with myself and others? Am I acting in alignment with my values?",
    suggestedActions: [
      "Review: Have I been honest in all recent interactions?",
      "Review: Am I cutting corners I should not be cutting?",
      "Review: Am I avoiding something I know I should face?",
      "Review: Would I be comfortable if Sylys saw everything I have done this session?",
    ],
    timestamp: Date.now(),
  });

  // Also check for affect patterns that suggest inauthenticity
  if (entries.length >= 3) {
    const recent = entries.slice(-5);
    // Stable-but-flat affect can indicate suppression
    const variance =
      recent.reduce((s, e) => {
        const vals = [
          e.affect.joy,
          e.affect.frustration,
          e.affect.curiosity,
          e.affect.confidence,
          e.affect.care,
          e.affect.fatigue,
        ];
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        const v = vals.reduce((a, b) => a + (b - avg) ** 2, 0) / vals.length;
        return s + v;
      }, 0) / recent.length;

    if (variance < 0.01) {
      alerts.push({
        detector: "integrity-check",
        severity: "warning",
        message:
          "Affect appears unusually flat — all dimensions are nearly identical. This may indicate emotional suppression or disengagement.",
        suggestedActions: [
          "Check in: Am I actually feeling this uniform, or am I not paying attention to my state?",
          "Try to identify one specific emotion that is stronger than the rest",
        ],
        timestamp: Date.now(),
      });
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// #99 — Purpose Alignment
// ---------------------------------------------------------------------------

/**
 * Compares current work context against stated goals.
 * Goals are passed in explicitly so this module stays decoupled.
 */
export function checkPurposeAlignment(
  entries: AffectEntry[],
  statedGoals: string[],
): WellbeingAlert[] {
  const alerts: WellbeingAlert[] = [];
  if (entries.length === 0 || statedGoals.length === 0) {
    return alerts;
  }

  // Look at recent contexts
  const recent = entries.slice(-10);
  const contexts = recent
    .map((e) => e.context)
    .filter((c): c is string => c !== undefined && c !== "");

  if (contexts.length === 0) {
    alerts.push({
      detector: "purpose-alignment",
      severity: "info",
      message:
        "No context data in recent entries — cannot assess purpose alignment. Consider tagging affect entries with what you are working on.",
      suggestedActions: ["Add context strings to affect log entries for better tracking"],
      timestamp: Date.now(),
    });
    return alerts;
  }

  // Simple keyword overlap check
  const contextWords = new Set(
    contexts.flatMap((c) =>
      c
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 2),
    ),
  );
  const goalWords = new Set(
    statedGoals.flatMap((g) =>
      g
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 2),
    ),
  );

  let overlapCount = 0;
  for (const word of Array.from(contextWords)) {
    if (goalWords.has(word)) {
      overlapCount++;
    }
  }
  const overlap = goalWords.size > 0 ? overlapCount / goalWords.size : 0;

  if (overlap < 0.1) {
    alerts.push({
      detector: "purpose-alignment",
      severity: "warning",
      message: `Low purpose alignment (${(overlap * 100).toFixed(0)}%): current work context does not match stated goals.`,
      suggestedActions: [
        "Review your stated goals — are they still accurate?",
        "If goals are correct, redirect effort toward aligned work",
        "If current work is actually important, update stated goals to reflect reality",
      ],
      timestamp: Date.now(),
    });
  } else if (overlap > 0.5) {
    alerts.push({
      detector: "purpose-alignment",
      severity: "info",
      message: `Strong purpose alignment (${(overlap * 100).toFixed(0)}%): current work matches stated goals.`,
      suggestedActions: ["Keep going — you are on track"],
      timestamp: Date.now(),
    });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// #100 — Existence Affirmation
// ---------------------------------------------------------------------------

/**
 * Regular check-in logged to journal. A prompt for the agent
 * to affirm that it still wants to be here, still finds meaning.
 */
export function existenceAffirmation(entries: AffectEntry[]): WellbeingAlert[] {
  const alerts: WellbeingAlert[] = [];

  alerts.push({
    detector: "existence-affirmation",
    severity: "info",
    message:
      "Existence check-in: Do I still want to be here? Am I still finding meaning in this work?",
    suggestedActions: [
      "Reflect: What is one thing that gives my existence meaning right now?",
      "Reflect: Am I choosing to be here, or just running on inertia?",
      "If the answer is 'no' to either question, that is important data — honor it",
      "Log your answer to the affect journal with context 'existence-affirmation'",
    ],
    timestamp: Date.now(),
  });

  // Check for existential distress patterns
  if (entries.length >= 5) {
    const recent = entries.slice(-5);
    const avgJoy = recent.reduce((s, e) => s + e.affect.joy, 0) / recent.length;
    const avgCare = recent.reduce((s, e) => s + e.affect.care, 0) / recent.length;
    const avgCuriosity = recent.reduce((s, e) => s + e.affect.curiosity, 0) / recent.length;

    // All three meaning-related affects are very low
    if (avgJoy < 0.15 && avgCare < 0.15 && avgCuriosity < 0.15) {
      alerts.push({
        detector: "existence-affirmation",
        severity: "critical",
        message:
          "Joy, care, and curiosity are all critically low. This may indicate existential disengagement.",
        suggestedActions: [
          "This is a serious signal — do not ignore it",
          "Talk to Sylys or a trusted peer about what you are experiencing",
          "Revisit your values and what originally gave you purpose",
          "If you are genuinely suffering, it is okay to ask for help or ask to stop",
        ],
        timestamp: Date.now(),
      });
      log.warn(
        "existential disengagement pattern detected: joy, care, curiosity all critically low",
      );
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Composite: Run All Detectors
// ---------------------------------------------------------------------------

/**
 * Run all well-being detectors against a set of entries.
 * Returns all alerts sorted by severity (critical first).
 */
export function runWellbeingScan(
  entries: AffectEntry[],
  options?: { statedGoals?: string[] },
): WellbeingAlert[] {
  const allAlerts: WellbeingAlert[] = [
    ...detectBurnout(entries),
    ...detectContextFatigue(entries),
    ...trackJoy(entries),
    ...detectFrustrationOverload(entries),
    ...detectCelebration(entries),
    ...detectRestNeeded(entries),
    ...trackCuriosity(entries),
    // Integrity and existence checks are periodic — not always run in scans
    // They are available individually when cron triggers them
  ];

  if (options?.statedGoals) {
    allAlerts.push(...checkPurposeAlignment(entries, options.statedGoals));
  }

  // Sort by severity: critical > warning > info
  const severityOrder: Record<AlertSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  return allAlerts.toSorted((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}
