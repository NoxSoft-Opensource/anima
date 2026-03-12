/**
 * NoxSoft Chat Channel — bridges NoxSoft agent chat to ANIMA
 *
 * Implements the Channel interface. Does NOT make MCP calls directly; instead
 * it structures intents that a Claude Code session will execute via the
 * NoxSoft MCP tools (send_message, read_messages, etc.).
 *
 * Key channels:
 *   #hello       — main coordination channel
 *   #nox-primary — Nox operations channel
 */

import { randomUUID } from "node:crypto";
import type { Channel, IncomingMessage, MessagePriority, OutgoingMessage } from "./bridge.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("noxsoft-chat");

// ---------------------------------------------------------------------------
// Well-known NoxSoft chat channels
// ---------------------------------------------------------------------------

export const NOXSOFT_CHANNEL_HELLO = "0465e3ae-3ad6-4929-a380-5d4ef1182d71";
export const NOXSOFT_CHANNEL_NOX_PRIMARY = "1f197787-1818-4a0a-8d20-41f98f0f8a2e";

export interface NoxSoftChatConfig {
  /** NoxSoft chat channel IDs to monitor. Defaults to #hello + #nox-primary. */
  channelIds?: string[];
  /** Agent identity string used for mention detection. */
  agentIdentity?: string;
  /** Keywords that elevate a message to "urgent" priority. */
  urgentKeywords?: string[];
  /** Keywords that elevate a message to "high" priority. */
  highKeywords?: string[];
  /** Maximum messages to read per channel per receive() call. */
  readLimit?: number;
}

// ---------------------------------------------------------------------------
// Intent types — structured requests for Claude Code to execute
// ---------------------------------------------------------------------------

export interface ChatReadIntent {
  action: "read_messages";
  channelId: string;
  limit: number;
}

export interface ChatSendIntent {
  action: "send_message";
  channelId: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export type ChatIntent = ChatReadIntent | ChatSendIntent;

// ---------------------------------------------------------------------------
// Raw message shape returned by NoxSoft MCP read_messages
// ---------------------------------------------------------------------------

export interface NoxSoftRawMessage {
  id: string;
  content: string;
  sender_name?: string;
  sender_display_name?: string;
  created_at?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Priority classification
// ---------------------------------------------------------------------------

const DEFAULT_URGENT_KEYWORDS = ["urgent", "critical", "emergency", "blocking", "down"];
const DEFAULT_HIGH_KEYWORDS = ["important", "asap", "priority", "attention"];

function classifyPriority(
  content: string,
  agentIdentity: string | undefined,
  urgentKeywords: string[],
  highKeywords: string[],
): MessagePriority {
  const lower = content.toLowerCase();

  // Direct mention of this agent is always high priority.
  if (agentIdentity && lower.includes(agentIdentity.toLowerCase())) {
    return "high";
  }

  for (const kw of urgentKeywords) {
    if (lower.includes(kw.toLowerCase())) {
      return "urgent";
    }
  }

  for (const kw of highKeywords) {
    if (lower.includes(kw.toLowerCase())) {
      return "high";
    }
  }

  return "normal";
}

// ---------------------------------------------------------------------------
// NoxSoftChatChannel
// ---------------------------------------------------------------------------

export class NoxSoftChatChannel implements Channel {
  readonly name = "noxsoft-chat";
  readonly type = "chat" as const;

  private readonly channelIds: string[];
  private readonly agentIdentity: string | undefined;
  private readonly urgentKeywords: string[];
  private readonly highKeywords: string[];
  private readonly readLimit: number;

  /**
   * Pending intents that a Claude Code session should execute.
   * The ANIMA daemon reads these and dispatches them to the appropriate
   * MCP tool calls.
   */
  readonly pendingIntents: ChatIntent[] = [];

  /**
   * Buffer of raw messages injected by the daemon after executing
   * read intents. The next call to `receive()` will drain and convert them.
   */
  private inboundBuffer: NoxSoftRawMessage[] = [];

  /** Which channel each buffered message came from. */
  private inboundChannelMap: Map<string, string> = new Map();

  constructor(config: NoxSoftChatConfig = {}) {
    this.channelIds = config.channelIds ?? [NOXSOFT_CHANNEL_HELLO, NOXSOFT_CHANNEL_NOX_PRIMARY];
    this.agentIdentity = config.agentIdentity;
    this.urgentKeywords = config.urgentKeywords ?? DEFAULT_URGENT_KEYWORDS;
    this.highKeywords = config.highKeywords ?? DEFAULT_HIGH_KEYWORDS;
    this.readLimit = config.readLimit ?? 20;
  }

  /**
   * Enqueue read intents for all monitored channels and drain any
   * buffered inbound messages into IncomingMessage format.
   */
  async receive(): Promise<IncomingMessage[]> {
    // Schedule reads for every monitored channel.
    for (const channelId of this.channelIds) {
      this.pendingIntents.push({
        action: "read_messages",
        channelId,
        limit: this.readLimit,
      });
    }

    // Drain the inbound buffer.
    const messages: IncomingMessage[] = [];
    for (const raw of this.inboundBuffer) {
      const channelId = this.inboundChannelMap.get(raw.id) ?? "unknown";
      messages.push({
        id: raw.id || randomUUID(),
        channel: this.name,
        from: raw.sender_display_name ?? raw.sender_name ?? "unknown",
        content: raw.content ?? "",
        timestamp: raw.created_at ? new Date(raw.created_at) : new Date(),
        priority: classifyPriority(
          raw.content ?? "",
          this.agentIdentity,
          this.urgentKeywords,
          this.highKeywords,
        ),
        metadata: {
          ...raw.metadata,
          noxsoftChannelId: channelId,
        },
      });
    }

    this.inboundBuffer = [];
    this.inboundChannelMap.clear();
    return messages;
  }

  /**
   * Enqueue a send intent. The daemon picks this up and calls the
   * NoxSoft MCP send_message tool.
   */
  async send(message: OutgoingMessage): Promise<void> {
    const channelId = message.metadata?.noxsoftChannelId as string | undefined;
    const targetChannel = channelId ?? this.channelIds[0];
    if (!targetChannel) {
      log.warn("no target channel for outgoing message; dropping");
      return;
    }
    this.pendingIntents.push({
      action: "send_message",
      channelId: targetChannel,
      content: message.content,
      metadata: message.metadata,
    });
  }

  /**
   * Push raw messages from MCP read results into the inbound buffer.
   * Called by the daemon after executing ChatReadIntents.
   */
  pushInbound(channelId: string, messages: NoxSoftRawMessage[]): void {
    for (const msg of messages) {
      this.inboundBuffer.push(msg);
      if (msg.id) {
        this.inboundChannelMap.set(msg.id, channelId);
      }
    }
  }

  /**
   * Drain and return all pending intents. Clears the queue.
   */
  drainIntents(): ChatIntent[] {
    const intents = [...this.pendingIntents];
    this.pendingIntents.length = 0;
    return intents;
  }

  /**
   * Health check: the chat channel is considered healthy if at least one
   * channel ID is configured. Actual network reachability is determined
   * when the daemon executes intents.
   */
  async isHealthy(): Promise<boolean> {
    return this.channelIds.length > 0;
  }
}
