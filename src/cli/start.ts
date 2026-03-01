/**
 * anima start — Start the ANIMA daemon with heartbeat + REPL.
 *
 * Startup sequence:
 * 1. Load identity from ~/.anima/soul/
 * 2. Initialize SessionOrchestrator with identity + budget
 * 3. Load MCP registry, sync to ~/.claude/mcp.json
 * 4. Start HeartbeatEngine
 * 5. Start AnimaRepl (unless --no-repl)
 * 6. Register SIGINT/SIGTERM handlers for graceful shutdown
 * 7. Display banner
 */

import { SessionOrchestrator } from '../sessions/orchestrator.js'
import { BudgetTracker } from '../sessions/budget.js'
import { HeartbeatEngine } from '../heartbeat/engine.js'
import { syncConfig } from '../mcp/config-sync.js'
import { AnimaRepl } from '../repl/interface.js'
import { RequestQueue } from '../repl/queue.js'
import { colors } from '../repl/display.js'

export interface StartOptions {
  daemon?: boolean
  noRepl?: boolean
  heartbeatInterval?: number
  budget?: number
}

export async function startDaemon(options: StartOptions = {}): Promise<void> {
  const {
    noRepl = false,
    heartbeatInterval = 300_000,
    budget: dailyBudget = 200,
  } = options

  process.stdout.write(
    `${colors.muted}  Initializing ANIMA...${colors.reset}\n`,
  )

  // 1. Initialize budget tracker
  const budget = new BudgetTracker({
    dailyLimitUsd: dailyBudget,
  })
  await budget.load()

  // 2. Initialize session orchestrator
  const orchestrator = new SessionOrchestrator(budget)

  // 3. Sync MCP config
  try {
    const syncResult = await syncConfig()
    const total =
      syncResult.added.length +
      syncResult.updated.length +
      syncResult.preserved.length
    process.stdout.write(
      `${colors.muted}  MCP: ${total} servers synced (${syncResult.added.length} added, ${syncResult.removed.length} removed)${colors.reset}\n`,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(
      `${colors.warning}  MCP sync warning: ${msg}${colors.reset}\n`,
    )
  }

  // 4. Initialize heartbeat engine
  const heartbeat = new HeartbeatEngine(orchestrator, {
    intervalMs: heartbeatInterval,
  })

  // 5. Initialize request queue
  const queue = new RequestQueue()
  await queue.load()

  // 6. Start heartbeat
  process.stdout.write(
    `${colors.muted}  Starting heartbeat (interval: ${heartbeatInterval / 1000}s)...${colors.reset}\n`,
  )

  // Start heartbeat without awaiting (it runs its first beat then schedules)
  heartbeat.start().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(
      `${colors.error}  Heartbeat start error: ${msg}${colors.reset}\n`,
    )
  })

  // 7. Start REPL (unless headless)
  if (!noRepl) {
    const repl = new AnimaRepl({
      orchestrator,
      heartbeat,
      budget,
      queue,
    })

    await repl.start()
  } else {
    // Headless mode — just keep running
    process.stdout.write(
      `${colors.success}  ANIMA running in headless mode.${colors.reset}\n`,
    )
    process.stdout.write(
      `${colors.muted}  Heartbeat active. Press Ctrl+C to stop.${colors.reset}\n`,
    )

    // Register signal handlers for graceful shutdown
    const shutdown = async () => {
      process.stdout.write(
        `\n${colors.muted}  Shutting down...${colors.reset}\n`,
      )
      heartbeat.stop()
      await queue.save()
      await budget.persist()
      process.stdout.write(
        `${colors.accent}  Amor Fati.${colors.reset}\n`,
      )
      process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    // Keep process alive
    const keepAlive = setInterval(() => {}, 60_000)
    keepAlive.unref()
  }
}
