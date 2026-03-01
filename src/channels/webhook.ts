/**
 * Webhook Channel — HTTP POST endpoint for external integrations
 *
 * Implements the Channel interface. Provides an HTTP handler function
 * (not a standalone server) so the ANIMA daemon can mount it on its
 * existing HTTP infrastructure.
 *
 * Incoming webhooks are validated with a bearer token and queued.
 * Outgoing messages are buffered as responses (pull model) or can
 * be forwarded to a configured callback URL.
 */

import { randomUUID } from "node:crypto";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { Channel, IncomingMessage, MessagePriority, OutgoingMessage } from "./bridge.js";

const log = createSubsystemLogger("webhook-channel");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface WebhookChannelConfig {
  /** Shared secret for bearer-token validation. Required. */
  authToken: string;
  /** Endpoint path prefix. Defaults to "/webhook". */
  path?: string;
  /** Default priority for incoming webhook payloads. Defaults to "normal". */
  defaultPriority?: MessagePriority;
  /** Maximum queued inbound messages before oldest are dropped. Defaults to 500. */
  maxQueueSize?: number;
}

// ---------------------------------------------------------------------------
// Webhook payload shape (what external callers POST)
// ---------------------------------------------------------------------------

export interface WebhookPayload {
  /** Caller-supplied message ID (optional; a UUID is generated if absent). */
  id?: string;
  /** Sender identifier. */
  from?: string;
  /** Message body. */
  content: string;
  /** Priority override. */
  priority?: MessagePriority;
  /** Arbitrary metadata forwarded to the IncomingMessage. */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Minimal HTTP types (framework-agnostic)
// ---------------------------------------------------------------------------

export interface WebhookRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export interface WebhookResponse {
  status: number;
  body: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// WebhookChannel
// ---------------------------------------------------------------------------

export class WebhookChannel implements Channel {
  readonly name = "webhook";
  readonly type = "webhook" as const;

  private readonly authToken: string;
  private readonly endpointPath: string;
  private readonly defaultPriority: MessagePriority;
  private readonly maxQueueSize: number;

  private inboundQueue: IncomingMessage[] = [];

  constructor(config: WebhookChannelConfig) {
    this.authToken = config.authToken;
    this.endpointPath = config.path ?? "/webhook";
    this.defaultPriority = config.defaultPriority ?? "normal";
    this.maxQueueSize = config.maxQueueSize ?? 500;
  }

  /**
   * Handle an incoming HTTP request. Returns a WebhookResponse suitable
   * for the caller's HTTP framework to serialize.
   *
   * Only POST to the configured path is accepted. Bearer token must match.
   */
  handleRequest(req: WebhookRequest): WebhookResponse {
    // Path check
    const url = req.url?.split("?")[0] ?? "";
    if (!url.endsWith(this.endpointPath) && url !== this.endpointPath) {
      return { status: 404, body: { error: "not found" } };
    }

    // Method check
    if (req.method?.toUpperCase() !== "POST") {
      return { status: 405, body: { error: "method not allowed" } };
    }

    // Auth check
    const authHeader = typeof req.headers.authorization === "string"
      ? req.headers.authorization
      : Array.isArray(req.headers.authorization)
        ? req.headers.authorization[0]
        : undefined;

    if (!authHeader) {
      return { status: 401, body: { error: "authorization header required" } };
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : authHeader.trim();

    if (!constantTimeEqual(token, this.authToken)) {
      return { status: 403, body: { error: "invalid token" } };
    }

    // Parse body
    const payload = req.body as WebhookPayload | undefined;
    if (!payload || typeof payload.content !== "string" || !payload.content.trim()) {
      return { status: 400, body: { error: "content is required" } };
    }

    const message: IncomingMessage = {
      id: payload.id ?? randomUUID(),
      channel: this.name,
      from: payload.from ?? "webhook",
      content: payload.content,
      timestamp: new Date(),
      priority: payload.priority ?? this.defaultPriority,
      metadata: payload.metadata,
    };

    // Enforce queue size limit — drop oldest if full.
    if (this.inboundQueue.length >= this.maxQueueSize) {
      const dropped = this.inboundQueue.shift();
      log.warn(`webhook queue full; dropped oldest message ${dropped?.id}`);
    }

    this.inboundQueue.push(message);
    log.info(`webhook message queued: ${message.id} from ${message.from}`);

    return { status: 200, body: { ok: true, id: message.id } };
  }

  /**
   * Drain all queued inbound webhook messages.
   */
  async receive(): Promise<IncomingMessage[]> {
    const messages = [...this.inboundQueue];
    this.inboundQueue = [];
    return messages;
  }

  /**
   * Webhook channel send is a no-op by default. Outgoing messages
   * could be forwarded to a callback URL in a future extension.
   */
  async send(_message: OutgoingMessage): Promise<void> {
    log.debug("webhook channel send is a no-op (pull-only channel)");
  }

  /**
   * Webhook is healthy if the auth token is configured.
   */
  async isHealthy(): Promise<boolean> {
    return this.authToken.length > 0;
  }

  /**
   * Get the configured endpoint path.
   */
  getEndpointPath(): string {
    return this.endpointPath;
  }
}

// ---------------------------------------------------------------------------
// Constant-time string comparison (prevent timing attacks on auth token)
// ---------------------------------------------------------------------------

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
