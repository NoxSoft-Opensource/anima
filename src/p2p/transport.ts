/**
 * P2P WebSocket Transport for ANIMA 6
 *
 * Manages WebSocket connections between peers, including connection
 * lifecycle, reconnection, and message framing over the encrypted channel.
 */

import { EventEmitter } from "node:events";
import { type IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  type PeerKeypair,
  type SessionKeys,
  type HandshakeHello,
  generateX25519Keypair,
  createHandshakeHello,
  verifyHandshakeHello,
  completeHandshake,
  encryptMessage,
  decryptMessage,
  ratchetKeys,
  base64UrlDecode,
} from "./crypto.js";
import { type PeerIdentity } from "./identity.js";
import { type PeerMessage, serializeMessage, deserializeMessage } from "./protocol.js";

const log = createSubsystemLogger("p2p-transport");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RATCHET_INTERVAL = 100; // ratchet keys every N messages
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const HANDSHAKE_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Peer Connection
// ---------------------------------------------------------------------------

export interface PeerConnectionInfo {
  deviceId: string;
  orgId: string;
  connectedAt: number;
  messagesSent: number;
  messagesReceived: number;
}

interface PeerConnection {
  ws: WebSocket;
  deviceId: string;
  orgId: string;
  sessionKeys: SessionKeys;
  connectedAt: number;
  messagesSent: number;
  messagesReceived: number;
  heartbeatTimer?: ReturnType<typeof setInterval>;
}

// ---------------------------------------------------------------------------
// Transport Events
// ---------------------------------------------------------------------------

export interface TransportEvents {
  "peer.connected": (deviceId: string) => void;
  "peer.disconnected": (deviceId: string, reason: string) => void;
  message: (msg: PeerMessage) => void;
  error: (err: Error) => void;
}

// ---------------------------------------------------------------------------
// PeerTransport
// ---------------------------------------------------------------------------

export interface PeerTransportConfig {
  identity: PeerIdentity;
  orgId: string;
  staticKeypair: PeerKeypair;
  ed25519PrivateKeyPem: string;
  listenPort: number;
  maxPeers?: number;
}

export class PeerTransport extends EventEmitter {
  private server: WebSocketServer | null = null;
  private peers: Map<string, PeerConnection> = new Map();
  private reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private staticPeers: Map<string, string> = new Map(); // deviceId -> url
  private running = false;

  private readonly config: Required<PeerTransportConfig>;

  constructor(config: PeerTransportConfig) {
    super();
    this.config = {
      maxPeers: 50,
      ...config,
    };
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

    this.server = new WebSocketServer({ port: this.config.listenPort });

    this.server.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      this.handleInboundConnection(ws, req).catch((err) => {
        log.warn(`inbound handshake failed: ${String(err)}`);
        ws.close(4001, "Handshake failed");
      });
    });

    this.server.on("error", (err) => {
      log.error(`transport server error: ${String(err)}`);
      this.emit("error", err);
    });

    log.info(`P2P transport listening on port ${this.config.listenPort}`);
  }

  async stop(): Promise<void> {
    this.running = false;

    // Clear reconnect timers
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    // Close all peer connections
    for (const [deviceId, peer] of this.peers) {
      if (peer.heartbeatTimer) {
        clearInterval(peer.heartbeatTimer);
      }
      peer.ws.close(1000, "Shutdown");
      this.peers.delete(deviceId);
    }

    // Close server
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    log.info("P2P transport stopped");
  }

  // -----------------------------------------------------------------------
  // Outbound connections
  // -----------------------------------------------------------------------

  async connectToPeer(url: string, peerDeviceId?: string): Promise<void> {
    if (this.peers.size >= this.config.maxPeers) {
      log.warn("max peers reached, not connecting");
      return;
    }

    const ws = new WebSocket(url, { handshakeTimeout: HANDSHAKE_TIMEOUT_MS });

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("Connection timeout"));
      }, HANDSHAKE_TIMEOUT_MS);

      ws.on("open", async () => {
        try {
          clearTimeout(timeout);
          await this.performInitiatorHandshake(ws);
          resolve();
        } catch (err) {
          ws.close(4001, "Handshake failed");
          reject(err);
        }
      });

      ws.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Register a static peer endpoint for persistent connection.
   * The transport will auto-connect and reconnect to static peers.
   */
  addStaticPeer(deviceId: string, url: string): void {
    this.staticPeers.set(deviceId, url);
    if (this.running && !this.peers.has(deviceId)) {
      this.connectToPeer(url, deviceId).catch((err) => {
        log.warn(`static peer ${deviceId} connect failed: ${String(err)}`);
        this.scheduleReconnect(deviceId, url, 0);
      });
    }
  }

  removeStaticPeer(deviceId: string): void {
    this.staticPeers.delete(deviceId);
    const timer = this.reconnectTimers.get(deviceId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(deviceId);
    }
  }

  // -----------------------------------------------------------------------
  // Handshake: Initiator side
  // -----------------------------------------------------------------------

  private async performInitiatorHandshake(ws: WebSocket): Promise<void> {
    const ephemeral = generateX25519Keypair();

    const hello = createHandshakeHello(
      this.config.identity.deviceId,
      this.config.orgId,
      this.config.staticKeypair.publicKey,
      this.config.identity.ed25519PublicKeyPem,
      this.config.ed25519PrivateKeyPem,
      ephemeral,
    );

    // Send our hello
    ws.send(JSON.stringify({ type: "peer.hello", data: hello }));

    // Wait for peer's hello
    const peerHello = await this.waitForHello(ws);

    // Verify peer's hello
    if (!verifyHandshakeHello(peerHello)) {
      throw new Error("Peer handshake verification failed");
    }

    // Verify org match
    if (peerHello.orgId !== this.config.orgId) {
      throw new Error(`Org mismatch: ${peerHello.orgId} !== ${this.config.orgId}`);
    }

    // Complete handshake
    const sessionKeys = completeHandshake(
      true,
      this.config.staticKeypair,
      ephemeral,
      base64UrlDecode(peerHello.x25519PublicKey),
      base64UrlDecode(peerHello.ephemeralPublicKey),
    );

    this.registerPeer(ws, peerHello.deviceId, peerHello.orgId, sessionKeys);
  }

  // -----------------------------------------------------------------------
  // Handshake: Responder side
  // -----------------------------------------------------------------------

  private async handleInboundConnection(ws: WebSocket, _req: IncomingMessage): Promise<void> {
    if (this.peers.size >= this.config.maxPeers) {
      ws.close(4002, "Max peers reached");
      return;
    }

    // Wait for initiator's hello
    const peerHello = await this.waitForHello(ws);

    // Verify
    if (!verifyHandshakeHello(peerHello)) {
      throw new Error("Peer handshake verification failed");
    }

    if (peerHello.orgId !== this.config.orgId) {
      throw new Error(`Org mismatch: ${peerHello.orgId} !== ${this.config.orgId}`);
    }

    // Generate our ephemeral
    const ephemeral = generateX25519Keypair();

    // Send our hello
    const hello = createHandshakeHello(
      this.config.identity.deviceId,
      this.config.orgId,
      this.config.staticKeypair.publicKey,
      this.config.identity.ed25519PublicKeyPem,
      this.config.ed25519PrivateKeyPem,
      ephemeral,
    );
    ws.send(JSON.stringify({ type: "peer.hello", data: hello }));

    // Complete handshake as responder
    const sessionKeys = completeHandshake(
      false,
      this.config.staticKeypair,
      ephemeral,
      base64UrlDecode(peerHello.x25519PublicKey),
      base64UrlDecode(peerHello.ephemeralPublicKey),
    );

    this.registerPeer(ws, peerHello.deviceId, peerHello.orgId, sessionKeys);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private waitForHello(ws: WebSocket): Promise<HandshakeHello> {
    return new Promise<HandshakeHello>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Handshake hello timeout"));
      }, HANDSHAKE_TIMEOUT_MS);

      const handler = (data: Buffer | ArrayBuffer | Buffer[]) => {
        clearTimeout(timeout);
        ws.off("message", handler);
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "peer.hello" && msg.data) {
            resolve(msg.data as HandshakeHello);
          } else {
            reject(new Error("Expected peer.hello message"));
          }
        } catch (err) {
          reject(err);
        }
      };

      ws.on("message", handler);
      ws.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      ws.on("close", () => {
        clearTimeout(timeout);
        reject(new Error("Connection closed during handshake"));
      });
    });
  }

  private registerPeer(
    ws: WebSocket,
    deviceId: string,
    orgId: string,
    sessionKeys: SessionKeys,
  ): void {
    // Close existing connection to same peer if any
    const existing = this.peers.get(deviceId);
    if (existing) {
      if (existing.heartbeatTimer) {
        clearInterval(existing.heartbeatTimer);
      }
      existing.ws.close(1000, "Replaced by new connection");
    }

    const peer: PeerConnection = {
      ws,
      deviceId,
      orgId,
      sessionKeys,
      connectedAt: Date.now(),
      messagesSent: 0,
      messagesReceived: 0,
    };

    // Set up heartbeat
    peer.heartbeatTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Handle encrypted messages
    ws.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);

        // Skip handshake messages (JSON text)
        if (buf[0] === 0x7b /* '{' */) {
          return;
        }

        // Parse encrypted frame: nonce(12) | ciphertext(rest)
        const nonce = new Uint8Array(buf.subarray(0, 12));
        const ciphertext = new Uint8Array(buf.subarray(12));

        const { plaintext, updatedKeys } = decryptMessage(peer.sessionKeys, {
          nonce,
          ciphertext,
        });
        peer.sessionKeys = updatedKeys;
        peer.messagesReceived++;

        // Ratchet keys periodically
        if (peer.messagesReceived % RATCHET_INTERVAL === 0) {
          peer.sessionKeys = ratchetKeys(peer.sessionKeys);
        }

        const msg = deserializeMessage(plaintext);
        this.emit("message", msg);
      } catch (err) {
        log.warn(`failed to decrypt message from ${deviceId}: ${String(err)}`);
      }
    });

    ws.on("close", () => {
      if (peer.heartbeatTimer) {
        clearInterval(peer.heartbeatTimer);
      }
      this.peers.delete(deviceId);
      this.emit("peer.disconnected", deviceId, "closed");
      log.info(`peer disconnected: ${deviceId}`);

      // Auto-reconnect to static peers
      const url = this.staticPeers.get(deviceId);
      if (url && this.running) {
        this.scheduleReconnect(deviceId, url, 0);
      }
    });

    ws.on("error", (err) => {
      log.warn(`peer ${deviceId} error: ${String(err)}`);
    });

    this.peers.set(deviceId, peer);
    this.emit("peer.connected", deviceId);
    log.info(`peer connected: ${deviceId} (org: ${orgId})`);

    // Clear any reconnect timer
    const timer = this.reconnectTimers.get(deviceId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(deviceId);
    }
  }

  private scheduleReconnect(deviceId: string, url: string, attempt: number): void {
    if (!this.running) {
      return;
    }

    const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);

    log.info(`scheduling reconnect to ${deviceId} in ${delay}ms (attempt ${attempt + 1})`);

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(deviceId);
      this.connectToPeer(url, deviceId).catch(() => {
        this.scheduleReconnect(deviceId, url, attempt + 1);
      });
    }, delay);

    this.reconnectTimers.set(deviceId, timer);
  }

  // -----------------------------------------------------------------------
  // Messaging
  // -----------------------------------------------------------------------

  /**
   * Send an encrypted message to a specific peer.
   */
  sendToPeer(deviceId: string, msg: PeerMessage): boolean {
    const peer = this.peers.get(deviceId);
    if (!peer || peer.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const plaintext = serializeMessage(msg);
    const { frame, updatedKeys } = encryptMessage(peer.sessionKeys, plaintext);
    peer.sessionKeys = updatedKeys;
    peer.messagesSent++;

    // Ratchet keys periodically
    if (peer.messagesSent % RATCHET_INTERVAL === 0) {
      peer.sessionKeys = ratchetKeys(peer.sessionKeys);
    }

    // Wire format: nonce(12) | ciphertext
    const wireData = Buffer.concat([Buffer.from(frame.nonce), Buffer.from(frame.ciphertext)]);
    peer.ws.send(wireData);
    return true;
  }

  /**
   * Broadcast an encrypted message to all connected peers.
   */
  broadcast(msg: PeerMessage): number {
    let sent = 0;
    for (const deviceId of this.peers.keys()) {
      if (this.sendToPeer(deviceId, msg)) {
        sent++;
      }
    }
    return sent;
  }

  // -----------------------------------------------------------------------
  // Status
  // -----------------------------------------------------------------------

  connectedPeerCount(): number {
    return this.peers.size;
  }

  listPeers(): PeerConnectionInfo[] {
    return Array.from(this.peers.values()).map((p) => ({
      deviceId: p.deviceId,
      orgId: p.orgId,
      connectedAt: p.connectedAt,
      messagesSent: p.messagesSent,
      messagesReceived: p.messagesReceived,
    }));
  }

  isConnectedTo(deviceId: string): boolean {
    const peer = this.peers.get(deviceId);
    return peer != null && peer.ws.readyState === WebSocket.OPEN;
  }
}
