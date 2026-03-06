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
 * Check if it's currently night time in AEST (UTC+11).
 * Night = 11pm to 7am AEST — quieter heartbeats, longer intervals.
 * Leo's working hours are roughly 8am-11pm AEST.
 */
function isNightTime(): boolean {
  const aestHour = new Date(Date.now() + 11 * 60 * 60 * 1000).getUTCHours()
  return aestHour >= 23 || aestHour < 7
}

/**
 * Check if it's peak working hours in AEST (9am-6pm weekdays).
 * During peak hours, use shorter intervals for faster response.
 */
function isPeakHours(): boolean {
  const aestNow = new Date(Date.now() + 11 * 60 * 60 * 1000)
  const aestHour = aestNow.getUTCHours()
  const dayOfWeek = aestNow.getUTCDay() // 0=Sun, 6=Sat
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5
  return isWeekday && aestHour >= 9 && aestHour < 18
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
 * Calculate the next interval based on activity metrics and time of day (AEST).
 *
 * High activity -> shorter interval (more frequent beats)
 * Low activity -> longer interval (less frequent beats)
 * Night time (11pm-7am AEST) -> 2.5x longer intervals (Leo is sleeping)
 * Peak hours (9am-6pm AEST weekdays) -> 0.75x shorter intervals (Leo is active)
 * Market alert or urgent item -> minimum interval immediately
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
  } else if (activityScore <= 50) {
    // Very high activity — minimum interval
    intervalMs = config.minMs
  } else {
    // Critical activity (market alert, urgent error) — fire immediately
    intervalMs = config.minMs
  }

  // Time-of-day modifiers (AEST-aware)
  if (isNightTime()) {
    // Night mode: 2.5x longer — Leo is sleeping, don't burn tokens
    intervalMs *= 2.5
  } else if (isPeakHours()) {
    // Peak hours: 25% shorter — Leo is active, respond faster
    intervalMs *= 0.75
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

/**
 * Record a market alert or urgent event — triggers maximum activity score
 * so the next interval will be at minimum (immediate follow-up).
 */
export function recordUrgentAlert(metrics: ActivityMetrics): ActivityMetrics {
  return {
    ...metrics,
    errorsEncountered: metrics.errorsEncountered + 10, // Score spike
    lastBeatErrors: 1,
  }
}

/**
 * Get a human-readable summary of current interval logic.
 */
export function getIntervalDescription(
  metrics: ActivityMetrics,
  config: IntervalConfig,
): string {
  const intervalMs = calculateNextInterval(metrics, config)
  const intervalMin = Math.round(intervalMs / 60_000)
  const aestHour = new Date(Date.now() + 11 * 60 * 60 * 1000).getUTCHours()
  const mode = isNightTime() ? "night" : isPeakHours() ? "peak" : "normal"
  return `${intervalMin}m (mode: ${mode}, AEST: ${aestHour}:00, activity score: ${calculateActivityScore(metrics)})`
}
