/**
 * NoxSoft Email Channel — bridges NoxSoft agent email to ANIMA
 *
 * Implements the Channel interface. Structures intents for the daemon to
 * execute via NoxSoft MCP email tools (check_inbox, send_email, etc.).
 *
 * Priority mapping:
 *   starred → high
 *   unread  → normal
 *   read    → low
 */

import { randomUUID } from "node:crypto";
import type { Channel, IncomingMessage, MessagePriority, OutgoingMessage } from "./bridge.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("noxsoft-email");

// ---------------------------------------------------------------------------
// Intent types
// ---------------------------------------------------------------------------

export interface EmailCheckIntent {
  action: "check_inbox";
  filter: "unread" | "starred" | "all";
  limit: number;
}

export interface EmailSendIntent {
  action: "send_email";
  to: string;
  subject: string;
  body: string;
  cc?: string;
}

export interface EmailReplyIntent {
  action: "reply_to_email";
  threadId: string;
  body: string;
  to?: string;
}

export type EmailIntent = EmailCheckIntent | EmailSendIntent | EmailReplyIntent;

// ---------------------------------------------------------------------------
// Raw email shape from NoxSoft MCP check_inbox / read_email
// ---------------------------------------------------------------------------

export interface NoxSoftRawEmail {
  id: string;
  threadId?: string;
  from?: string;
  subject?: string;
  snippet?: string;
  body?: string;
  starred?: boolean;
  unread?: boolean;
  date?: string;
  labels?: string[];
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface NoxSoftEmailConfig {
  /** Inbox filter for receive(). Defaults to "unread". */
  defaultFilter?: "unread" | "starred" | "all";
  /** Maximum emails to fetch per receive() call. Defaults to 10. */
  readLimit?: number;
}

// ---------------------------------------------------------------------------
// Priority helpers
// ---------------------------------------------------------------------------

function classifyEmailPriority(email: NoxSoftRawEmail): MessagePriority {
  if (email.starred) {
    return "high";
  }
  if (email.unread) {
    return "normal";
  }
  return "low";
}

// ---------------------------------------------------------------------------
// NoxSoftEmailChannel
// ---------------------------------------------------------------------------

export class NoxSoftEmailChannel implements Channel {
  readonly name = "noxsoft-email";
  readonly type = "email" as const;

  private readonly defaultFilter: "unread" | "starred" | "all";
  private readonly readLimit: number;

  /** Pending intents for the daemon to execute. */
  readonly pendingIntents: EmailIntent[] = [];

  /** Inbound buffer populated by the daemon after executing check_inbox. */
  private inboundBuffer: NoxSoftRawEmail[] = [];

  constructor(config: NoxSoftEmailConfig = {}) {
    this.defaultFilter = config.defaultFilter ?? "unread";
    this.readLimit = config.readLimit ?? 10;
  }

  /**
   * Enqueue a check_inbox intent and drain any buffered emails into
   * IncomingMessage format.
   */
  async receive(): Promise<IncomingMessage[]> {
    this.pendingIntents.push({
      action: "check_inbox",
      filter: this.defaultFilter,
      limit: this.readLimit,
    });

    const messages: IncomingMessage[] = [];
    for (const raw of this.inboundBuffer) {
      const subject = raw.subject ?? "(no subject)";
      const body = raw.body ?? raw.snippet ?? "";
      messages.push({
        id: raw.id || randomUUID(),
        channel: this.name,
        from: raw.from ?? "unknown",
        content: `[${subject}] ${body}`.trim(),
        timestamp: raw.date ? new Date(raw.date) : new Date(),
        priority: classifyEmailPriority(raw),
        metadata: {
          threadId: raw.threadId,
          subject,
          starred: raw.starred,
          unread: raw.unread,
          labels: raw.labels,
          ...raw.metadata,
        },
      });
    }

    this.inboundBuffer = [];
    return messages;
  }

  /**
   * Send an email. If metadata contains a threadId, generates a reply
   * intent; otherwise generates a send_email intent.
   */
  async send(message: OutgoingMessage): Promise<void> {
    const threadId = message.metadata?.threadId as string | undefined;

    if (threadId) {
      this.pendingIntents.push({
        action: "reply_to_email",
        threadId,
        body: message.content,
        to: message.to,
      });
    } else {
      if (!message.to) {
        log.warn("send_email intent without recipient; dropping");
        return;
      }
      const subject = (message.metadata?.subject as string | undefined) ?? "Message from ANIMA";
      this.pendingIntents.push({
        action: "send_email",
        to: message.to,
        subject,
        body: message.content,
        cc: message.metadata?.cc as string | undefined,
      });
    }
  }

  /**
   * Push raw email data from MCP results into the inbound buffer.
   */
  pushInbound(emails: NoxSoftRawEmail[]): void {
    this.inboundBuffer.push(...emails);
  }

  /**
   * Drain and return all pending intents.
   */
  drainIntents(): EmailIntent[] {
    const intents = [...this.pendingIntents];
    this.pendingIntents.length = 0;
    return intents;
  }

  /**
   * Email channel is considered healthy when the intent pipeline is
   * operational. Actual reachability is verified when the daemon
   * executes intents.
   */
  async isHealthy(): Promise<boolean> {
    return true;
  }
}
