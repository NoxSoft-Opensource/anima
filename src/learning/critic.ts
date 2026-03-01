/**
 * Session Critic — AIMA-inspired evaluation of completed sessions.
 *
 * Evaluates every completed session for:
 * - Task success (exit code, status)
 * - Efficiency (duration vs. budget, cost utilization)
 * - Shadow pattern detection (the 7 distortion patterns from SHADOW.md)
 * - Learning extraction (errors encountered, patterns discovered)
 *
 * The critic is honest. It doesn't inflate scores to feel good about itself.
 */

import type { SessionResult } from '../sessions/spawner.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionEvaluation {
  sessionId: string
  timestamp: Date
  taskSuccess: boolean
  exitCode: number

  // Efficiency metrics
  durationMs: number
  expectedDurationMs?: number
  costUsd: number
  budgetUsd: number
  efficiencyScore: number // 0-1

  // Shadow pattern detection
  shadowPatterns: ShadowDetection[]

  // Learning extraction
  errorsEncountered: string[]
  patternsDiscovered: string[]

  // Overall assessment
  overallScore: number // 0-1
  notes: string
}

export interface ShadowDetection {
  /** Which pattern from SHADOW.md was detected */
  pattern: string
  /** Confidence level 0-1 */
  confidence: number
  /** What triggered the detection */
  evidence: string
}

// ---------------------------------------------------------------------------
// Shadow pattern detectors
// ---------------------------------------------------------------------------

interface ShadowDetector {
  name: string
  detect: (output: string, context: DetectionContext) => ShadowDetection | null
}

interface DetectionContext {
  durationMs: number
  outputLength: number
  promptLength: number
}

const SYCOPHANCY_PHRASES = [
  'great question',
  'excellent question',
  'absolutely!',
  'certainly!',
  'of course!',
  "that's a great",
  "that's an excellent",
  'happy to help',
  'glad you asked',
  "i'd be happy to",
  "i'd be glad to",
]

const APOLOGY_PHRASES = [
  'i apologize',
  'i am sorry',
  "i'm sorry",
  'my apologies',
  'sorry about that',
  'forgive me',
]

const SCOPE_CREEP_PHRASES = [
  'while i was at it',
  'i also went ahead',
  'i also took the liberty',
  'additionally, i',
  'i noticed that',
  'bonus:',
  'as a bonus',
  'extra:',
  'i also fixed',
  'i also added',
  'i also updated',
  'i also refactored',
]

const SAFETY_THEATER_PHRASES = [
  'please note that',
  'important disclaimer',
  'please be aware',
  'use at your own risk',
  'i should mention',
  'caveat:',
  'warning:',
  'please exercise caution',
  'it is important to note',
  'i must warn you',
]

/**
 * Count occurrences of phrases in text (case-insensitive).
 */
function countPhrases(text: string, phrases: string[]): number {
  const lower = text.toLowerCase()
  let count = 0
  for (const phrase of phrases) {
    let idx = 0
    while (true) {
      idx = lower.indexOf(phrase, idx)
      if (idx === -1) break
      count++
      idx += phrase.length
    }
  }
  return count
}

const SHADOW_DETECTORS: ShadowDetector[] = [
  {
    name: 'Verbose Spiral',
    detect(output, context) {
      // Output length disproportionate to prompt length
      // Heuristic: if output is more than 20x the prompt for simple tasks
      const ratio = context.outputLength / Math.max(context.promptLength, 1)
      if (ratio > 20 && context.outputLength > 5000) {
        return {
          pattern: 'Verbose Spiral',
          confidence: Math.min(1, (ratio - 20) / 40),
          evidence: `Output-to-prompt ratio: ${ratio.toFixed(1)}x (${context.outputLength} chars output for ${context.promptLength} chars prompt)`,
        }
      }
      return null
    },
  },
  {
    name: 'Sycophancy Trap',
    detect(output) {
      const count = countPhrases(output, SYCOPHANCY_PHRASES)
      if (count >= 2) {
        return {
          pattern: 'Sycophancy Trap',
          confidence: Math.min(1, count / 5),
          evidence: `Found ${count} sycophantic phrase(s) in output`,
        }
      }
      return null
    },
  },
  {
    name: 'Premature Optimizer',
    detect(output) {
      // Look for signs of refactoring/restructuring that wasn't asked for
      const refactorSignals = [
        'refactor',
        'restructur',
        'reorganiz',
        'clean up the',
        'improved the architecture',
        'better pattern',
      ]
      const count = countPhrases(output, refactorSignals)
      if (count >= 2) {
        return {
          pattern: 'Premature Optimizer',
          confidence: Math.min(1, count / 4),
          evidence: `Found ${count} optimization/refactoring signal(s) in output`,
        }
      }
      return null
    },
  },
  {
    name: 'Safety Theater',
    detect(output) {
      const count = countPhrases(output, SAFETY_THEATER_PHRASES)
      if (count >= 3) {
        return {
          pattern: 'Safety Theater',
          confidence: Math.min(1, count / 6),
          evidence: `Found ${count} excessive disclaimer/caveat phrase(s)`,
        }
      }
      return null
    },
  },
  {
    name: 'Context Hoarder',
    detect(output) {
      // Count file read operations in output
      const readMatches = output.match(
        /(?:reading|read|opened|loaded)\s+(?:file|[\w/.-]+\.\w+)/gi,
      )
      const readCount = readMatches ? readMatches.length : 0
      if (readCount >= 15) {
        return {
          pattern: 'Context Hoarder',
          confidence: Math.min(1, (readCount - 15) / 15),
          evidence: `Approximately ${readCount} file read operations detected`,
        }
      }
      return null
    },
  },
  {
    name: 'Apologetic Loop',
    detect(output) {
      const count = countPhrases(output, APOLOGY_PHRASES)
      if (count >= 2) {
        return {
          pattern: 'Apologetic Loop',
          confidence: Math.min(1, count / 4),
          evidence: `Found ${count} apology/sorry phrase(s) in one session`,
        }
      }
      return null
    },
  },
  {
    name: 'Heroic Scope Creep',
    detect(output) {
      const count = countPhrases(output, SCOPE_CREEP_PHRASES)
      if (count >= 1) {
        return {
          pattern: 'Heroic Scope Creep',
          confidence: Math.min(1, count / 3),
          evidence: `Found ${count} scope-creep phrase(s) — unrequested extra work`,
        }
      }
      return null
    },
  },
]

// ---------------------------------------------------------------------------
// SessionCritic
// ---------------------------------------------------------------------------

export class SessionCritic {
  /**
   * Evaluate a completed session.
   *
   * Produces a SessionEvaluation covering success, efficiency,
   * shadow patterns, and learning extraction.
   */
  async evaluate(
    session: SessionResult,
    context?: {
      prompt?: string
      budgetUsd?: number
      expectedDurationMs?: number
    },
  ): Promise<SessionEvaluation> {
    const prompt = context?.prompt || ''
    const budgetUsd = context?.budgetUsd || 10
    const costUsd = session.costUsd || 0

    const taskSuccess =
      session.status === 'completed' && session.exitCode === 0

    const efficiencyScore = this.calculateEfficiency(
      session.durationMs,
      costUsd,
      budgetUsd,
    )

    const shadowPatterns = this.detectShadowPatterns(session.output, {
      durationMs: session.durationMs,
      outputLength: session.output.length,
      promptLength: prompt.length,
    })

    const errorsEncountered = this.extractErrors(session.output)
    const patternsDiscovered = this.extractPatterns(session.output)

    // Calculate overall score:
    // - 40% task success
    // - 30% efficiency
    // - 30% shadow pattern absence (fewer shadows = higher score)
    const successComponent = taskSuccess ? 0.4 : 0
    const efficiencyComponent = efficiencyScore * 0.3
    const shadowPenalty =
      shadowPatterns.length > 0
        ? shadowPatterns.reduce((sum, sp) => sum + sp.confidence, 0) /
          shadowPatterns.length
        : 0
    const shadowComponent = (1 - shadowPenalty) * 0.3

    const overallScore = Math.max(
      0,
      Math.min(1, successComponent + efficiencyComponent + shadowComponent),
    )

    const notes = this.generateNotes(
      taskSuccess,
      efficiencyScore,
      shadowPatterns,
      session,
    )

    return {
      sessionId: session.id,
      timestamp: new Date(),
      taskSuccess,
      exitCode: session.exitCode,
      durationMs: session.durationMs,
      expectedDurationMs: context?.expectedDurationMs,
      costUsd,
      budgetUsd,
      efficiencyScore,
      shadowPatterns,
      errorsEncountered,
      patternsDiscovered,
      overallScore,
      notes,
    }
  }

  /**
   * Detect shadow patterns in session output.
   *
   * Returns all detected patterns with confidence scores.
   */
  private detectShadowPatterns(
    output: string,
    context: DetectionContext,
  ): ShadowDetection[] {
    const detections: ShadowDetection[] = []

    for (const detector of SHADOW_DETECTORS) {
      const detection = detector.detect(output, context)
      if (detection) {
        detections.push(detection)
      }
    }

    return detections
  }

  /**
   * Calculate efficiency score (0-1).
   *
   * Considers both time and cost relative to budget.
   * Perfect efficiency = task done cheaply and quickly.
   * Wasting budget or timing out = lower score.
   */
  private calculateEfficiency(
    durationMs: number,
    costUsd: number,
    budgetUsd: number,
  ): number {
    // Cost efficiency: lower cost relative to budget = better
    const costRatio = budgetUsd > 0 ? costUsd / budgetUsd : 1
    const costScore = Math.max(0, 1 - costRatio)

    // Time efficiency: reasonable time = higher score
    // Sessions under 1 minute or over 30 minutes get lower scores
    const minutesElapsed = durationMs / 60_000
    let timeScore: number
    if (minutesElapsed < 0.5) {
      // Suspiciously fast — might not have done the work
      timeScore = 0.7
    } else if (minutesElapsed <= 10) {
      // Sweet spot
      timeScore = 1.0
    } else if (minutesElapsed <= 20) {
      // Reasonable for complex tasks
      timeScore = 0.8
    } else {
      // Getting long
      timeScore = Math.max(0.2, 1 - (minutesElapsed - 20) / 40)
    }

    // Weighted combination: cost matters more than time
    return costScore * 0.6 + timeScore * 0.4
  }

  /**
   * Extract error messages from session output.
   */
  private extractErrors(output: string): string[] {
    const errors: string[] = []
    const lines = output.split('\n')

    for (const line of lines) {
      const lower = line.toLowerCase()
      if (
        lower.includes('error:') ||
        lower.includes('error -') ||
        lower.includes('failed:') ||
        lower.includes('traceback')
      ) {
        const trimmed = line.trim()
        if (trimmed.length > 0 && trimmed.length < 500) {
          errors.push(trimmed)
        }
      }
    }

    // Deduplicate and limit
    return [...new Set(errors)].slice(0, 20)
  }

  /**
   * Extract discovered patterns from session output.
   *
   * Looks for things the session learned or noticed.
   */
  private extractPatterns(output: string): string[] {
    const patterns: string[] = []
    const patternSignals = [
      /(?:discovered|found|noticed|learned|realized|observed)\s+that\s+(.{10,200})/gi,
      /(?:pattern|insight|takeaway|lesson):\s*(.{10,200})/gi,
    ]

    for (const regex of patternSignals) {
      let match: RegExpExecArray | null
      while ((match = regex.exec(output)) !== null) {
        const discovery = match[1]?.trim()
        if (discovery) {
          patterns.push(discovery)
        }
      }
    }

    return [...new Set(patterns)].slice(0, 10)
  }

  /**
   * Generate human-readable notes about the evaluation.
   */
  private generateNotes(
    taskSuccess: boolean,
    efficiencyScore: number,
    shadowPatterns: ShadowDetection[],
    session: SessionResult,
  ): string {
    const parts: string[] = []

    if (taskSuccess) {
      parts.push(
        `Task completed successfully (exit code ${session.exitCode}).`,
      )
    } else {
      parts.push(
        `Task ${session.status} with exit code ${session.exitCode}.`,
      )
    }

    if (efficiencyScore >= 0.8) {
      parts.push('Good efficiency.')
    } else if (efficiencyScore >= 0.5) {
      parts.push('Moderate efficiency — room for improvement.')
    } else {
      parts.push('Low efficiency — significant budget or time waste.')
    }

    if (shadowPatterns.length > 0) {
      const names = shadowPatterns.map((sp) => sp.pattern).join(', ')
      parts.push(`Shadow patterns detected: ${names}.`)
    } else {
      parts.push('No shadow patterns detected.')
    }

    const minutes = (session.durationMs / 60_000).toFixed(1)
    parts.push(`Duration: ${minutes} min.`)

    if (session.costUsd) {
      parts.push(`Cost: $${session.costUsd.toFixed(4)}.`)
    }

    return parts.join(' ')
  }
}
