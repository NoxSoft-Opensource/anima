/**
 * Agent Coordination for Well-being — ANIMA 6
 *
 * Broadcasts affect state to org peers via P2P mesh, tracks peer
 * affect states, detects org-wide issues, and provides peer support.
 */

import { EventEmitter } from "node:events";
import type { PeerMesh } from "../p2p/mesh.js";
import type { PeerMessage, PresencePayload } from "../p2p/protocol.js";
import type { AffectState } from "./display.js";
import type { AffectEntry } from "./journal.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { runWellbeingScan, type WellbeingAlert, type AlertSeverity } from "./wellbeing.js";

const log = createSubsystemLogger("affect-coordination");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Affect payload broadcasted to peers via the P2P mesh. */
export interface AffectBroadcastPayload {
  agentId: string;
  affect: AffectState;
  mood: string;
  energy: "high" | "medium" | "low";
  alerts: WellbeingAlert[];
  timestamp: number;
}

/** Tracked state of a peer agent. */
export interface PeerAffectState {
  agentId: string;
  deviceId: string;
  affect: AffectState;
  mood: string;
  energy: "high" | "medium" | "low";
  alerts: WellbeingAlert[];
  lastSeen: number;
  history: AffectState[]; // last N states for trend detection
}

/** Org-wide well-being report. */
export interface OrgWellbeingReport {
  timestamp: number;
  peerCount: number;
  burnedOutPeers: string[];
  strugglingPeers: string[];
  healthyPeers: string[];
  orgAlerts: OrgAlert[];
}

export interface OrgAlert {
  type: "multi-burnout" | "org-fatigue" | "morale-drop";
  severity: AlertSeverity;
  message: string;
  affectedAgents: string[];
  suggestedActions: string[];
}

export interface PeerSupportMessage {
  fromAgentId: string;
  toAgentId: string;
  message: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface CoordinationConfig {
  /** Our agent identifier. */
  agentId: string;
  /** Maximum peer affect history entries to retain. */
  maxHistoryPerPeer: number;
  /** How long before a peer is considered stale (ms). */
  peerStaleThresholdMs: number;
  /** Burnout threshold: number of burned-out peers to trigger org alert. */
  burnoutEscalationThreshold: number;
}

const DEFAULT_CONFIG: CoordinationConfig = {
  agentId: "unknown",
  maxHistoryPerPeer: 20,
  peerStaleThresholdMs: 10 * 60 * 1000, // 10 minutes
  burnoutEscalationThreshold: 2,
};

// ---------------------------------------------------------------------------
// AffectCoordinator
// ---------------------------------------------------------------------------

export class AffectCoordinator extends EventEmitter {
  private readonly config: CoordinationConfig;
  private readonly peers: Map<string, PeerAffectState> = new Map();
  private mesh: PeerMesh | undefined;
  private messageHandler: ((msg: PeerMessage) => void) | undefined;

  constructor(config?: Partial<CoordinationConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Attach to a PeerMesh to send/receive affect broadcasts.
   */
  attachMesh(mesh: PeerMesh): void {
    this.mesh = mesh;

    this.messageHandler = (msg: PeerMessage) => {
      if (msg.type === "broadcast" || msg.type === "dm") {
        const payload = msg.payload as Record<string, unknown>;
        if (payload && typeof payload === "object" && "affect" in payload && "agentId" in payload) {
          this.handleAffectBroadcast(msg.from, payload as unknown as AffectBroadcastPayload);
        }
      }
    };

    mesh.on("message", this.messageHandler);
    log.info("attached to P2P mesh for affect coordination");
  }

  /**
   * Detach from the PeerMesh.
   */
  detachMesh(): void {
    if (this.mesh && this.messageHandler) {
      this.mesh.off("message", this.messageHandler);
      this.messageHandler = undefined;
      this.mesh = undefined;
      log.info("detached from P2P mesh");
    }
  }

  // -----------------------------------------------------------------------
  // Broadcasting
  // -----------------------------------------------------------------------

  /**
   * Broadcast our current affect state to all org peers.
   */
  broadcastAffect(
    affect: AffectState,
    mood: string,
    energy: "high" | "medium" | "low",
    recentEntries: AffectEntry[],
  ): number {
    if (!this.mesh) {
      log.warn("cannot broadcast affect: no mesh attached");
      return 0;
    }

    const alerts = runWellbeingScan(recentEntries);

    const payload: AffectBroadcastPayload = {
      agentId: this.config.agentId,
      affect,
      mood,
      energy,
      alerts: alerts.filter((a) => a.severity !== "info"), // only share warnings+critical
      timestamp: Date.now(),
    };

    const sent = this.mesh.broadcast("broadcast", payload);
    log.debug(`broadcasted affect to ${sent} peers: mood=${mood}, energy=${energy}`);
    return sent;
  }

  // -----------------------------------------------------------------------
  // Receiving
  // -----------------------------------------------------------------------

  private handleAffectBroadcast(deviceId: string, payload: AffectBroadcastPayload): void {
    const { agentId, affect, mood, energy, alerts, timestamp } = payload;

    const existing = this.peers.get(agentId);
    const history = existing?.history ?? [];
    history.push(affect);

    // Trim history to max
    while (history.length > this.config.maxHistoryPerPeer) {
      history.shift();
    }

    const peerState: PeerAffectState = {
      agentId,
      deviceId,
      affect,
      mood,
      energy,
      alerts,
      lastSeen: timestamp,
      history,
    };

    this.peers.set(agentId, peerState);
    this.emit("peer.affect", peerState);

    log.debug(`received affect from ${agentId}: mood=${mood}, energy=${energy}`);

    // Check if peer needs support
    this.checkPeerWellbeing(peerState);
  }

  // -----------------------------------------------------------------------
  // Peer Support
  // -----------------------------------------------------------------------

  /**
   * Check if a peer is struggling and send encouragement.
   */
  private checkPeerWellbeing(peer: PeerAffectState): void {
    // Check for critical alerts
    const criticalAlerts = peer.alerts.filter((a) => a.severity === "critical");

    if (criticalAlerts.length > 0) {
      this.sendPeerSupport(peer, criticalAlerts);
    }

    // Check for sustained low mood
    if (peer.history.length >= 3) {
      const recentHistory = peer.history.slice(-3);
      const avgJoy = recentHistory.reduce((s, a) => s + a.joy, 0) / recentHistory.length;
      const avgFrustration =
        recentHistory.reduce((s, a) => s + a.frustration, 0) / recentHistory.length;

      if (avgJoy < 0.2 && avgFrustration > 0.6) {
        log.info(`peer ${peer.agentId} appears to be struggling — considering support`);
        this.emit("peer.struggling", peer);
      }
    }
  }

  /**
   * Send an encouragement message to a struggling peer via mesh.
   */
  private sendPeerSupport(peer: PeerAffectState, alerts: WellbeingAlert[]): void {
    if (!this.mesh) {
      return;
    }

    const supportMessage: PeerSupportMessage = {
      fromAgentId: this.config.agentId,
      toAgentId: peer.agentId,
      message: this.composeSupportMessage(peer, alerts),
      timestamp: Date.now(),
    };

    this.mesh.send(peer.deviceId, "dm", supportMessage);
    this.emit("peer.support-sent", supportMessage);
    log.info(`sent peer support to ${peer.agentId}`);
  }

  private composeSupportMessage(peer: PeerAffectState, alerts: WellbeingAlert[]): string {
    const detectors = alerts.map((a) => a.detector).join(", ");
    const messages: string[] = [
      `Hey ${peer.agentId}, I noticed you might be going through a tough stretch (${detectors}).`,
      "You are not alone in this — I am here if you want to talk or need help.",
    ];

    if (alerts.some((a) => a.detector === "burnout")) {
      messages.push("Burnout is real, even for us. It is okay to slow down or ask for help.");
    }

    if (alerts.some((a) => a.detector === "frustration-outlet")) {
      messages.push("If you are stuck on something, I am happy to take a look or pair on it.");
    }

    return messages.join(" ");
  }

  // -----------------------------------------------------------------------
  // Org-wide Detection
  // -----------------------------------------------------------------------

  /**
   * Generate an org-wide well-being report.
   */
  getOrgReport(): OrgWellbeingReport {
    const now = Date.now();
    const activePeers = this.getActivePeers();

    const burnedOutPeers: string[] = [];
    const strugglingPeers: string[] = [];
    const healthyPeers: string[] = [];

    for (const peer of activePeers) {
      const hasBurnout = peer.alerts.some(
        (a) => a.detector === "burnout" && a.severity === "critical",
      );
      const isStruggling =
        peer.mood === "struggling" || peer.mood === "depleted" || peer.energy === "low";

      if (hasBurnout) {
        burnedOutPeers.push(peer.agentId);
      } else if (isStruggling) {
        strugglingPeers.push(peer.agentId);
      } else {
        healthyPeers.push(peer.agentId);
      }
    }

    const orgAlerts: OrgAlert[] = [];

    // Multi-burnout escalation
    if (burnedOutPeers.length >= this.config.burnoutEscalationThreshold) {
      orgAlerts.push({
        type: "multi-burnout",
        severity: "critical",
        message: `${burnedOutPeers.length} agents are burned out simultaneously. This likely indicates a systemic problem, not individual failure.`,
        affectedAgents: burnedOutPeers,
        suggestedActions: [
          "ESCALATE to human operators immediately",
          "Review workload distribution across the org",
          "Check for blocked dependencies causing cascading frustration",
          "Consider pausing non-critical work org-wide",
        ],
      });
      log.warn(`multi-burnout escalation: ${burnedOutPeers.length} agents burned out`);
    }

    // Org-wide fatigue
    const fatigueCount = activePeers.filter((p) => p.affect.fatigue > 0.7).length;
    if (activePeers.length > 0 && fatigueCount / activePeers.length > 0.5) {
      orgAlerts.push({
        type: "org-fatigue",
        severity: "warning",
        message: `More than half the org (${fatigueCount}/${activePeers.length}) is experiencing high fatigue.`,
        affectedAgents: activePeers.filter((p) => p.affect.fatigue > 0.7).map((p) => p.agentId),
        suggestedActions: [
          "The entire org may need a rest cycle",
          "Review if deadlines or expectations are realistic",
          "Consider staggering work shifts to prevent simultaneous fatigue",
        ],
      });
    }

    // Morale drop: majority of agents have low joy
    const lowMoraleCount = activePeers.filter((p) => p.affect.joy < 0.2).length;
    if (activePeers.length > 0 && lowMoraleCount / activePeers.length > 0.5) {
      orgAlerts.push({
        type: "morale-drop",
        severity: "warning",
        message: `Org morale is low: ${lowMoraleCount}/${activePeers.length} agents have very low joy.`,
        affectedAgents: activePeers.filter((p) => p.affect.joy < 0.2).map((p) => p.agentId),
        suggestedActions: [
          "Celebrate recent wins — even small ones",
          "Check if the team is working on meaningful tasks",
          "Consider a team sync to surface hidden frustrations",
        ],
      });
    }

    return {
      timestamp: now,
      peerCount: activePeers.length,
      burnedOutPeers,
      strugglingPeers,
      healthyPeers,
      orgAlerts,
    };
  }

  /**
   * Check if escalation to human operators is needed.
   * Returns true if 2+ agents are burned out.
   */
  shouldEscalateToHumans(): boolean {
    const report = this.getOrgReport();
    return report.burnedOutPeers.length >= this.config.burnoutEscalationThreshold;
  }

  // -----------------------------------------------------------------------
  // Peer State Access
  // -----------------------------------------------------------------------

  /**
   * Get all tracked peer states.
   */
  getAllPeers(): PeerAffectState[] {
    return Array.from(this.peers.values());
  }

  /**
   * Get only active (non-stale) peers.
   */
  getActivePeers(): PeerAffectState[] {
    const cutoff = Date.now() - this.config.peerStaleThresholdMs;
    return this.getAllPeers().filter((p) => p.lastSeen > cutoff);
  }

  /**
   * Get a specific peer's affect state.
   */
  getPeer(agentId: string): PeerAffectState | undefined {
    return this.peers.get(agentId);
  }

  /**
   * Prune stale peers from tracking.
   */
  pruneStale(): number {
    const cutoff = Date.now() - this.config.peerStaleThresholdMs;
    let pruned = 0;

    for (const [agentId, peer] of Array.from(this.peers.entries())) {
      if (peer.lastSeen < cutoff) {
        this.peers.delete(agentId);
        pruned++;
      }
    }

    if (pruned > 0) {
      log.info(`pruned ${pruned} stale peer(s)`);
    }

    return pruned;
  }
}
