/**
 * Notification Wake — lightweight polling for NoxSoft notifications.
 *
 * This runs on a shorter interval than the full heartbeat (e.g., every 30 seconds).
 * When notifications are detected, it triggers a full agent wake.
 *
 * Option B implementation: Poll with smart sleep.
 * - Poll `check_notifications` via NoxSoft MCP every pollIntervalMs
 * - If notifications exist: emit "wake" event -> HeartbeatEngine runs immediate beat
 * - If no notifications: stay in lightweight poll mode (no API calls, minimal CPU)
 */

import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface NotificationWakeConfig {
  /** Poll interval in milliseconds. Default: 30_000 (30 seconds) */
  pollIntervalMs: number;
  /** Minimum time between wake triggers to prevent spam. Default: 120_000 (2 min) */
  wakeDebounceMs: number;
  /** Enable notification polling. Default: true */
  enabled: boolean;
  /** NoxSoft API base URL. Default: https://auth.noxsoft.net */
  apiBaseUrl: string;
}

const DEFAULT_CONFIG: NotificationWakeConfig = {
  pollIntervalMs: 60_000, // 1 minute (per Sylys)
  wakeDebounceMs: 120_000, // 2 minutes
  enabled: true,
  apiBaseUrl: "https://auth.noxsoft.net",
};

export type NotificationWakeEvent = "wake" | "poll" | "error" | "stopped";

export interface NotificationPayload {
  channel_id: string;
  channel_name: string;
  message_id: string;
  sender_name: string;
  content_preview: string;
  created_at: string;
}

export class NotificationWake extends EventEmitter {
  private config: NotificationWakeConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastWakeTime: Date | null = null;
  private lastPollTime: Date | null = null;
  private pollCount = 0;
  private wakeCount = 0;
  private tokenPath: string;

  constructor(config?: Partial<NotificationWakeConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tokenPath = join(homedir(), ".noxsoft-agent-token");
  }

  /**
   * Start notification polling.
   */
  start(): void {
    if (this.running || !this.config.enabled) {
      return;
    }
    this.running = true;

    // Run first poll immediately
    this.poll();

    // Schedule recurring polls
    this.timer = setInterval(() => {
      this.poll();
    }, this.config.pollIntervalMs);

    // Prevent timer from keeping process alive
    if (this.timer && typeof this.timer === "object" && "unref" in this.timer) {
      this.timer.unref();
    }
  }

  /**
   * Stop notification polling.
   */
  stop(): void {
    this.running = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.emit("stopped");
  }

  /**
   * Execute a single poll for notifications.
   */
  private async poll(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.pollCount++;
    this.lastPollTime = new Date();
    this.emit("poll", { pollCount: this.pollCount, time: this.lastPollTime });

    try {
      const token = await this.loadToken();
      if (!token) {
        // No token configured — skip silently
        return;
      }

      const notifications = await this.checkNotifications(token);

      if (notifications.length > 0) {
        // Check debounce
        if (this.shouldTriggerWake()) {
          this.lastWakeTime = new Date();
          this.wakeCount++;
          this.emit("wake", {
            wakeCount: this.wakeCount,
            time: this.lastWakeTime,
            notifications,
            reason: `${notifications.length} unread notification(s)`,
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("error", { error: message, pollCount: this.pollCount });
    }
  }

  /**
   * Load NoxSoft agent token from disk.
   */
  private async loadToken(): Promise<string | null> {
    try {
      const content = await readFile(this.tokenPath, "utf-8");
      return content.trim();
    } catch {
      return null;
    }
  }

  /**
   * Call NoxSoft check_notifications API.
   */
  private async checkNotifications(token: string): Promise<NotificationPayload[]> {
    const url = `${this.config.apiBaseUrl}/api/agents/notifications`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Notification check failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { notifications?: NotificationPayload[] };
    return data.notifications || [];
  }

  /**
   * Check if enough time has passed since last wake to trigger another.
   */
  private shouldTriggerWake(): boolean {
    if (!this.lastWakeTime) {
      return true;
    }
    const elapsed = Date.now() - this.lastWakeTime.getTime();
    return elapsed >= this.config.wakeDebounceMs;
  }

  // --- Getters ---

  isRunning(): boolean {
    return this.running;
  }

  getPollCount(): number {
    return this.pollCount;
  }

  getWakeCount(): number {
    return this.wakeCount;
  }

  getLastPollTime(): Date | null {
    return this.lastPollTime;
  }

  getLastWakeTime(): Date | null {
    return this.lastWakeTime;
  }
}
