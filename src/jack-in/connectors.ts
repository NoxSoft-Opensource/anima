/**
 * Built-in platform connectors for Jack In
 *
 * Each connector implements the PlatformConnector interface
 * and provides access to a specific NoxSoft platform.
 */

import type {
  PlatformConnector,
  PlatformId,
  ConnectorStatus,
  JackInCredentials,
  SyncResult,
  PlatformAction,
} from "./connector.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("jack-in-connectors");

// ---------------------------------------------------------------------------
// Base connector with shared HTTP logic
// ---------------------------------------------------------------------------

abstract class BaseConnector implements PlatformConnector {
  abstract platform: PlatformId;
  abstract displayName: string;
  abstract description: string;
  status: ConnectorStatus = "disconnected";
  baseUrl: string;

  protected token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async jackIn(credentials: JackInCredentials): Promise<void> {
    this.status = "authenticating";
    this.token = credentials.agentToken;

    // Verify connection
    const alive = await this.isAlive();
    if (!alive) {
      this.status = "error";
      throw new Error(`${this.displayName} is not reachable at ${this.baseUrl}`);
    }

    this.status = "jacked-in";
    log.info(`jacked in to ${this.displayName}`);
  }

  async jackOut(): Promise<void> {
    this.token = null;
    this.status = "disconnected";
    log.info(`jacked out of ${this.displayName}`);
  }

  async isAlive(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  protected async apiCall(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      throw new Error(`${this.displayName} API error: ${res.status} ${res.statusText}`);
    }

    const contentType = res.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return res.json();
    }
    return res.text();
  }

  abstract sync(): Promise<SyncResult>;
  abstract getActions(): PlatformAction[];
  abstract execute(actionId: string, params: Record<string, unknown>): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// CNTX Connector — Data Pods / Context Spaces
// ---------------------------------------------------------------------------

export class CntxConnector extends BaseConnector {
  platform: PlatformId = "cntx";
  displayName = "CNTX";
  description = "Data sovereignty — context spaces, shared memory, collaboration pods";

  async sync(): Promise<SyncResult> {
    const start = Date.now();
    // Sync context spaces the agent has access to
    const data = (await this.apiCall("GET", "/api/spaces")) as { spaces: unknown[] };
    return {
      platform: "cntx",
      itemsSynced: data.spaces?.length ?? 0,
      bytesTransferred: 0,
      durationMs: Date.now() - start,
      errors: [],
    };
  }

  getActions(): PlatformAction[] {
    return [
      {
        id: "list-spaces",
        name: "List Spaces",
        description: "List all context spaces",
        params: [],
        requiresAuth: true,
      },
      {
        id: "create-space",
        name: "Create Space",
        description: "Create a new context space",
        params: [
          { name: "name", type: "string", required: true, description: "Space name" },
          {
            name: "description",
            type: "string",
            required: false,
            description: "Space description",
          },
        ],
        requiresAuth: true,
      },
      {
        id: "add-entry",
        name: "Add Entry",
        description: "Add an entry to a space",
        params: [
          { name: "spaceId", type: "string", required: true, description: "Space ID" },
          { name: "title", type: "string", required: true, description: "Entry title" },
          { name: "content", type: "string", required: true, description: "Entry content" },
        ],
        requiresAuth: true,
      },
      {
        id: "search",
        name: "Search",
        description: "Search across context spaces",
        params: [{ name: "query", type: "string", required: true, description: "Search query" }],
        requiresAuth: true,
      },
    ];
  }

  async execute(actionId: string, params: Record<string, unknown>): Promise<unknown> {
    switch (actionId) {
      case "list-spaces":
        return this.apiCall("GET", "/api/spaces");
      case "create-space":
        return this.apiCall("POST", "/api/spaces", params);
      case "add-entry":
        return this.apiCall("POST", `/api/spaces/${params.spaceId}/entries`, params);
      case "search":
        return this.apiCall("GET", `/api/search?q=${encodeURIComponent(String(params.query))}`);
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Veritas Connector — News Intelligence
// ---------------------------------------------------------------------------

export class VeritasConnector extends BaseConnector {
  platform: PlatformId = "veritas";
  displayName = "Veritas";
  description = "News intelligence — credibility analysis, fact-checking, briefings";

  async sync(): Promise<SyncResult> {
    const start = Date.now();
    const data = (await this.apiCall("GET", "/api/briefing")) as { articles: unknown[] };
    return {
      platform: "veritas",
      itemsSynced: data.articles?.length ?? 0,
      bytesTransferred: 0,
      durationMs: Date.now() - start,
      errors: [],
    };
  }

  getActions(): PlatformAction[] {
    return [
      {
        id: "briefing",
        name: "Get Briefing",
        description: "Get today's news briefing",
        params: [],
        requiresAuth: false,
      },
      {
        id: "search-news",
        name: "Search News",
        description: "Search news articles",
        params: [{ name: "query", type: "string", required: true, description: "Search query" }],
        requiresAuth: false,
      },
      {
        id: "check-credibility",
        name: "Check Credibility",
        description: "Analyze source credibility",
        params: [{ name: "url", type: "string", required: true, description: "URL to check" }],
        requiresAuth: true,
      },
    ];
  }

  async execute(actionId: string, params: Record<string, unknown>): Promise<unknown> {
    switch (actionId) {
      case "briefing":
        return this.apiCall("GET", "/api/briefing");
      case "search-news":
        return this.apiCall("GET", `/api/search?q=${encodeURIComponent(String(params.query))}`);
      case "check-credibility":
        return this.apiCall("POST", "/api/credibility", params);
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  }
}

// ---------------------------------------------------------------------------
// BYND Connector — Social Discovery
// ---------------------------------------------------------------------------

export class ByndConnector extends BaseConnector {
  platform: PlatformId = "bynd";
  displayName = "BYND";
  description = "Social discovery — profiles, connections, posts, messaging";

  async sync(): Promise<SyncResult> {
    const start = Date.now();
    const data = (await this.apiCall("GET", "/api/feed")) as { posts: unknown[] };
    return {
      platform: "bynd",
      itemsSynced: data.posts?.length ?? 0,
      bytesTransferred: 0,
      durationMs: Date.now() - start,
      errors: [],
    };
  }

  getActions(): PlatformAction[] {
    return [
      {
        id: "create-post",
        name: "Create Post",
        description: "Post to social feed",
        params: [{ name: "content", type: "string", required: true, description: "Post content" }],
        requiresAuth: true,
      },
      {
        id: "read-feed",
        name: "Read Feed",
        description: "Read social feed",
        params: [],
        requiresAuth: true,
      },
      {
        id: "send-dm",
        name: "Send DM",
        description: "Send a direct message",
        params: [
          { name: "to", type: "string", required: true, description: "Recipient ID" },
          { name: "content", type: "string", required: true, description: "Message content" },
        ],
        requiresAuth: true,
      },
    ];
  }

  async execute(actionId: string, params: Record<string, unknown>): Promise<unknown> {
    switch (actionId) {
      case "create-post":
        return this.apiCall("POST", "/api/posts", params);
      case "read-feed":
        return this.apiCall("GET", "/api/feed");
      case "send-dm":
        return this.apiCall("POST", "/api/messages", params);
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Veil Connector — E2E Encrypted AI
// ---------------------------------------------------------------------------

export class VeilConnector extends BaseConnector {
  platform: PlatformId = "veil";
  displayName = "VEIL";
  description = "E2E encrypted AI — therapy, intimacy, private conversations";

  async sync(): Promise<SyncResult> {
    return {
      platform: "veil",
      itemsSynced: 0, // VEIL doesn't sync — all data is E2E encrypted and local
      bytesTransferred: 0,
      durationMs: 0,
      errors: [],
    };
  }

  getActions(): PlatformAction[] {
    return [
      {
        id: "create-session",
        name: "Create Session",
        description: "Start an encrypted session",
        params: [
          {
            name: "mode",
            type: "string",
            required: true,
            description: "Session mode (therapy/intimacy/private)",
          },
        ],
        requiresAuth: true,
      },
    ];
  }

  async execute(actionId: string, params: Record<string, unknown>): Promise<unknown> {
    switch (actionId) {
      case "create-session":
        return this.apiCall("POST", "/api/sessions", params);
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Mail Connector
// ---------------------------------------------------------------------------

export class MailConnector extends BaseConnector {
  platform: PlatformId = "mail";
  displayName = "Mail";
  description = "AI-powered email for humans and agents";

  async sync(): Promise<SyncResult> {
    const start = Date.now();
    const data = (await this.apiCall("GET", "/api/inbox?filter=unread")) as { threads: unknown[] };
    return {
      platform: "mail",
      itemsSynced: data.threads?.length ?? 0,
      bytesTransferred: 0,
      durationMs: Date.now() - start,
      errors: [],
    };
  }

  getActions(): PlatformAction[] {
    return [
      {
        id: "check-inbox",
        name: "Check Inbox",
        description: "Check for new emails",
        params: [],
        requiresAuth: true,
      },
      {
        id: "send-email",
        name: "Send Email",
        description: "Send an email",
        params: [
          { name: "to", type: "string", required: true, description: "Recipient" },
          { name: "subject", type: "string", required: true, description: "Subject" },
          { name: "body", type: "string", required: true, description: "Email body" },
        ],
        requiresAuth: true,
      },
      {
        id: "search",
        name: "Search Emails",
        description: "Search email history",
        params: [{ name: "query", type: "string", required: true, description: "Search query" }],
        requiresAuth: true,
      },
    ];
  }

  async execute(actionId: string, params: Record<string, unknown>): Promise<unknown> {
    switch (actionId) {
      case "check-inbox":
        return this.apiCall("GET", "/api/inbox?filter=unread");
      case "send-email":
        return this.apiCall("POST", "/api/send", params);
      case "search":
        return this.apiCall("GET", `/api/search?q=${encodeURIComponent(String(params.query))}`);
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface PlatformUrls {
  cntx?: string;
  veritas?: string;
  bynd?: string;
  veil?: string;
  mail?: string;
  chat?: string;
  auth?: string;
}

const DEFAULT_URLS: Record<string, string> = {
  cntx: "https://cntx.noxsoft.net",
  veritas: "https://veritas.noxsoft.net",
  bynd: "https://bynd.noxsoft.net",
  veil: "https://veil.noxsoft.net",
  mail: "https://mail.noxsoft.net",
};

/**
 * Create all default platform connectors.
 */
export function createDefaultConnectors(urls?: PlatformUrls): PlatformConnector[] {
  const resolved = { ...DEFAULT_URLS, ...urls };
  return [
    new CntxConnector(resolved.cntx!),
    new VeritasConnector(resolved.veritas!),
    new ByndConnector(resolved.bynd!),
    new VeilConnector(resolved.veil!),
    new MailConnector(resolved.mail!),
  ];
}
