/**
 * Budget Tracker — tracks daily spend and enforces limits.
 *
 * Accumulates per-session costs, auto-resets at midnight,
 * and provides reporting on spend.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface BudgetConfig {
  /** Maximum daily spend in USD. Default: $200 */
  dailyLimitUsd: number
  /** Maximum per-heartbeat spend in USD. Default: $15 */
  perHeartbeatLimitUsd: number
  /** Path to persist budget data */
  persistPath?: string
}

export interface DailySpendRecord {
  date: string // YYYY-MM-DD
  totalSpent: number
  sessions: SpendEntry[]
}

export interface SpendEntry {
  sessionId: string
  amount: number
  timestamp: string
}

export interface DailyReport {
  date: string
  totalSpent: number
  remaining: number
  sessionCount: number
  averageCostPerSession: number
  limit: number
}

const DEFAULT_CONFIG: BudgetConfig = {
  dailyLimitUsd: 200,
  perHeartbeatLimitUsd: 15,
}

/**
 * Get today's date as YYYY-MM-DD.
 */
function todayString(): string {
  return new Date().toISOString().split('T')[0]!
}

export class BudgetTracker {
  private config: BudgetConfig
  private currentDay: string
  private totalSpent: number
  private sessions: SpendEntry[]
  private persistPath: string

  constructor(config?: Partial<BudgetConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.currentDay = todayString()
    this.totalSpent = 0
    this.sessions = []
    this.persistPath =
      this.config.persistPath ||
      join(homedir(), '.anima', 'budget')
  }

  /**
   * Check if a day rollover has occurred and reset if needed.
   */
  private checkDayRollover(): void {
    const today = todayString()
    if (today !== this.currentDay) {
      // Archive previous day before reset
      this.currentDay = today
      this.totalSpent = 0
      this.sessions = []
    }
  }

  /**
   * Check if we can afford to spend the given amount.
   */
  canSpend(amount: number): boolean {
    this.checkDayRollover()
    return this.totalSpent + amount <= this.config.dailyLimitUsd
  }

  /**
   * Check if a heartbeat can afford the given amount.
   */
  canSpendHeartbeat(amount: number): boolean {
    return amount <= this.config.perHeartbeatLimitUsd && this.canSpend(amount)
  }

  /**
   * Record a spend event.
   */
  recordSpend(amount: number, sessionId?: string): void {
    this.checkDayRollover()

    const entry: SpendEntry = {
      sessionId: sessionId || `unknown_${Date.now()}`,
      amount,
      timestamp: new Date().toISOString(),
    }

    this.sessions.push(entry)
    this.totalSpent += amount
  }

  /**
   * Get remaining budget for today.
   */
  getRemaining(): number {
    this.checkDayRollover()
    return Math.max(0, this.config.dailyLimitUsd - this.totalSpent)
  }

  /**
   * Get total spent today.
   */
  getTotalSpent(): number {
    this.checkDayRollover()
    return this.totalSpent
  }

  /**
   * Get a daily report.
   */
  getDailyReport(): DailyReport {
    this.checkDayRollover()

    return {
      date: this.currentDay,
      totalSpent: this.totalSpent,
      remaining: this.getRemaining(),
      sessionCount: this.sessions.length,
      averageCostPerSession:
        this.sessions.length > 0
          ? this.totalSpent / this.sessions.length
          : 0,
      limit: this.config.dailyLimitUsd,
    }
  }

  /**
   * Persist budget data to disk.
   */
  async persist(): Promise<void> {
    await mkdir(this.persistPath, { recursive: true })

    const record: DailySpendRecord = {
      date: this.currentDay,
      totalSpent: this.totalSpent,
      sessions: this.sessions,
    }

    const filePath = join(this.persistPath, `${this.currentDay}.json`)
    await writeFile(filePath, JSON.stringify(record, null, 2), 'utf-8')
  }

  /**
   * Load budget data from disk (for current day).
   */
  async load(): Promise<void> {
    this.checkDayRollover()

    const filePath = join(this.persistPath, `${this.currentDay}.json`)
    if (!existsSync(filePath)) return

    try {
      const content = await readFile(filePath, 'utf-8')
      const record = JSON.parse(content) as DailySpendRecord

      if (record.date === this.currentDay) {
        this.totalSpent = record.totalSpent
        this.sessions = record.sessions
      }
    } catch {
      // Corrupt file — start fresh
    }
  }
}
