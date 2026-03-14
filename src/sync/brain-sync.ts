/**
 * ANIMA 6 Distributed Brain Sync
 *
 * Event-sourced change log with vector clocks for brain graph
 * replication across Anima instances in an organization.
 *
 * Privacy tiers control what syncs:
 * - public: syncs to all org peers
 * - internal: syncs to org peers with brain access
 * - private: local only, never syncs
 * - secret: local only, encrypted at rest
 *
 * Affect state is ALWAYS local (never syncs).
 * Trust scores are local. Trust facts sync.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { BrainSensitivity } from "../memory/brain-graph.js";
import { resolveStateDir } from "../config/paths.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("brain-sync");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VectorClock {
  [deviceId: string]: number;
}

export type SyncEventType =
  | "node:upsert"
  | "node:archive"
  | "edge:upsert"
  | "edge:archive"
  | "org:member:join"
  | "org:member:leave"
  | "org:member:update"
  | "task:create"
  | "task:update"
  | "task:complete";

export interface SyncEvent {
  id: string;
  type: SyncEventType;
  deviceId: string; // originating device
  orgId: string;
  clock: number; // logical clock for this device
  timestamp: number; // wall clock for human readability
  sensitivity: BrainSensitivity;
  data: unknown;
  hash: string; // SHA-256 of (id + type + data)
}

export interface SyncState {
  deviceId: string;
  orgId: string;
  vectorClock: VectorClock;
  eventLog: SyncEvent[];
  lastSyncedAt: number;
}

export interface SyncDelta {
  events: SyncEvent[];
  senderClock: VectorClock;
}

// ---------------------------------------------------------------------------
// Sync Engine
// ---------------------------------------------------------------------------

export class BrainSyncEngine {
  private state: SyncState;
  private readonly stateFile: string;
  private readonly maxLogSize: number;

  constructor(
    deviceId: string,
    orgId: string,
    options?: { maxLogSize?: number; stateDir?: string },
  ) {
    const stateDir = options?.stateDir ?? resolveStateDir();
    this.stateFile = path.join(stateDir, "sync", `${orgId}.json`);
    this.maxLogSize = options?.maxLogSize ?? 10_000;

    // Load or initialize state
    this.state = this.loadState() ?? {
      deviceId,
      orgId,
      vectorClock: { [deviceId]: 0 },
      eventLog: [],
      lastSyncedAt: 0,
    };
  }

  // -----------------------------------------------------------------------
  // Event creation
  // -----------------------------------------------------------------------

  /**
   * Record a local event and advance our logical clock.
   */
  recordEvent(
    type: SyncEventType,
    data: unknown,
    sensitivity: BrainSensitivity = "internal",
  ): SyncEvent {
    const deviceId = this.state.deviceId;
    const clock = (this.state.vectorClock[deviceId] ?? 0) + 1;
    this.state.vectorClock[deviceId] = clock;

    const id = crypto.randomUUID();
    const hash = crypto
      .createHash("sha256")
      .update(`${id}|${type}|${JSON.stringify(data)}`)
      .digest("hex");

    const event: SyncEvent = {
      id,
      type,
      deviceId,
      orgId: this.state.orgId,
      clock,
      timestamp: Date.now(),
      sensitivity,
      data,
      hash,
    };

    this.state.eventLog.push(event);
    this.trimLog();
    this.persistState();

    log.debug(`recorded sync event: ${type} (clock: ${clock})`);
    return event;
  }

  // -----------------------------------------------------------------------
  // Delta computation
  // -----------------------------------------------------------------------

  /**
   * Compute events that a peer needs based on their vector clock.
   * Only returns events the peer hasn't seen, filtered by sensitivity.
   */
  computeDelta(peerClock: VectorClock, peerHasBrainAccess: boolean): SyncDelta {
    const events = this.state.eventLog.filter((event) => {
      // Skip events the peer already has
      const peerKnows = (peerClock[event.deviceId] ?? 0) >= event.clock;
      if (peerKnows) {
        return false;
      }

      // Filter by sensitivity
      if (event.sensitivity === "private" || event.sensitivity === "secret") {
        return false;
      }
      if (event.sensitivity === "internal" && !peerHasBrainAccess) {
        return false;
      }

      return true;
    });

    return {
      events,
      senderClock: { ...this.state.vectorClock },
    };
  }

  // -----------------------------------------------------------------------
  // Delta application
  // -----------------------------------------------------------------------

  /**
   * Apply events received from a peer.
   * Returns the list of newly applied events (for downstream handlers).
   */
  applyDelta(delta: SyncDelta): SyncEvent[] {
    const applied: SyncEvent[] = [];

    for (const event of delta.events) {
      // Skip if we already have this event
      const ourClock = this.state.vectorClock[event.deviceId] ?? 0;
      if (event.clock <= ourClock) {
        continue;
      }

      // Verify hash integrity
      const expectedHash = crypto
        .createHash("sha256")
        .update(`${event.id}|${event.type}|${JSON.stringify(event.data)}`)
        .digest("hex");

      if (event.hash !== expectedHash) {
        log.warn(`rejecting sync event ${event.id}: hash mismatch`);
        continue;
      }

      // Apply
      this.state.eventLog.push(event);
      this.state.vectorClock[event.deviceId] = event.clock;
      applied.push(event);
    }

    // Merge sender's clock (take max of each component)
    for (const [deviceId, clock] of Object.entries(delta.senderClock)) {
      const current = this.state.vectorClock[deviceId] ?? 0;
      if (clock > current) {
        this.state.vectorClock[deviceId] = clock;
      }
    }

    if (applied.length > 0) {
      this.state.lastSyncedAt = Date.now();
      this.trimLog();
      this.persistState();
      log.info(`applied ${applied.length} sync events`);
    }

    return applied;
  }

  // -----------------------------------------------------------------------
  // State access
  // -----------------------------------------------------------------------

  getVectorClock(): VectorClock {
    return { ...this.state.vectorClock };
  }

  getEventLog(): readonly SyncEvent[] {
    return this.state.eventLog;
  }

  getLastSyncedAt(): number {
    return this.state.lastSyncedAt;
  }

  // -----------------------------------------------------------------------
  // Persistence
  // -----------------------------------------------------------------------

  private loadState(): SyncState | null {
    try {
      if (!fs.existsSync(this.stateFile)) {
        return null;
      }
      const raw = fs.readFileSync(this.stateFile, "utf8");
      return JSON.parse(raw) as SyncState;
    } catch {
      return null;
    }
  }

  private persistState(): void {
    try {
      fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
      fs.writeFileSync(this.stateFile, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 });
    } catch (err) {
      log.warn(`failed to persist sync state: ${String(err)}`);
    }
  }

  private trimLog(): void {
    if (this.state.eventLog.length > this.maxLogSize) {
      const excess = this.state.eventLog.length - this.maxLogSize;
      this.state.eventLog.splice(0, excess);
    }
  }
}
