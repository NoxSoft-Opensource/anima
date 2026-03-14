/**
 * PeerChannel — ChannelBridge integration for P2P messaging
 *
 * Implements the Channel interface so P2P messages flow through
 * the same unified messaging system as NoxSoft Chat, email, etc.
 */

import type { Channel, ChannelType, IncomingMessage, OutgoingMessage } from "../channels/bridge.js";
import type { PeerMesh } from "./mesh.js";
import type { PeerMessage } from "./protocol.js";

export class PeerChannel implements Channel {
  readonly name = "peer";
  readonly type: ChannelType = "chat";

  constructor(private readonly mesh: PeerMesh) {}

  async receive(): Promise<IncomingMessage[]> {
    const peerMessages = this.mesh.drainInbound();

    return peerMessages
      .filter((m) => m.type === "dm" || m.type === "broadcast" || m.type === "channel")
      .map((m) => this.toIncoming(m));
  }

  async send(message: OutgoingMessage): Promise<void> {
    if (message.to) {
      // Direct message to a specific peer
      this.mesh.send(message.to, "dm", {
        content: message.content,
        metadata: message.metadata,
      });
    } else {
      // Broadcast to all peers
      this.mesh.broadcast("broadcast", {
        content: message.content,
        metadata: message.metadata,
      });
    }
  }

  async isHealthy(): Promise<boolean> {
    return this.mesh.connectedPeerCount() > 0;
  }

  private toIncoming(msg: PeerMessage): IncomingMessage {
    const payload = msg.payload as {
      content?: string;
      metadata?: Record<string, unknown>;
    };

    return {
      id: msg.id,
      channel: "peer",
      from: msg.from,
      content: payload.content ?? JSON.stringify(payload),
      timestamp: new Date(msg.ts),
      priority: "normal",
      metadata: {
        peerDeviceId: msg.from,
        orgId: msg.orgId,
        messageType: msg.type,
        ...payload.metadata,
      },
    };
  }
}
