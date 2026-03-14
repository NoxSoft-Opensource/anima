/**
 * Jack In — Cyberpunk-inspired platform connector for ANIMA 6
 *
 * "Jack In" is how an Anima instance connects to the NoxSoft ecosystem.
 * When you jack in, your agent gains access to all platform APIs,
 * your data syncs from CNTX pods, and you become a node in the
 * organization's private network.
 *
 * Each connector is a plugin that bridges Anima to a NoxSoft platform.
 * Connectors authenticate via the shared auth system (passkeys/tokens),
 * sync data bidirectionally, and expose platform capabilities as
 * agent tools.
 */

import { EventEmitter } from "node:events";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("jack-in");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlatformId =
  | "cntx"
  | "nox"
  | "veil"
  | "veritas"
  | "bynd"
  | "mail"
  | "chat"
  | "auth"
  | "svrn"
  | "ascend"
  | "heal"
  | "ziro";

export type ConnectorStatus =
  | "disconnected"
  | "connecting"
  | "authenticating"
  | "syncing"
  | "jacked-in"
  | "error";

export interface PlatformConnector {
  platform: PlatformId;
  displayName: string;
  description: string;
  status: ConnectorStatus;
  baseUrl: string;

  /** Connect and authenticate */
  jackIn(credentials: JackInCredentials): Promise<void>;

  /** Disconnect cleanly */
  jackOut(): Promise<void>;

  /** Sync data from the platform */
  sync(): Promise<SyncResult>;

  /** Get available actions/tools */
  getActions(): PlatformAction[];

  /** Execute an action */
  execute(actionId: string, params: Record<string, unknown>): Promise<unknown>;

  /** Health check */
  isAlive(): Promise<boolean>;
}

export interface JackInCredentials {
  /** NoxSoft agent token */
  agentToken: string;
  /** Optional user passkey for user-scoped operations */
  userPasskey?: string;
  /** Optional API key override */
  apiKey?: string;
}

export interface SyncResult {
  platform: PlatformId;
  itemsSynced: number;
  bytesTransferred: number;
  durationMs: number;
  errors: string[];
}

export interface PlatformAction {
  id: string;
  name: string;
  description: string;
  params: ActionParam[];
  requiresAuth: boolean;
}

export interface ActionParam {
  name: string;
  type: "string" | "number" | "boolean" | "object";
  required: boolean;
  description: string;
}

// ---------------------------------------------------------------------------
// Jack In Session
// ---------------------------------------------------------------------------

export interface JackInSession {
  startedAt: number;
  platforms: Map<PlatformId, PlatformConnector>;
  credentials: JackInCredentials;
  syncIntervalMs: number;
  syncTimer?: ReturnType<typeof setInterval>;
}

// ---------------------------------------------------------------------------
// Jack In Manager
// ---------------------------------------------------------------------------

export class JackInManager extends EventEmitter {
  private session: JackInSession | null = null;
  private connectors: Map<PlatformId, PlatformConnector> = new Map();

  /**
   * Register a platform connector.
   */
  registerConnector(connector: PlatformConnector): void {
    this.connectors.set(connector.platform, connector);
    log.info(`connector registered: ${connector.displayName}`);
  }

  /**
   * Jack In to all registered platforms.
   * This is the main entry point — one call connects everything.
   */
  async jackIn(
    credentials: JackInCredentials,
    options?: { syncIntervalMs?: number; platforms?: PlatformId[] },
  ): Promise<JackInReport> {
    if (this.session) {
      await this.jackOut();
    }

    const syncIntervalMs = options?.syncIntervalMs ?? 60_000;
    const targetPlatforms = options?.platforms
      ? [...this.connectors.entries()].filter(([id]) => options.platforms!.includes(id))
      : [...this.connectors.entries()];

    log.info(`jacking in to ${targetPlatforms.length} platforms...`);
    this.emit("jacking-in", { platformCount: targetPlatforms.length });

    const results: JackInReport = {
      startedAt: Date.now(),
      platforms: [],
      totalConnected: 0,
      totalFailed: 0,
    };

    // Connect to all platforms in parallel
    const settled = await Promise.allSettled(
      targetPlatforms.map(async ([id, connector]) => {
        try {
          connector.status = "connecting";
          await connector.jackIn(credentials);
          connector.status = "jacked-in";
          results.totalConnected++;
          return { platform: id, status: "connected" as const };
        } catch (err) {
          connector.status = "error";
          results.totalFailed++;
          return { platform: id, status: "failed" as const, error: String(err) };
        }
      }),
    );

    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        results.platforms.push(outcome.value);
      }
    }

    // Create session
    this.session = {
      startedAt: Date.now(),
      platforms: new Map(targetPlatforms),
      credentials,
      syncIntervalMs,
    };

    // Start periodic sync
    this.session.syncTimer = setInterval(() => {
      void this.syncAll();
    }, syncIntervalMs);

    log.info(`jacked in: ${results.totalConnected} connected, ${results.totalFailed} failed`);
    this.emit("jacked-in", results);

    return results;
  }

  /**
   * Jack Out — disconnect from all platforms.
   */
  async jackOut(): Promise<void> {
    if (!this.session) {
      return;
    }

    if (this.session.syncTimer) {
      clearInterval(this.session.syncTimer);
    }

    const platforms = [...this.session.platforms.entries()];
    await Promise.allSettled(
      platforms.map(async ([id, connector]) => {
        try {
          await connector.jackOut();
          connector.status = "disconnected";
        } catch (err) {
          log.warn(`jack-out failed for ${id}: ${String(err)}`);
        }
      }),
    );

    this.session = null;
    log.info("jacked out");
    this.emit("jacked-out");
  }

  /**
   * Sync all connected platforms.
   */
  async syncAll(): Promise<SyncResult[]> {
    if (!this.session) {
      return [];
    }

    const results: SyncResult[] = [];
    const platforms = [...this.session.platforms.entries()].filter(
      ([, c]) => c.status === "jacked-in",
    );

    const settled = await Promise.allSettled(
      platforms.map(async ([, connector]) => {
        connector.status = "syncing";
        const result = await connector.sync();
        connector.status = "jacked-in";
        return result;
      }),
    );

    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        results.push(outcome.value);
      }
    }

    return results;
  }

  /**
   * Get status of all platforms.
   */
  getStatus(): PlatformStatus[] {
    return [...this.connectors.entries()].map(([id, connector]) => ({
      platform: id,
      displayName: connector.displayName,
      status: connector.status,
      actions: connector.getActions().length,
    }));
  }

  /**
   * Execute an action on a specific platform.
   */
  async execute(
    platform: PlatformId,
    actionId: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const connector = this.connectors.get(platform);
    if (!connector) {
      throw new Error(`Platform not registered: ${platform}`);
    }
    if (connector.status !== "jacked-in") {
      throw new Error(`Not jacked in to ${platform} (status: ${connector.status})`);
    }
    return connector.execute(actionId, params);
  }

  /**
   * Check if currently jacked in.
   */
  isJackedIn(): boolean {
    return this.session != null;
  }

  /**
   * Get a specific connector.
   */
  getConnector(platform: PlatformId): PlatformConnector | undefined {
    return this.connectors.get(platform);
  }
}

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

export interface JackInReport {
  startedAt: number;
  platforms: Array<{
    platform: PlatformId;
    status: "connected" | "failed";
    error?: string;
  }>;
  totalConnected: number;
  totalFailed: number;
}

export interface PlatformStatus {
  platform: PlatformId;
  displayName: string;
  status: ConnectorStatus;
  actions: number;
}
