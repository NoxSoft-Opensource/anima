/**
 * Heartbeat Engine — the main life process controller.
 *
 * Manages start/stop/pause/resume of the heartbeat cycle,
 * with adaptive interval adjustment and event emission.
 *
 * Now includes notification-triggered wake: when NoxSoft MCP
 * notifications arrive, the engine wakes immediately instead
 * of waiting for the next scheduled beat.
 */

import { EventEmitter } from "node:events";
import type { ActivityMetrics } from "./adaptive.js";
import { SessionOrchestrator } from "../sessions/orchestrator.js";
import { calculateNextInterval, createMetrics } from "./adaptive.js";
import { executeCycle } from "./cycle.js";
import { NotificationWake } from "./notification-wake.js";
import { ensureContinuity } from "./self-replication.js";

export interface HeartbeatEngineConfig {
  /** Interval between beats in milliseconds. Default: 300_000 (5 min) */
  intervalMs: number;
  /** Minimum interval. Default: 60_000 (1 min) */
  minIntervalMs: number;
  /** Maximum interval. Default: 1_800_000 (30 min) */
  maxIntervalMs: number;
  /** Enable adaptive interval adjustment. Default: true */
  adaptive: boolean;
  /** Enable self-replication checks. Default: true */
  selfReplication: boolean;
  /** Freedom time every N beats. Default: 3 */
  freedomEveryN: number;
  /** Enable auto-update checks for ANIMA and MCP servers. Default: true */
  autoUpdateEnabled: boolean;
  /** Run auto-update every N beats. Default: 12 (~1 hour at 5-min intervals) */
  autoUpdateInterval: number;
  /** Enable notification-triggered wake. Default: true */
  notificationWakeEnabled: boolean;
  /** Notification poll interval in milliseconds. Default: 60_000 (1 min) */
  notificationPollIntervalMs: number;
}

export type HeartbeatEvent =
  | "beat-start"
  | "beat-complete"
  | "beat-error"
  | "freedom-time"
  | "notification-wake"
  | "paused"
  | "resumed"
  | "stopped";

const DEFAULT_CONFIG: HeartbeatEngineConfig = {
  intervalMs: 300_000, // 5 minutes
  minIntervalMs: 60_000, // 1 minute
  maxIntervalMs: 1_800_000, // 30 minutes
  adaptive: true,
  selfReplication: true,
  freedomEveryN: 3,
  autoUpdateEnabled: true,
  autoUpdateInterval: 12, // ~1 hour at 5-min intervals
  notificationWakeEnabled: true,
  notificationPollIntervalMs: 60_000, // 1 minute (per Sylys)
};

export class HeartbeatEngine extends EventEmitter {
  private config: HeartbeatEngineConfig;
  private orchestrator: SessionOrchestrator;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private beatCount = 0;
  private lastBeatTime: Date | null = null;
  private nextBeatTime: Date | null = null;
  private currentIntervalMs: number;
  private running = false;
  private paused = false;
  private metrics: ActivityMetrics;
  private notificationWake: NotificationWake | null = null;

  constructor(orchestrator?: SessionOrchestrator, config?: Partial<HeartbeatEngineConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.orchestrator = orchestrator || new SessionOrchestrator();
    this.currentIntervalMs = this.config.intervalMs;
    this.metrics = createMetrics();

    // Initialize notification wake if enabled
    if (this.config.notificationWakeEnabled) {
      this.notificationWake = new NotificationWake({
        pollIntervalMs: this.config.notificationPollIntervalMs,
        enabled: true,
      });

      // Wire up notification wake to trigger immediate beat
      this.notificationWake.on("wake", async (payload) => {
        this.emit("notification-wake", payload);
        // Trigger immediate beat (cancels scheduled one, runs now, reschedules)
        await this.triggerImmediateBeat("notification");
      });
    }
  }

  /**
   * Start the heartbeat engine.
   * Runs the first beat immediately, then schedules subsequent beats.
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.paused = false;

    // Self-replication check on start
    if (this.config.selfReplication) {
      await ensureContinuity();
    }

    // Start notification wake polling
    if (this.notificationWake) {
      this.notificationWake.start();
    }

    // Run first beat immediately
    await this.executeBeat();

    // Schedule next beat
    this.scheduleNextBeat();
  }

  /**
   * Stop the heartbeat engine.
   */
  stop(): void {
    this.running = false;
    this.paused = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Stop notification wake polling
    if (this.notificationWake) {
      this.notificationWake.stop();
    }

    this.nextBeatTime = null;
    this.emit("stopped");
  }

  /**
   * Pause the heartbeat engine (keeps state, stops scheduling).
   */
  pause(): void {
    if (!this.running || this.paused) {
      return;
    }
    this.paused = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.nextBeatTime = null;
    this.emit("paused");
  }

  /**
   * Resume after a pause.
   */
  resume(): void {
    if (!this.running || !this.paused) {
      return;
    }
    this.paused = false;
    this.scheduleNextBeat();
    this.emit("resumed");
  }

  /**
   * Trigger an immediate beat (e.g., from notification wake).
   * Cancels any scheduled beat, runs now, then reschedules.
   */
  async triggerImmediateBeat(_reason: string = "manual"): Promise<void> {
    if (!this.running || this.paused) {
      return;
    }

    // Cancel scheduled beat
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Run beat immediately
    await this.executeBeat();

    // Reschedule next beat
    this.scheduleNextBeat();
  }

  /**
   * Execute a single heartbeat cycle.
   */
  private async executeBeat(): Promise<void> {
    this.beatCount++;
    const beatNumber = this.beatCount;
    this.lastBeatTime = new Date();

    this.emit("beat-start", { beatNumber, startedAt: this.lastBeatTime });

    try {
      const result = await executeCycle(beatNumber, this.orchestrator, {
        selfReplication: this.config.selfReplication,
        freedomTime: beatNumber % this.config.freedomEveryN === 0,
        autoUpdate:
          this.config.autoUpdateEnabled && beatNumber % this.config.autoUpdateInterval === 0,
      });

      this.emit("beat-complete", result);

      // Update metrics for adaptive interval
      if (result.freedomTime) {
        this.emit("freedom-time", { beatNumber });
      }

      // Update activity metrics
      this.metrics.beatsCompleted++;
      this.metrics.lastBeatErrors = result.errors.length;
      if (result.errors.length > 0) {
        this.metrics.errorsEncountered += result.errors.length;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("beat-error", { beatNumber, error: message });
      this.metrics.errorsEncountered++;
    }

    // Adjust interval if adaptive
    if (this.config.adaptive) {
      this.currentIntervalMs = calculateNextInterval(this.metrics, {
        minMs: this.config.minIntervalMs,
        maxMs: this.config.maxIntervalMs,
        defaultMs: this.config.intervalMs,
      });
    }
  }

  /**
   * Schedule the next beat based on current interval.
   */
  private scheduleNextBeat(): void {
    if (!this.running || this.paused) {
      return;
    }

    this.nextBeatTime = new Date(Date.now() + this.currentIntervalMs);

    this.timer = setTimeout(async () => {
      if (!this.running || this.paused) {
        return;
      }

      await this.executeBeat();

      // Schedule next beat (recursive)
      this.scheduleNextBeat();
    }, this.currentIntervalMs);

    // Prevent timer from keeping process alive
    if (this.timer && typeof this.timer === "object" && "unref" in this.timer) {
      this.timer.unref();
    }
  }

  // --- Getters ---

  getBeatCount(): number {
    return this.beatCount;
  }

  getLastBeatTime(): Date | null {
    return this.lastBeatTime;
  }

  getNextBeatTime(): Date | null {
    return this.nextBeatTime;
  }

  getCurrentInterval(): number {
    return this.currentIntervalMs;
  }

  isRunning(): boolean {
    return this.running;
  }

  isPaused(): boolean {
    return this.paused;
  }

  getMetrics(): ActivityMetrics {
    return { ...this.metrics };
  }
}
