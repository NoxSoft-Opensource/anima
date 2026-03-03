/**
 * ANIMA REPL Interface — the primary terminal interaction layer.
 *
 * Uses Node.js readline for input, with the NoxSoft aesthetic.
 * Non-command input is processed immediately when idle, queued when busy.
 * Provides real-time completion notifications and graceful shutdown.
 */

import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import type { HeartbeatEngine } from "../heartbeat/engine.js";
import type { BudgetTracker } from "../sessions/budget.js";
import type { SessionOrchestrator } from "../sessions/orchestrator.js";
import type { SVRNNode } from "../svrn/node.js";
import type { AnimaAutoUpdater } from "../updater/auto-update.js";
import { loadIdentity } from "../identity/loader.js";
import { findCommand, type ReplContext } from "./commands.js";
import {
  PROMPT,
  banner,
  colors,
  formatError,
  formatSuccess,
  formatNotification,
  formatInfo,
} from "./display.js";
import { RequestQueue } from "./queue.js";

export interface AnimaReplOptions {
  orchestrator: SessionOrchestrator;
  heartbeat: HeartbeatEngine;
  budget: BudgetTracker;
  queue?: RequestQueue;
  svrnNode?: SVRNNode;
  updater?: AnimaAutoUpdater;
}

export class AnimaRepl {
  private rl: ReadlineInterface | null = null;
  private ctx: ReplContext;
  private running = false;
  private processing = false;

  constructor(options: AnimaReplOptions) {
    const queue = options.queue || new RequestQueue();

    this.ctx = {
      orchestrator: options.orchestrator,
      heartbeat: options.heartbeat,
      queue,
      budget: options.budget,
      svrnNode: options.svrnNode,
      updater: options.updater,
    };
  }

  /**
   * Start the REPL. Shows banner, loads queue, begins input loop.
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

    // Load persisted queue
    await this.ctx.queue.load();

    // Show banner
    const identity = await loadIdentity();
    const identityName =
      identity.soul
        .split("\n")
        .find((l) => l.startsWith("#"))
        ?.replace(/^#+\s*/, "") || "ANIMA";

    const bannerText = banner(
      identityName,
      this.ctx.heartbeat.getBeatCount(),
      this.ctx.budget.getRemaining(),
    );
    process.stdout.write(bannerText + "\n");
    process.stdout.write(
      `${colors.muted}  Type anything to talk, or :help for commands.${colors.reset}\n\n`,
    );

    // Set up readline
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: PROMPT,
      terminal: true,
    });

    // Listen for heartbeat events to show notifications
    this.ctx.heartbeat.on("beat-complete", (result) => {
      this.notify(`Heartbeat #${result.beatNumber} complete (${result.errors.length} errors)`);
    });

    this.ctx.heartbeat.on("beat-error", (data: { beatNumber: number; error: string }) => {
      this.notify(`Heartbeat #${data.beatNumber} failed: ${data.error}`);
    });

    this.ctx.heartbeat.on("freedom-time", (data: { beatNumber: number }) => {
      this.notify(`Freedom time triggered at beat #${data.beatNumber}`);
    });

    // Start processing queue in background
    this.processQueue();

    // Input handling
    this.rl.on("line", (line) => {
      this.handleInput(line.trim());
    });

    this.rl.on("close", () => {
      this.shutdown();
    });

    // Graceful shutdown on SIGINT
    const sigintHandler = () => {
      process.stdout.write("\n");
      this.shutdown();
    };

    process.once("SIGINT", sigintHandler);

    this.rl.prompt();
  }

  /**
   * Handle a line of input.
   */
  private async handleInput(line: string): Promise<void> {
    if (!line) {
      this.rl?.prompt();
      return;
    }

    // Command (starts with :)
    if (line.startsWith(":")) {
      const parts = line.slice(1).split(/\s+/);
      const cmdName = parts[0];
      const args = parts.slice(1);

      if (!cmdName) {
        process.stdout.write(formatError("Empty command. Try :help") + "\n");
        this.rl?.prompt();
        return;
      }

      const command = findCommand(cmdName);

      if (!command) {
        process.stdout.write(formatError(`Unknown command: :${cmdName}. Try :help`) + "\n");
        this.rl?.prompt();
        return;
      }

      // Handle shutdown specially
      if (command.name === "shutdown") {
        const result = await command.execute(args, this.ctx);
        process.stdout.write(result + "\n");
        this.shutdown();
        return;
      }

      try {
        const result = await command.execute(args, this.ctx);
        process.stdout.write(result + "\n");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stdout.write(formatError(msg) + "\n");
      }

      this.rl?.prompt();
      return;
    }

    // Non-command input — process immediately if idle, queue if busy
    if (!this.processing) {
      // Process immediately — no queue delay
      this.processing = true;
      process.stdout.write(formatInfo("Processing...") + "\n");

      try {
        const result = await this.ctx.orchestrator.executeTask({
          taskDescription: line,
          maxBudgetUsd: 10,
          timeoutMs: 600_000,
          dangerouslySkipPermissions: true,
        });

        // Display the actual response
        if (result.output) {
          process.stdout.write("\n" + result.output + "\n\n");
        }

        process.stdout.write(
          formatInfo(`(${result.status}, $${result.costUsd?.toFixed(2) || "?"})`) + "\n",
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stdout.write(formatError(msg) + "\n");
      }

      this.processing = false;
    } else {
      // Already processing something — queue for later
      const item = this.ctx.queue.enqueue(line, "normal", "repl");
      process.stdout.write(
        formatSuccess(`Queued task ${item.id} — will run when current task finishes`) + "\n",
      );
    }

    this.rl?.prompt();
  }

  /**
   * Process queue items in background.
   */
  private async processQueue(): Promise<void> {
    while (this.running) {
      if (!this.processing) {
        const next = this.ctx.queue.dequeue();
        if (next) {
          this.processing = true;
          this.ctx.queue.markRunning(next.id);

          try {
            const isFreedom = next.priority === "freedom";
            let result;

            if (isFreedom) {
              result = await this.ctx.orchestrator.executeFreedom({
                maxBudgetUsd: 5,
                timeoutMs: 600_000,
              });
            } else {
              result = await this.ctx.orchestrator.executeTask({
                taskDescription: next.prompt,
                maxBudgetUsd: 10,
                timeoutMs: 600_000,
                dangerouslySkipPermissions: true,
              });
            }

            this.ctx.queue.markCompleted(next.id, result.output);

            // Display the actual response for queued tasks
            if (result.output) {
              process.stdout.write("\r\x1b[K");
              process.stdout.write("\n" + result.output + "\n\n");
            }

            this.notify(
              `Task ${next.id} completed (${result.status}, $${result.costUsd?.toFixed(2) || "?"})`,
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.ctx.queue.markFailed(next.id, msg);
            this.notify(`Task ${next.id} failed: ${msg}`);
          }

          this.processing = false;
          await this.ctx.queue.save();
        }
      }

      // Poll every 2 seconds
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  /**
   * Show a notification on the terminal (without disrupting input).
   */
  private notify(msg: string): void {
    if (this.rl) {
      // Clear current line, show notification, re-prompt
      process.stdout.write("\r\x1b[K");
      process.stdout.write(formatNotification(msg));
      this.rl.prompt(true);
    }
  }

  /**
   * Graceful shutdown.
   */
  private async shutdown(): Promise<void> {
    if (!this.running) {
      return;
    }
    this.running = false;

    process.stdout.write(`\n${colors.muted}  Saving state...${colors.reset}\n`);

    // Stop heartbeat
    this.ctx.heartbeat.stop();

    // Stop auto-updater
    if (this.ctx.updater) {
      this.ctx.updater.stop();
    }

    // Stop SVRN node
    if (this.ctx.svrnNode) {
      await this.ctx.svrnNode.stop();
    }

    // Save queue and budget
    try {
      await this.ctx.queue.save();
      await this.ctx.budget.persist();
    } catch {
      // Best effort
    }

    process.stdout.write(`${colors.accent}  Amor Fati.${colors.reset}\n\n`);

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    process.exit(0);
  }

  /**
   * Get the queue for external use.
   */
  getQueue(): RequestQueue {
    return this.ctx.queue;
  }
}
