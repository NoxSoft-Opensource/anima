/**
 * P2P Agent Discovery for ANIMA 6
 *
 * Hybrid discovery system:
 * 1. NoxSoft registry for WAN discovery (agents register their endpoints)
 * 2. mDNS/Bonjour for zero-config LAN peering
 * 3. Static peer list for manual configuration
 */

import { EventEmitter } from "node:events";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("p2p-discovery");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PeerRecord {
  deviceId: string;
  orgId: string;
  displayName?: string;
  x25519PublicKey: string; // base64url
  ed25519PublicKey: string; // base64url
  endpoints: PeerEndpoint[];
  capabilities: string[];
  lastSeenMs: number;
}

export interface PeerEndpoint {
  type: "tailscale" | "direct" | "relay" | "lan";
  url: string; // wss://... or ws://...
  priority: number; // lower = preferred
}

export interface DiscoveryConfig {
  orgId: string;
  deviceId: string;
  displayName?: string;
  x25519PublicKey: string;
  ed25519PublicKey: string;
  localEndpoints: PeerEndpoint[];
  registry?: {
    enabled: boolean;
    url?: string; // NoxSoft registry URL
    token?: string; // NoxSoft agent token
  };
  mdns?: {
    enabled: boolean;
    serviceName?: string; // default: _anima-peer._tcp
  };
  staticPeers?: PeerRecord[];
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export class PeerDiscovery extends EventEmitter {
  private knownPeers: Map<string, PeerRecord> = new Map();
  private registryInterval?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly config: DiscoveryConfig;

  constructor(config: DiscoveryConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

    // Load static peers
    if (this.config.staticPeers) {
      for (const peer of this.config.staticPeers) {
        this.addPeer(peer);
      }
    }

    // Start registry polling
    if (this.config.registry?.enabled) {
      await this.registerWithRegistry();
      this.registryInterval = setInterval(
        () => this.pollRegistry(),
        60_000, // poll every 60s
      );
    }

    // Start mDNS
    if (this.config.mdns?.enabled) {
      this.startMdns();
    }

    log.info(`discovery started (${this.knownPeers.size} known peers)`);
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.registryInterval) {
      clearInterval(this.registryInterval);
      this.registryInterval = undefined;
    }

    if (this.config.registry?.enabled) {
      await this.unregisterFromRegistry();
    }

    log.info("discovery stopped");
  }

  // -----------------------------------------------------------------------
  // Peer management
  // -----------------------------------------------------------------------

  private addPeer(record: PeerRecord): void {
    const existing = this.knownPeers.get(record.deviceId);
    if (!existing || record.lastSeenMs > existing.lastSeenMs) {
      this.knownPeers.set(record.deviceId, record);
      if (!existing) {
        this.emit("peer.discovered", record);
        log.info(`discovered peer: ${record.displayName ?? record.deviceId}`);
      }
    }
  }

  getPeers(): PeerRecord[] {
    return Array.from(this.knownPeers.values());
  }

  getPeer(deviceId: string): PeerRecord | undefined {
    return this.knownPeers.get(deviceId);
  }

  /**
   * Get the best endpoint for a peer (lowest priority number).
   */
  getBestEndpoint(deviceId: string): PeerEndpoint | undefined {
    const peer = this.knownPeers.get(deviceId);
    if (!peer || peer.endpoints.length === 0) {
      return undefined;
    }
    return [...peer.endpoints].toSorted((a, b) => a.priority - b.priority)[0];
  }

  // -----------------------------------------------------------------------
  // NoxSoft Registry
  // -----------------------------------------------------------------------

  private async registerWithRegistry(): Promise<void> {
    const registryUrl = this.config.registry?.url;
    const token = this.config.registry?.token;
    if (!registryUrl || !token) {
      return;
    }

    try {
      const body = {
        deviceId: this.config.deviceId,
        orgId: this.config.orgId,
        displayName: this.config.displayName,
        x25519PublicKey: this.config.x25519PublicKey,
        ed25519PublicKey: this.config.ed25519PublicKey,
        endpoints: this.config.localEndpoints,
      };

      const res = await fetch(`${registryUrl}/api/v1/peers/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        log.warn(`registry register failed: ${res.status} ${res.statusText}`);
      } else {
        log.info("registered with peer registry");
      }
    } catch (err) {
      log.warn(`registry register error: ${String(err)}`);
    }
  }

  private async unregisterFromRegistry(): Promise<void> {
    const registryUrl = this.config.registry?.url;
    const token = this.config.registry?.token;
    if (!registryUrl || !token) {
      return;
    }

    try {
      await fetch(`${registryUrl}/api/v1/peers/${this.config.deviceId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // best-effort on shutdown
    }
  }

  private async pollRegistry(): Promise<void> {
    const registryUrl = this.config.registry?.url;
    const token = this.config.registry?.token;
    if (!registryUrl || !token) {
      return;
    }

    try {
      const res = await fetch(
        `${registryUrl}/api/v1/peers?orgId=${encodeURIComponent(this.config.orgId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!res.ok) {
        log.warn(`registry poll failed: ${res.status}`);
        return;
      }

      const data = (await res.json()) as { peers: PeerRecord[] };
      for (const peer of data.peers) {
        if (peer.deviceId !== this.config.deviceId) {
          this.addPeer(peer);
        }
      }
    } catch (err) {
      log.warn(`registry poll error: ${String(err)}`);
    }
  }

  // -----------------------------------------------------------------------
  // mDNS
  // -----------------------------------------------------------------------

  private startMdns(): void {
    // mDNS implementation uses the existing bonjour.ts infrastructure
    // For now, we log intent — the actual mDNS broadcast extends
    // the existing _anima-gw._tcp service with peer transport TXT records
    log.info(
      "mDNS discovery enabled (service: " +
        (this.config.mdns?.serviceName ?? "_anima-peer._tcp") +
        ")",
    );
    // TODO: integrate with src/infra/bonjour.ts to advertise and discover
    // peer transport endpoints on LAN
  }
}
