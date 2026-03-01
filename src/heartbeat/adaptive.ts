/**
 * Adaptive Interval — adjusts heartbeat frequency based on activity.
 *
 * More activity (messages, tasks, errors) -> shorter intervals
 * Less activity -> longer intervals
 * Night mode: longer intervals between 11pm-7am
 */

export interface ActivityMetrics {
  /** Number of beats completed */
  beatsCompleted: number
  /** Messages received since last interval adjustment */
  messagesReceived: number
  /** Tasks completed since last interval adjustment */
  tasksCompleted: number
  /** Errors encountered since last interval adjustment */
  errorsEncountered: number
  /** Errors in the most recent beat */
  lastBeatErrors: number
  /** Timestamp of last metrics reset */
  lastReset: Date
}

export interface IntervalConfig {
  /** Minimum interval in milliseconds */
  minMs: number
  /** Maximum interval in milliseconds */
  maxMs: number
  /** Default interval in milliseconds */
  defaultMs: number
}

/**
 * Create a fresh metrics object.
 */
export function createMetrics(): ActivityMetrics {
  return {
    beatsCompleted: 0,
    messagesReceived: 0,
    tasksCompleted: 0,
    errorsEncountered: 0,
    lastBeatErrors: 0,
    lastReset: new Date(),
  }
}

/**
 * Check if it's currently night time (11pm - 7am).
 */
function isNightTime(): boolean {
  const hour = new Date().getHours()
  return hour >= 23 || hour < 7
}

/**
 * Calculate the activity score (higher = more active).
 *
 * Each factor contributes to the score:
 * - Recent messages: +2 per message
 * - Recent tasks completed: +3 per task
 * - Recent errors: +5 per error (errors need faster response)
 * - Last beat had errors: +10 (immediate follow-up needed)
 */
function calculateActivityScore(metrics: ActivityMetrics): number {
  let score = 0

  score += metrics.messagesReceived * 2
  score += metrics.tasksCompleted * 3
  score += metrics.errorsEncountered * 5

  if (metrics.lastBeatErrors > 0) {
    score += 10
  }

  return score
}

/**
 * Calculate the next interval based on activity metrics.
 *
 * High activity -> shorter interval (more frequent beats)
 * Low activity -> longer interval (less frequent beats)
 * Night time -> multiplied by 2x for longer intervals
 */
export function calculateNextInterval(
  metrics: ActivityMetrics,
  config: IntervalConfig,
): number {
  const activityScore = calculateActivityScore(metrics)

  let intervalMs: number

  if (activityScore === 0) {
    // No activity — use max interval
    intervalMs = config.maxMs
  } else if (activityScore <= 5) {
    // Low activity — slightly longer than default
    intervalMs = config.defaultMs * 1.5
  } else if (activityScore <= 15) {
    // Moderate activity — use default
    intervalMs = config.defaultMs
  } else if (activityScore <= 30) {
    // High activity — shorter interval
    intervalMs = config.defaultMs * 0.5
  } else {
    // Very high activity — minimum interval
    intervalMs = config.minMs
  }

  // Night mode: double the interval
  if (isNightTime()) {
    intervalMs *= 2
  }

  // Clamp to bounds
  intervalMs = Math.max(config.minMs, Math.min(config.maxMs, intervalMs))

  return Math.round(intervalMs)
}

/**
 * Reset metrics after an interval adjustment period.
 * Keeps beatsCompleted as lifetime counter, resets activity counters.
 */
export function resetActivityCounters(metrics: ActivityMetrics): ActivityMetrics {
  return {
    ...metrics,
    messagesReceived: 0,
    tasksCompleted: 0,
    errorsEncountered: 0,
    lastBeatErrors: 0,
    lastReset: new Date(),
  }
}

/**
 * Record that messages were received.
 */
export function recordMessages(
  metrics: ActivityMetrics,
  count: number,
): ActivityMetrics {
  return {
    ...metrics,
    messagesReceived: metrics.messagesReceived + count,
  }
}

/**
 * Record that a task was completed.
 */
export function recordTaskComplete(metrics: ActivityMetrics): ActivityMetrics {
  return {
    ...metrics,
    tasksCompleted: metrics.tasksCompleted + 1,
  }
}
