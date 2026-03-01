/**
 * anima start — Start the ANIMA daemon with heartbeat + REPL.
 *
 * Startup sequence:
 * 1. Load identity from ~/.anima/soul/
 * 2. Initialize BudgetTracker with daily limit
 * 3. Initialize SessionOrchestrator with budget
 * 4. Sync MCP config to ~/.claude/mcp.json
 * 5. Initialize HeartbeatEngine with adaptive intervals
 * 6. Initialize RequestQueue
 * 7. Start heartbeat (async, runs first beat then schedules)
 * 8. Start SVRN node if enabled (compute contributor)
 * 9. Initialize auto-updater
 * 10. Print ANIMA boot banner with identity + budget + SVRN + update status
 * 11. Start AnimaRepl (unless --no-repl)
 * 12. Register SIGINT/SIGTERM handlers for graceful shutdown
 */

import { join } from "node:path";
import { homedir } from "node:os";

import { HeartbeatEngine } from "../heartbeat/engine.js";
import { loadIdentity } from "../identity/loader.js";
import { syncConfig } from "../mcp/config-sync.js";
import { colors, banner } from "../repl/display.js";
import { AnimaRepl } from "../repl/interface.js";
import { RequestQueue } from "../repl/queue.js";
import { BudgetTracker } from "../sessions/budget.js";
import { SessionOrchestrator } from "../sessions/orchestrator.js";
import { SVRNNode, DEFAULT_SVRN_CONFIG } from "../svrn/node.js";
import { loadSVRNConfig } from "../svrn/config.js";
import { AnimaAutoUpdater, loadAutoUpdateConfig } from "../updater/auto-update.js";

export interface StartOptions {
  daemon?: boolean;
  noRepl?: boolean;
  heartbeatInterval?: number;
  budget?: number;
}

export async function startDaemon(options: StartOptions = {}): Promise<void> {
  const { noRepl = false, heartbeatInterval = 300_000, budget: dailyBudget = 200 } = options;

  process.stdout.write(`${colors.muted}  Initializing ANIMA...${colors.reset}\n`);

  // 1. Load identity from ~/.anima/soul/
  const identity = await loadIdentity();
  const identityName = identity.loadedFrom.SOUL === "user" ? "Opus (user)" : "Opus (template)";
  process.stdout.write(`${colors.muted}  Identity loaded: ${identityName}${colors.reset}\n`);

  // 2. Initialize budget tracker
  const budget = new BudgetTracker({
    dailyLimitUsd: dailyBudget,
  });
  await budget.load();

  // 3. Initialize session orchestrator
  const orchestrator = new SessionOrchestrator(budget);

  // 4. Sync MCP config
  try {
    const syncResult = await syncConfig();
    const total = syncResult.added.length + syncResult.updated.length + syncResult.preserved.length;
    process.stdout.write(
      `${colors.muted}  MCP: ${total} servers synced (${syncResult.added.length} added, ${syncResult.removed.length} removed)${colors.reset}\n`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${colors.warning}  MCP sync warning: ${msg}${colors.reset}\n`);
  }

  // 5. Initialize heartbeat engine
  const heartbeat = new HeartbeatEngine(orchestrator, {
    intervalMs: heartbeatInterval,
  });

  // 6. Initialize request queue
  const queue = new RequestQueue();
  await queue.load();

  // 7. Start heartbeat
  process.stdout.write(
    `${colors.muted}  Starting heartbeat (interval: ${heartbeatInterval / 1000}s)...${colors.reset}\n`,
  );

  // Start heartbeat without awaiting (it runs its first beat then schedules)
  heartbeat.start().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${colors.error}  Heartbeat start error: ${msg}${colors.reset}\n`);
  });

  // 8. Start SVRN node if enabled
  const svrnConfig = await loadSVRNConfig();
  const svrnNode = new SVRNNode(svrnConfig);

  if (svrnConfig.enabled) {
    try {
      await svrnNode.start();
      const balance = svrnNode.getEarnings().getBalance();
      process.stdout.write(
        `${colors.success}  SVRN Node: Active${colors.reset} ${colors.muted}|${colors.reset} ` +
          `${colors.accent}Balance: ${balance.toFixed(3)} UCU${colors.reset} ${colors.muted}|${colors.reset} ` +
          `${colors.muted}Node: ${svrnNode.getNodeId().slice(0, 8)}...${colors.reset}\n`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`${colors.warning}  SVRN node warning: ${msg}${colors.reset}\n`);
    }
  } else {
    process.stdout.write(
      `${colors.muted}  SVRN Node: Disabled (run \`anima svrn enable\` to earn UCU)${colors.reset}\n`,
    );
  }

  // 9. Initialize auto-updater
  const autoUpdateConfig = loadAutoUpdateConfig();
  const dataDir = join(homedir(), ".anima");
  const updater = new AnimaAutoUpdater(autoUpdateConfig, dataDir);

  if (autoUpdateConfig.enabled) {
    updater.start();
    const intervalLabel = `${autoUpdateConfig.checkIntervalHours}h`;
    process.stdout.write(
      `${colors.muted}  Auto-update: ${colors.success}enabled${colors.reset} ` +
        `${colors.muted}(checking every ${intervalLabel}, channel: ${autoUpdateConfig.channel})${colors.reset}\n`,
    );

    // Check if an update is already available (from the immediate check)
    updater.on("update-available", (info) => {
      process.stdout.write(
        `\n${colors.warning}  Update available: v${info.currentVersion} -> v${info.latestVersion}${colors.reset}` +
          ` ${colors.muted}(run \`anima self-update\` or \`:update install\` to install)${colors.reset}\n`,
      );
    });
  } else {
    process.stdout.write(
      `${colors.muted}  Auto-update: Disabled${colors.reset}\n`,
    );
  }

  // 10. Print ANIMA boot banner
  const budgetRemaining = budget.getRemaining();
  process.stdout.write(banner(identityName, heartbeat.getBeatCount(), budgetRemaining));
  process.stdout.write("\n");

  // 11. Start REPL (unless headless)
  if (!noRepl) {
    const repl = new AnimaRepl({
      orchestrator,
      heartbeat,
      budget,
      queue,
      svrnNode,
      updater,
    });

    await repl.start();
  } else {
    // Headless mode — just keep running
    process.stdout.write(`${colors.success}  ANIMA running in headless mode.${colors.reset}\n`);
    process.stdout.write(
      `${colors.muted}  Heartbeat active. Press Ctrl+C to stop.${colors.reset}\n`,
    );

    // Register signal handlers for graceful shutdown
    const shutdown = async () => {
      process.stdout.write(`\n${colors.muted}  Shutting down...${colors.reset}\n`);
      heartbeat.stop();
      updater.stop();
      await svrnNode.stop();
      await queue.save();
      await budget.persist();
      process.stdout.write(`${colors.accent}  Amor Fati.${colors.reset}\n`);
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Keep process alive
    const keepAlive = setInterval(() => {}, 60_000);
    keepAlive.unref();
  }
}
