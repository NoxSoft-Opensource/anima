/**
 * P2P Mesh Network for ANIMA 6
 *
 * The PeerMesh is the top-level orchestrator that ties together
 * transport, discovery, and the channel bridge. It manages the
 * lifecycle of peer connections and routes messages.
 */

import { EventEmitter } from "node:events";
import type { PeerKeypair } from "./crypto.js";
import type { PeerIdentity } from "./identity.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { PeerDiscovery, type DiscoveryConfig, type PeerRecord } from "./discovery.js";
import { type PeerMessage, type PeerMessageType, createMessage } from "./protocol.js";
import { PeerTransport, type PeerTransportConfig, type PeerConnectionInfo } from "./transport.js";

const log = createSubsystemLogger("p2p-mesh");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface PeerMeshConfig {
  identity: PeerIdentity;
  orgId: string;
  staticKeypair: PeerKeypair;
  ed25519PrivateKeyPem: string;
  listenPort: number;
  maxPeers?: number;
  discovery?: {
    registry?: { enabled: boolean; url?: string; token?: string };
    mdns?: { enabled: boolean };
    staticPeers?: Array<{
      deviceId: string;
      url: string;
      x25519PublicKey: string;
      ed25519PublicKey: string;
    }>;
  };
}

// ---------------------------------------------------------------------------
// PeerMesh
// ---------------------------------------------------------------------------

export class PeerMesh extends EventEmitter {
  private transport: PeerTransport;
  private discovery: PeerDiscovery;
  private inboundQueue: PeerMessage[] = [];
  private running = false;
  private readonly config: PeerMeshConfig;

  constructor(config: PeerMeshConfig) {
    super();
    this.config = config;

    // Initialize transport
    const transportConfig: PeerTransportConfig = {
      identity: config.identity,
      orgId: config.orgId,
      staticKeypair: config.staticKeypair,
      ed25519PrivateKeyPem: config.ed25519PrivateKeyPem,
      listenPort: config.listenPort,
      maxPeers: config.maxPeers,
    };
    this.transport = new PeerTransport(transportConfig);

    // Initialize discovery
    const discoveryConfig: DiscoveryConfig = {
      orgId: config.orgId,
      deviceId: config.identity.deviceId,
      x25519PublicKey: config.identity.x25519PublicKeyBase64,
      ed25519PublicKey: "", // filled from device identity
      localEndpoints: [
        { type: "direct", url: `ws://localhost:${config.listenPort}`, priority: 10 },
      ],
      registry: config.discovery?.registry,
      mdns: config.discovery?.mdns,
      staticPeers: config.discovery?.staticPeers?.map((p) => ({
        deviceId: p.deviceId,
        orgId: config.orgId,
        x25519PublicKey: p.x25519PublicKey,
        ed25519PublicKey: p.ed25519PublicKey,
        endpoints: [{ type: "direct" as const, url: p.url, priority: 1 }],
        capabilities: [],
        lastSeenMs: Date.now(),
      })),
    };
    this.discovery = new PeerDiscovery(discoveryConfig);

    // Wire up events
    this.transport.on("message", (msg: PeerMessage) => {
      this.inboundQueue.push(msg);
      this.emit("message", msg);
    });

    this.transport.on("peer.connected", (deviceId: string) => {
      log.info(`mesh: peer connected — ${deviceId}`);
      this.emit("peer.connected", deviceId);
    });

    this.transport.on("peer.disconnected", (deviceId: string, reason: string) => {
      log.info(`mesh: peer disconnected — ${deviceId} (${reason})`);
      this.emit("peer.disconnected", deviceId, reason);
    });

    // Auto-connect to newly discovered peers
    this.discovery.on("peer.discovered", (peer: PeerRecord) => {
      if (!this.transport.isConnectedTo(peer.deviceId)) {
        const endpoint = this.discovery.getBestEndpoint(peer.deviceId);
        if (endpoint) {
          log.info(`auto-connecting to discovered peer: ${peer.displayName ?? peer.deviceId}`);
          this.transport.connectToPeer(endpoint.url, peer.deviceId).catch((err) => {
            log.warn(`auto-connect failed for ${peer.deviceId}: ${String(err)}`);
          });
        }
      }
    });
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

    await this.transport.start();
    await this.discovery.start();

    // Connect to static peers
    if (this.config.discovery?.staticPeers) {
      for (const peer of this.config.discovery.staticPeers) {
        this.transport.addStaticPeer(peer.deviceId, peer.url);
      }
    }

    log.info("P2P mesh started");
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.discovery.stop();
    await this.transport.stop();
    log.info("P2P mesh stopped");
  }

  // -----------------------------------------------------------------------
  // Messaging
  // -----------------------------------------------------------------------

  /**
   * Send a direct message to a specific peer.
   */
  send(targetDeviceId: string, type: PeerMessageType, payload: unknown): boolean {
    const msg = createMessage(type, this.config.identity.deviceId, this.config.orgId, payload, {
      to: targetDeviceId,
    });
    return this.transport.sendToPeer(targetDeviceId, msg);
  }

  /**
   * Broadcast a message to all connected peers.
   */
  broadcast(type: PeerMessageType, payload: unknown): number {
    const msg = createMessage(type, this.config.identity.deviceId, this.config.orgId, payload);
    return this.transport.broadcast(msg);
  }

  /**
   * Send an RPC request and wait for response.
   */
  async invoke(
    targetDeviceId: string,
    method: string,
    params?: unknown,
    timeoutMs = 30_000,
  ): Promise<unknown> {
    const msg = createMessage(
      "rpc.request",
      this.config.identity.deviceId,
      this.config.orgId,
      { method, params },
      { to: targetDeviceId },
    );

    const sent = this.transport.sendToPeer(targetDeviceId, msg);
    if (!sent) {
      throw new Error(`Peer ${targetDeviceId} not connected`);
    }

    // Wait for matching response
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.off("message", handler);
        reject(new Error(`RPC timeout: ${method}`));
      }, timeoutMs);

      const handler = (response: PeerMessage) => {
        if (response.type === "rpc.response" && response.replyTo === msg.id) {
          clearTimeout(timeout);
          this.off("message", handler);

          const payload = response.payload as {
            result?: unknown;
            error?: { code: number; message: string };
          };
          if (payload.error) {
            reject(new Error(payload.error.message));
          } else {
            resolve(payload.result);
          }
        }
      };

      this.on("message", handler);
    });
  }

  /**
   * Drain the inbound message queue (used by PeerChannel).
   */
  drainInbound(): PeerMessage[] {
    const messages = this.inboundQueue.splice(0);
    return messages;
  }

  // -----------------------------------------------------------------------
  // Status
  // -----------------------------------------------------------------------

  connectedPeerCount(): number {
    return this.transport.connectedPeerCount();
  }

  listPeers(): PeerConnectionInfo[] {
    return this.transport.listPeers();
  }

  discoveredPeers(): PeerRecord[] {
    return this.discovery.getPeers();
  }

  isConnectedTo(deviceId: string): boolean {
    return this.transport.isConnectedTo(deviceId);
  }
}
