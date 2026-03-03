/**
 * ANIMA API Client — wraps fetch calls to the daemon gateway.
 *
 * Default endpoint: http://localhost:18789
 */

const BASE_URL = "http://localhost:18789";
const GATEWAY_WS_URL = "ws://localhost:18789/ws";
const GATEWAY_PROTOCOL_VERSION = 3;
const RPC_TIMEOUT_MS = 10_000;

type RpcResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { message?: string };
};

type RpcEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
};

type GatewayStatusPayload = {
  heartbeat?: {
    agents?: Array<{ enabled?: boolean; everyMs?: number }>;
  };
  queuedSystemEvents?: unknown[];
};

type LastHeartbeatPayload = {
  ts?: number;
};

type GatewayIdentityPayload = {
  name?: string;
  avatar?: string;
  agentId?: string;
};

type GatewaySessionsPayload = {
  sessions?: Array<{
    key?: string;
    kind?: string;
    sessionId?: string;
    updatedAt?: number;
    abortedLastRun?: boolean;
    model?: string;
    modelProvider?: string;
    origin?: {
      surface?: string;
    };
  }>;
};

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseBody(options?: RequestInit): Record<string, unknown> {
  const raw = options?.body;
  if (typeof raw !== "string" || !raw.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

async function gatewayRpc<T>(method: string, params?: Record<string, unknown>): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const ws = new WebSocket(GATEWAY_WS_URL);
    let settled = false;
    let connected = false;
    let connectReqId = "";
    let methodReqId = "";
    let connectDelayTimer: number | null = null;

    const timeout = window.setTimeout(() => {
      finishError(new Error(`Gateway RPC timed out: ${method}`));
    }, RPC_TIMEOUT_MS);

    function cleanup() {
      window.clearTimeout(timeout);
      if (connectDelayTimer != null) {
        window.clearTimeout(connectDelayTimer);
      }
      ws.close();
    }

    function finishOk(value: T) {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    }

    function finishError(err: Error) {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(err);
    }

    function sendFrame(id: string, rpcMethod: string, rpcParams?: Record<string, unknown>) {
      ws.send(
        JSON.stringify({
          type: "req",
          id,
          method: rpcMethod,
          params: rpcParams ?? {},
        }),
      );
    }

    function sendConnect() {
      connectReqId = makeId();
      sendFrame(connectReqId, "connect", {
        minProtocol: GATEWAY_PROTOCOL_VERSION,
        maxProtocol: GATEWAY_PROTOCOL_VERSION,
        client: {
          id: "anima-control-ui-api",
          version: "1.0.0",
          platform: "web",
          mode: "webchat",
        },
        role: "operator",
        scopes: ["operator.admin"],
        caps: [],
      });
    }

    ws.onopen = () => {
      connectDelayTimer = window.setTimeout(() => {
        connectDelayTimer = null;
        sendConnect();
      }, 100);
    };

    ws.onmessage = (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        return;
      }

      const frame = parsed as RpcResponseFrame | RpcEventFrame;
      if (frame.type === "event") {
        if (frame.event === "connect.challenge") {
          sendConnect();
        }
        return;
      }

      if (frame.type !== "res") {
        return;
      }

      if (frame.id === connectReqId) {
        if (!frame.ok) {
          finishError(new Error(frame.error?.message || "Gateway connect failed"));
          return;
        }
        connected = true;
        methodReqId = makeId();
        sendFrame(methodReqId, method, params);
        return;
      }

      if (frame.id === methodReqId && connected) {
        if (!frame.ok) {
          finishError(new Error(frame.error?.message || `Gateway method failed: ${method}`));
          return;
        }
        finishOk((frame.payload ?? {}) as T);
      }
    };

    ws.onerror = () => {
      finishError(new Error(`Gateway websocket error while requesting ${method}`));
    };

    ws.onclose = () => {
      if (!settled) {
        finishError(new Error(`Gateway websocket closed while requesting ${method}`));
      }
    };
  });
}

function mapDaemonStatus(
  status: GatewayStatusPayload,
  lastHeartbeat: LastHeartbeatPayload | null,
): DaemonStatus {
  const firstAgent = Array.isArray(status.heartbeat?.agents) ? status.heartbeat?.agents[0] : null;
  const interval =
    typeof firstAgent?.everyMs === "number" && Number.isFinite(firstAgent.everyMs)
      ? firstAgent.everyMs
      : 300_000;
  const lastTs =
    typeof lastHeartbeat?.ts === "number" && Number.isFinite(lastHeartbeat.ts)
      ? lastHeartbeat.ts
      : null;

  return {
    heartbeat: {
      running: Boolean(firstAgent?.enabled),
      paused: false,
      beatCount: 0,
      lastBeat: lastTs != null ? new Date(lastTs).toISOString() : null,
      nextBeat: lastTs != null ? new Date(lastTs + interval).toISOString() : null,
      interval,
    },
    budget: {
      spent: 0,
      remaining: 200,
      limit: 200,
      sessionCount: 0,
    },
    queue: {
      queued: Array.isArray(status.queuedSystemEvents) ? status.queuedSystemEvents.length : 0,
      running: 0,
      completed: 0,
      failed: 0,
    },
    mcp: {
      servers: [],
    },
  };
}

function mapIdentity(identity: GatewayIdentityPayload): IdentityResponse {
  const name = identity.name?.trim() || "Assistant";
  const agentId = identity.agentId?.trim() || "main";
  const avatar = identity.avatar?.trim() || "A";

  return {
    loadedAt: new Date().toISOString(),
    components: [
      {
        name: "SOUL",
        content: `# ${name}\nAgent ID: ${agentId}\nAvatar: ${avatar}`,
        source: "user",
        description: "Core identity resolved from active gateway agent profile.",
      },
      {
        name: "HEART",
        content: "Heartbeat mode active. This instance listens for ongoing directives.",
        source: "template",
        description: "Heartbeat and operating rhythm configuration.",
      },
      {
        name: "MEMORY",
        content: "Memory systems are managed by ANIMA runtime and session storage.",
        source: "template",
        description: "Long-term continuity and session persistence layer.",
      },
    ],
  };
}

function mapSessions(payload: GatewaySessionsPayload): SessionEntry[] {
  if (!Array.isArray(payload.sessions)) {
    return [];
  }

  return payload.sessions.map((entry) => {
    const updatedAt =
      typeof entry.updatedAt === "number" && Number.isFinite(entry.updatedAt)
        ? new Date(entry.updatedAt).toISOString()
        : new Date().toISOString();
    const model =
      [entry.modelProvider, entry.model]
        .filter((part) => typeof part === "string" && part)
        .join("/") || "gateway session";

    return {
      sessionId: entry.sessionId || entry.key || makeId(),
      mode: entry.origin?.surface || entry.kind || "session",
      status: entry.abortedLastRun ? "failed" : "completed",
      prompt: `Model: ${model}`,
      durationMs: 0,
      costUsd: null,
      savedAt: updatedAt,
    };
  });
}

const DEFAULT_SVRN_STATUS: SVRNStatus = {
  enabled: false,
  running: false,
  paused: false,
  nodeId: "unavailable",
  uptimeMs: 0,
  tasksCompleted: 0,
  tasksFailed: 0,
  balance: 0,
  sessionEarnings: 0,
  limits: {
    maxCpuPercent: 10,
    maxRamMB: 256,
    maxBandwidthMbps: 5,
  },
  resources: null,
  earnings: {
    allTimeEarned: 0,
    allTimeApplied: 0,
    balanceValueUSD: 0,
    todayEarned: 0,
    todayTasks: 0,
  },
};

async function requestViaGatewayRpc<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method || "GET").toUpperCase();

  if (method === "GET" && path === "/api/status") {
    const [status, lastHeartbeat] = await Promise.all([
      gatewayRpc<GatewayStatusPayload>("status", {}),
      gatewayRpc<LastHeartbeatPayload>("last-heartbeat", {}).catch(() => null),
    ]);
    return mapDaemonStatus(status, lastHeartbeat) as T;
  }

  if (method === "GET" && path === "/api/identity") {
    const identity = await gatewayRpc<GatewayIdentityPayload>("agent.identity.get", {
      sessionKey: "main",
    }).catch(() => ({ name: "Assistant", avatar: "A", agentId: "main" }));
    return mapIdentity(identity) as T;
  }

  if (method === "GET" && path === "/api/sessions") {
    const sessions = await gatewayRpc<GatewaySessionsPayload>("sessions.list", { limit: 50 }).catch(
      () => ({ sessions: [] }),
    );
    return mapSessions(sessions) as T;
  }

  if (method === "GET" && path === "/api/queue") {
    return [] as T;
  }

  if (method === "POST" && path === "/api/queue") {
    const body = parseBody(options);
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const runId = makeId();
    if (prompt) {
      await gatewayRpc<{ runId?: string }>("chat.send", {
        sessionKey: "main",
        message: prompt,
        deliver: false,
        idempotencyKey: runId,
      });
    }
    return { id: runId } as T;
  }

  if (method === "GET" && path === "/api/mcp") {
    return [] as T;
  }

  if (method === "GET" && path === "/api/svrn/status") {
    return DEFAULT_SVRN_STATUS as T;
  }

  if (method === "POST" && (path === "/api/svrn/toggle" || path === "/api/svrn/limits")) {
    return { success: true } as T;
  }

  throw new Error(`Unsupported control UI API path: ${method} ${path}`);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  try {
    const resp = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!resp.ok) {
      if (path.startsWith("/api/")) {
        return await requestViaGatewayRpc<T>(path, options);
      }
      throw new Error(`API error: ${resp.status} ${resp.statusText}`);
    }

    const contentType = String(resp.headers.get("content-type") || "");
    if (contentType.includes("application/json")) {
      return (await resp.json()) as T;
    }

    const raw = await resp.text();
    if (path.startsWith("/api/")) {
      const normalized = raw.trim().toLowerCase();
      if (normalized.startsWith("<!doctype html") || normalized.startsWith("<html")) {
        return await requestViaGatewayRpc<T>(path, options);
      }
      try {
        return JSON.parse(raw) as T;
      } catch {
        return await requestViaGatewayRpc<T>(path, options);
      }
    }

    return JSON.parse(raw) as T;
  } catch (err) {
    if (path.startsWith("/api/")) {
      return await requestViaGatewayRpc<T>(path, options);
    }
    throw err;
  }
}

// --- Types ---

export interface DaemonStatus {
  heartbeat: {
    running: boolean;
    paused: boolean;
    beatCount: number;
    lastBeat: string | null;
    nextBeat: string | null;
    interval: number;
  };
  budget: {
    spent: number;
    remaining: number;
    limit: number;
    sessionCount: number;
  };
  queue: {
    queued: number;
    running: number;
    completed: number;
    failed: number;
  };
  mcp: {
    servers: MCPServerStatus[];
  };
}

export interface MCPServerStatus {
  name: string;
  status: "healthy" | "unhealthy" | "unknown";
  lastHealthCheck: string | null;
  consecutiveFailures: number;
  command: string;
  args: string[];
}

export interface IdentityResponse {
  components: {
    name: string;
    content: string;
    source: "user" | "template";
    description: string;
  }[];
  loadedAt: string;
}

export interface SessionEntry {
  sessionId: string;
  mode: string;
  status: string;
  prompt: string;
  durationMs: number;
  costUsd: number | null;
  savedAt: string;
}

export interface QueueItem {
  id: string;
  prompt: string;
  priority: string;
  status: string;
  source: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: string;
  error?: string;
}

// --- API Functions ---

export async function getStatus(): Promise<DaemonStatus> {
  return request<DaemonStatus>("/api/status");
}

export async function getIdentity(): Promise<IdentityResponse> {
  return request<IdentityResponse>("/api/identity");
}

export async function getSessions(): Promise<SessionEntry[]> {
  return request<SessionEntry[]>("/api/sessions");
}

export async function getQueue(): Promise<QueueItem[]> {
  return request<QueueItem[]>("/api/queue");
}

export async function getMCPStatus(): Promise<MCPServerStatus[]> {
  return request<MCPServerStatus[]>("/api/mcp");
}

export async function addToQueue(
  prompt: string,
  priority: string = "normal",
): Promise<{ id: string }> {
  return request<{ id: string }>("/api/queue", {
    method: "POST",
    body: JSON.stringify({ prompt, priority, source: "web" }),
  });
}

// --- SVRN Types ---

export interface SVRNStatus {
  enabled: boolean;
  running: boolean;
  paused: boolean;
  nodeId: string;
  uptimeMs: number;
  tasksCompleted: number;
  tasksFailed: number;
  balance: number;
  sessionEarnings: number;
  limits: {
    maxCpuPercent: number;
    maxRamMB: number;
    maxBandwidthMbps: number;
  };
  resources: {
    cpuPercent: number;
    ramUsedMB: number;
    bandwidthMbps: number;
  } | null;
  earnings: {
    allTimeEarned: number;
    allTimeApplied: number;
    balanceValueUSD: number;
    todayEarned: number;
    todayTasks: number;
  };
}

export async function getSVRNStatus(): Promise<SVRNStatus> {
  return request<SVRNStatus>("/api/svrn/status");
}

export async function setSVRNEnabled(enabled: boolean): Promise<{ success: boolean }> {
  return request<{ success: boolean }>("/api/svrn/toggle", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

export async function updateSVRNLimits(limits: {
  maxCpuPercent?: number;
  maxRamMB?: number;
  maxBandwidthMbps?: number;
}): Promise<{ success: boolean }> {
  return request<{ success: boolean }>("/api/svrn/limits", {
    method: "POST",
    body: JSON.stringify(limits),
  });
}

// --- WebSocket ---

export function connectWebSocket(
  onMessage: (event: MessageEvent) => void,
  onError?: (event: Event) => void,
): WebSocket {
  const ws = new WebSocket("ws://localhost:18789/ws");

  ws.onmessage = onMessage;
  ws.onerror = onError || (() => {});

  return ws;
}
