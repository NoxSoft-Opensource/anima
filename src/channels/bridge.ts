/**
 * ANIMA Channel Bridge — unified messaging interface
 *
 * Routes messages between NoxSoft ecosystem channels and ANIMA sessions.
 * Each channel implements the Channel interface; the bridge aggregates
 * them into a single receive/send surface.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("channel-bridge");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChannelType = "chat" | "email" | "terminal" | "webhook" | "social" | "news";

export type MessagePriority = "urgent" | "high" | "normal" | "low";

export interface IncomingMessage {
  id: string;
  channel: string;
  from: string;
  content: string;
  timestamp: Date;
  priority: MessagePriority;
  metadata?: Record<string, unknown>;
}

export interface OutgoingMessage {
  channel: string;
  to?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface Channel {
  name: string;
  type: ChannelType;
  receive(): Promise<IncomingMessage[]>;
  send(message: OutgoingMessage): Promise<void>;
  isHealthy(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Priority ordering (lower index = higher precedence)
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Record<MessagePriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function comparePriority(a: IncomingMessage, b: IncomingMessage): number {
  const pa = PRIORITY_ORDER[a.priority];
  const pb = PRIORITY_ORDER[b.priority];
  if (pa !== pb) {
    return pa - pb;
  }
  // Within the same priority band, earlier messages come first.
  return a.timestamp.getTime() - b.timestamp.getTime();
}

// ---------------------------------------------------------------------------
// ChannelBridge
// ---------------------------------------------------------------------------

export class ChannelBridge {
  private channels: Map<string, Channel> = new Map();

  /**
   * Register a channel. Overwrites any existing channel with the same name.
   */
  register(channel: Channel): void {
    if (this.channels.has(channel.name)) {
      log.warn(`replacing already-registered channel: ${channel.name}`);
    }
    this.channels.set(channel.name, channel);
    log.info(`channel registered: ${channel.name} (${channel.type})`);
  }

  /**
   * Unregister a channel by name. No-op if not registered.
   */
  unregister(name: string): void {
    if (this.channels.delete(name)) {
      log.info(`channel unregistered: ${name}`);
    }
  }

  /**
   * Receive from all registered channels. Returns a unified, priority-sorted
   * message list (urgent first, then high, normal, low — within each band
   * messages are ordered chronologically).
   *
   * Channels that fail to receive are logged and skipped — a single broken
   * channel never blocks the rest.
   */
  async receiveAll(): Promise<IncomingMessage[]> {
    const results: IncomingMessage[] = [];

    const entries = Array.from(this.channels.entries());
    const settled = await Promise.allSettled(
      entries.map(async ([name, channel]) => {
        try {
          return await channel.receive();
        } catch (err) {
          log.warn(`receive failed for channel ${name}: ${String(err)}`);
          return [];
        }
      }),
    );

    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        results.push(...outcome.value);
      }
      // Rejections are already logged above; allSettled never rejects.
    }

    results.sort(comparePriority);
    return results;
  }

  /**
   * Send a message to a specific channel by name.
   *
   * Throws if the channel is not registered.
   */
  async send(channelName: string, message: OutgoingMessage): Promise<void> {
    const channel = this.channels.get(channelName);
    if (!channel) {
      throw new Error(`channel not registered: ${channelName}`);
    }
    await channel.send(message);
  }

  /**
   * Health-check every registered channel. Returns a map of channel name to
   * health status (true = healthy, false = unhealthy or unreachable).
   */
  async healthCheck(): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();

    const entries = Array.from(this.channels.entries());
    const settled = await Promise.allSettled(
      entries.map(async ([name, channel]) => {
        try {
          const healthy = await channel.isHealthy();
          return { name, healthy };
        } catch {
          return { name, healthy: false };
        }
      }),
    );

    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        result.set(outcome.value.name, outcome.value.healthy);
      } else {
        // Should not happen with allSettled, but be defensive.
        result.set("unknown", false);
      }
    }

    return result;
  }

  /**
   * Get a registered channel by name (or undefined).
   */
  get(name: string): Channel | undefined {
    return this.channels.get(name);
  }

  /**
   * List all registered channel names.
   */
  list(): string[] {
    return Array.from(this.channels.keys());
  }
}
