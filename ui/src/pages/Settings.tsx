import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MarkdownText from "../components/MarkdownText";
import { buildOperatorConnectParams, readGatewayChallengeNonce } from "../gateway-connect";
import { resolveGatewayConnectAuth, resolveGatewayWsUrl } from "../gateway-connection";

const GATEWAY_WS_URL = resolveGatewayWsUrl();
const GATEWAY_PROTOCOL_VERSION = 3;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

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

type ConfigIssue = {
  path?: string;
  message?: string;
};

type ConfigGetPayload = {
  raw?: string;
  hash?: string;
  valid?: boolean;
  issues?: ConfigIssue[];
  config?: unknown;
};

type HeartbeatAgentStatus = {
  agentId: string;
  enabled: boolean;
  every: string;
  everyMs: number | null;
};

type StatusPayload = {
  heartbeat?: {
    agents?: unknown[];
  };
};

type LastHeartbeatPayload = {
  ts?: number;
  status?: string;
  preview?: string;
  reason?: string;
  channel?: string;
  to?: string;
  accountId?: string;
};

type ChatHistoryMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
};

type HeartbeatFormState = {
  every: string;
  target: string;
  session: string;
  model: string;
  prompt: string;
  activeStart: string;
  activeEnd: string;
  activeTimezone: string;
  ackMaxChars: string;
  includeReasoning: boolean;
};

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeIssues(input: unknown): ConfigIssue[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((row) => {
      if (!row || typeof row !== "object") {
        return null;
      }
      const rec = row as Record<string, unknown>;
      return {
        path: typeof rec.path === "string" ? rec.path : undefined,
        message: typeof rec.message === "string" ? rec.message : undefined,
      };
    })
    .filter((row): row is ConfigIssue => Boolean(row));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractText(value: unknown): string {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => extractText(item))
      .join("\n")
      .trim();
  }
  if (isRecord(value)) {
    if (typeof value.text === "string") {
      return value.text;
    }
    if (value.type === "text" && typeof value.text === "string") {
      return value.text;
    }
    if ("message" in value) {
      return extractText(value.message);
    }
    if ("content" in value) {
      return extractText(value.content);
    }
  }
  return "";
}

function normalizeHistoryMessages(raw: unknown): ChatHistoryMessage[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const messages: ChatHistoryMessage[] = [];
  for (const item of raw) {
    if (!isRecord(item)) {
      continue;
    }
    const role = item.role;
    if (role !== "user" && role !== "assistant") {
      continue;
    }
    const text = extractText(item.content).trim();
    if (!text) {
      continue;
    }
    const timestamp = typeof item.timestamp === "number" ? item.timestamp : Date.now();
    messages.push({
      id: makeId(),
      role,
      text,
      timestamp,
    });
  }
  return messages;
}

function normalizeHeartbeatAgents(input: unknown): HeartbeatAgentStatus[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((row, index) => {
      if (!isRecord(row)) {
        return null;
      }
      const everyMsRaw = row.everyMs;
      return {
        agentId:
          typeof row.agentId === "string" && row.agentId.trim()
            ? row.agentId
            : `agent-${index + 1}`,
        enabled: row.enabled === true,
        every: typeof row.every === "string" && row.every.trim() ? row.every : "disabled",
        everyMs: typeof everyMsRaw === "number" && Number.isFinite(everyMsRaw) ? everyMsRaw : null,
      } satisfies HeartbeatAgentStatus;
    })
    .filter((entry): entry is HeartbeatAgentStatus => Boolean(entry));
}

function readHeartbeatFormState(config: unknown): HeartbeatFormState {
  const defaults: HeartbeatFormState = {
    every: "",
    target: "",
    session: "",
    model: "",
    prompt: "",
    activeStart: "",
    activeEnd: "",
    activeTimezone: "",
    ackMaxChars: "",
    includeReasoning: false,
  };
  if (!isRecord(config)) {
    return defaults;
  }
  const agents = isRecord(config.agents) ? config.agents : null;
  const defaultsNode = agents && isRecord(agents.defaults) ? agents.defaults : null;
  const heartbeat =
    defaultsNode && isRecord(defaultsNode.heartbeat) ? defaultsNode.heartbeat : null;
  if (!heartbeat) {
    return defaults;
  }
  const activeHours = isRecord(heartbeat.activeHours) ? heartbeat.activeHours : null;
  return {
    every: typeof heartbeat.every === "string" ? heartbeat.every : "",
    target: typeof heartbeat.target === "string" ? heartbeat.target : "",
    session: typeof heartbeat.session === "string" ? heartbeat.session : "",
    model: typeof heartbeat.model === "string" ? heartbeat.model : "",
    prompt: typeof heartbeat.prompt === "string" ? heartbeat.prompt : "",
    activeStart: activeHours && typeof activeHours.start === "string" ? activeHours.start : "",
    activeEnd: activeHours && typeof activeHours.end === "string" ? activeHours.end : "",
    activeTimezone:
      activeHours && typeof activeHours.timezone === "string" ? activeHours.timezone : "",
    ackMaxChars:
      typeof heartbeat.ackMaxChars === "number" && Number.isFinite(heartbeat.ackMaxChars)
        ? String(heartbeat.ackMaxChars)
        : "",
    includeReasoning: heartbeat.includeReasoning === true,
  };
}

export default function Settings(): React.ReactElement {
  const [connected, setConnected] = useState(false);
  const [configRaw, setConfigRaw] = useState("{\n}\n");
  const [configBaseHash, setConfigBaseHash] = useState<string | null>(null);
  const [configValid, setConfigValid] = useState<boolean | null>(null);
  const [configIssues, setConfigIssues] = useState<ConfigIssue[]>([]);
  const [schemaRaw, setSchemaRaw] = useState("");
  const [mode, setMode] = useState<"advanced" | "complete">("advanced");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [heartbeatSaving, setHeartbeatSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [heartbeatAgents, setHeartbeatAgents] = useState<HeartbeatAgentStatus[]>([]);
  const [lastHeartbeat, setLastHeartbeat] = useState<LastHeartbeatPayload | null>(null);
  const [userMessages, setUserMessages] = useState<ChatHistoryMessage[]>([]);
  const [heartbeatEvery, setHeartbeatEvery] = useState("");
  const [heartbeatTarget, setHeartbeatTarget] = useState("");
  const [heartbeatSession, setHeartbeatSession] = useState("");
  const [heartbeatModel, setHeartbeatModel] = useState("");
  const [heartbeatPrompt, setHeartbeatPrompt] = useState("");
  const [heartbeatActiveStart, setHeartbeatActiveStart] = useState("");
  const [heartbeatActiveEnd, setHeartbeatActiveEnd] = useState("");
  const [heartbeatActiveTimezone, setHeartbeatActiveTimezone] = useState("");
  const [heartbeatAckMaxChars, setHeartbeatAckMaxChars] = useState("");
  const [heartbeatIncludeReasoning, setHeartbeatIncludeReasoning] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map());
  const reconnectTimerRef = useRef<number | null>(null);
  const connectTimerRef = useRef<number | null>(null);

  const sendRequest = useMemo(() => {
    return function request(method: string, params?: unknown): Promise<unknown> {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error("Gateway websocket is not connected"));
      }

      const id = makeId();
      const frame = { type: "req", id, method, params };

      return new Promise((resolve, reject) => {
        pendingRef.current.set(id, {
          resolve,
          reject: (err) => reject(err),
        });

        try {
          ws.send(JSON.stringify(frame));
        } catch (err) {
          pendingRef.current.delete(id);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    };
  }, []);

  const refreshConfig = useCallback(async () => {
    setLoading(true);
    try {
      const payload = (await sendRequest("config.get", {})) as ConfigGetPayload;
      setConfigRaw(typeof payload?.raw === "string" ? payload.raw : "{\n}\n");
      setConfigBaseHash(typeof payload?.hash === "string" ? payload.hash : null);
      setConfigValid(typeof payload?.valid === "boolean" ? payload.valid : null);
      setConfigIssues(normalizeIssues(payload?.issues));
      const heartbeatState = readHeartbeatFormState(payload?.config);
      setHeartbeatEvery(heartbeatState.every);
      setHeartbeatTarget(heartbeatState.target);
      setHeartbeatSession(heartbeatState.session);
      setHeartbeatModel(heartbeatState.model);
      setHeartbeatPrompt(heartbeatState.prompt);
      setHeartbeatActiveStart(heartbeatState.activeStart);
      setHeartbeatActiveEnd(heartbeatState.activeEnd);
      setHeartbeatActiveTimezone(heartbeatState.activeTimezone);
      setHeartbeatAckMaxChars(heartbeatState.ackMaxChars);
      setHeartbeatIncludeReasoning(heartbeatState.includeReasoning);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [sendRequest]);

  const refreshSchema = useCallback(async () => {
    try {
      const payload = await sendRequest("config.schema", {});
      setSchemaRaw(JSON.stringify(payload ?? {}, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [sendRequest]);

  const refreshRuntime = useCallback(async () => {
    setRuntimeLoading(true);
    try {
      const [statusPayload, lastHeartbeatPayload, historyPayload] = await Promise.all([
        sendRequest("status", {}),
        sendRequest("last-heartbeat", {}).catch(() => null),
        sendRequest("chat.history", { sessionKey: "main", limit: 200 }).catch(() => ({
          messages: [],
        })),
      ]);

      const status = statusPayload as StatusPayload;
      setHeartbeatAgents(normalizeHeartbeatAgents(status?.heartbeat?.agents));
      setLastHeartbeat((lastHeartbeatPayload as LastHeartbeatPayload | null) ?? null);
      const history = historyPayload as { messages?: unknown[] } | null;
      const normalized = normalizeHistoryMessages(history?.messages);
      setUserMessages(normalized.filter((message) => message.role === "user"));
      setRuntimeError(null);
    } catch (err) {
      setRuntimeError(err instanceof Error ? err.message : String(err));
    } finally {
      setRuntimeLoading(false);
    }
  }, [sendRequest]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshConfig(), refreshSchema(), refreshRuntime()]);
  }, [refreshConfig, refreshRuntime, refreshSchema]);

  useEffect(() => {
    let disposed = false;
    let connectInFlight = false;
    let didConnect = false;
    let connectNonce: string | undefined;

    function clearPendingWithError(message: string) {
      for (const pending of pendingRef.current.values()) {
        pending.reject(new Error(message));
      }
      pendingRef.current.clear();
    }

    async function sendConnect() {
      if (disposed || connectInFlight || didConnect) {
        return;
      }
      connectInFlight = true;
      try {
        const auth = resolveGatewayConnectAuth();
        if (!auth) {
          throw new Error(
            "Gateway token missing. Re-open this page once with ?token=ANIMA_GATEWAY_TOKEN.",
          );
        }
        const connectParams = await buildOperatorConnectParams({
          minProtocol: GATEWAY_PROTOCOL_VERSION,
          maxProtocol: GATEWAY_PROTOCOL_VERSION,
          client: {
            id: "webchat-ui",
            version: "1.0.0",
            platform: "web",
            mode: "ui",
          },
          scopes: ["operator.admin"],
          caps: [],
          auth,
          nonce: connectNonce,
        });
        await sendRequest("connect", connectParams);

        if (disposed) {
          return;
        }

        didConnect = true;
        setConnected(true);
        setError(null);
        setStatusMessage("Connected to gateway settings RPC.");
        void refreshAll();
      } catch (err) {
        if (!disposed) {
          setConnected(false);
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        connectInFlight = false;
      }
    }

    function scheduleReconnect() {
      if (disposed || reconnectTimerRef.current !== null) {
        return;
      }
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        if (!disposed) {
          connect();
        }
      }, 1500);
    }

    function connect() {
      connectInFlight = false;
      didConnect = false;
      connectNonce = undefined;
      const ws = new WebSocket(GATEWAY_WS_URL);
      wsRef.current = ws;
      setConnected(false);

      ws.onopen = () => {
        if (connectTimerRef.current) {
          window.clearTimeout(connectTimerRef.current);
        }
        connectTimerRef.current = window.setTimeout(() => {
          connectTimerRef.current = null;
          void sendConnect();
        }, 200);
      };

      ws.onmessage = (event) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(event.data));
        } catch {
          return;
        }

        const frame = parsed as RpcResponseFrame | RpcEventFrame;

        if (frame.type === "res") {
          const pending = pendingRef.current.get(frame.id);
          if (!pending) {
            return;
          }
          pendingRef.current.delete(frame.id);
          if (frame.ok) {
            pending.resolve(frame.payload);
          } else {
            pending.reject(new Error(frame.error?.message || "Gateway request failed"));
          }
          return;
        }

        if (frame.type === "event" && frame.event === "connect.challenge") {
          const nonce = readGatewayChallengeNonce(frame.payload);
          if (nonce) {
            connectNonce = nonce;
          }
          void sendConnect();
        }
      };

      ws.onerror = () => {
        setError("Websocket error while connecting to ANIMA gateway");
      };

      ws.onclose = () => {
        connectInFlight = false;
        didConnect = false;
        setConnected(false);
        clearPendingWithError("Gateway websocket closed");
        scheduleReconnect();
      };
    }

    connect();

    return () => {
      disposed = true;
      if (connectTimerRef.current) {
        window.clearTimeout(connectTimerRef.current);
      }
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      clearPendingWithError("Settings page shutting down");
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [refreshAll, sendRequest]);

  const saveConfig = useCallback(
    async (apply: boolean) => {
      if (!configBaseHash) {
        setError("Missing config base hash. Reload settings first.");
        return;
      }

      if (apply) {
        setApplying(true);
      } else {
        setSaving(true);
      }
      setError(null);
      setStatusMessage(null);

      try {
        await sendRequest(apply ? "config.apply" : "config.set", {
          raw: configRaw,
          baseHash: configBaseHash,
        });
        setStatusMessage(apply ? "Settings saved and apply requested." : "Settings saved.");
        await refreshConfig();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        if (message.toLowerCase().includes("base hash")) {
          await refreshConfig();
        }
      } finally {
        setSaving(false);
        setApplying(false);
      }
    },
    [configBaseHash, configRaw, refreshConfig, sendRequest],
  );

  const saveHeartbeatSettings = useCallback(async () => {
    if (!configBaseHash) {
      setError("Missing config base hash. Reload settings first.");
      return;
    }

    setHeartbeatSaving(true);
    setError(null);
    setStatusMessage(null);

    try {
      const heartbeatPatch: Record<string, unknown> = {
        includeReasoning: heartbeatIncludeReasoning,
      };

      const every = heartbeatEvery.trim();
      const target = heartbeatTarget.trim();
      const session = heartbeatSession.trim();
      const model = heartbeatModel.trim();
      const prompt = heartbeatPrompt.trim();
      const activeStart = heartbeatActiveStart.trim();
      const activeEnd = heartbeatActiveEnd.trim();
      const activeTimezone = heartbeatActiveTimezone.trim();
      const ackMaxCharsRaw = heartbeatAckMaxChars.trim();

      if (every) {
        heartbeatPatch.every = every;
      }
      if (target) {
        heartbeatPatch.target = target;
      }
      if (session) {
        heartbeatPatch.session = session;
      }
      if (model) {
        heartbeatPatch.model = model;
      }
      if (prompt) {
        heartbeatPatch.prompt = prompt;
      }

      if (activeStart || activeEnd || activeTimezone) {
        heartbeatPatch.activeHours = {
          ...(activeStart ? { start: activeStart } : {}),
          ...(activeEnd ? { end: activeEnd } : {}),
          ...(activeTimezone ? { timezone: activeTimezone } : {}),
        };
      }

      if (ackMaxCharsRaw) {
        const ackMaxChars = Number.parseInt(ackMaxCharsRaw, 10);
        if (!Number.isFinite(ackMaxChars) || ackMaxChars < 0) {
          throw new Error("Heartbeat ackMaxChars must be a non-negative integer.");
        }
        heartbeatPatch.ackMaxChars = ackMaxChars;
      }

      const patchPayload = {
        agents: {
          defaults: {
            heartbeat: heartbeatPatch,
          },
        },
      };

      await sendRequest("config.patch", {
        raw: JSON.stringify(patchPayload, null, 2),
        baseHash: configBaseHash,
      });

      setStatusMessage("Heartbeat settings saved. Gateway restart has been requested.");
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setHeartbeatSaving(false);
    }
  }, [
    configBaseHash,
    heartbeatAckMaxChars,
    heartbeatActiveEnd,
    heartbeatActiveStart,
    heartbeatActiveTimezone,
    heartbeatEvery,
    heartbeatIncludeReasoning,
    heartbeatModel,
    heartbeatPrompt,
    heartbeatSession,
    heartbeatTarget,
    refreshAll,
    sendRequest,
  ]);

  return (
    <div>
      <h1 className="page-title">Gateway Settings</h1>

      <div className="tabs" style={{ marginBottom: "16px" }}>
        <div
          className={`tab ${mode === "advanced" ? "active" : ""}`}
          onClick={() => setMode("advanced")}
        >
          Advanced
        </div>
        <div
          className={`tab ${mode === "complete" ? "active" : ""}`}
          onClick={() => setMode("complete")}
        >
          Complete
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ marginBottom: "10px" }}>
          <span className="card-title">Gateway RPC</span>
          <span className={`badge ${connected ? "completed" : "failed"}`}>
            {connected ? "connected" : "disconnected"}
          </span>
        </div>
        <div style={{ fontSize: "13px", color: "var(--color-muted)" }}>
          Live settings are loaded via gateway RPC methods: <span className="mono">config.get</span>
          , <span className="mono">config.set</span>, <span className="mono">config.apply</span>,{" "}
          <span className="mono">config.schema</span>.
        </div>
        <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--color-muted)" }}>
          Valid: {configValid == null ? "unknown" : configValid ? "yes" : "no"} | Hash:{" "}
          <span className="mono">{configBaseHash ?? "<none>"}</span>
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: "var(--color-error)" }}>
          <div style={{ color: "var(--color-error)", fontSize: "13px" }}>{error}</div>
        </div>
      )}

      {statusMessage && (
        <div className="card" style={{ borderColor: "var(--color-success)" }}>
          <div style={{ color: "var(--color-success)", fontSize: "13px" }}>{statusMessage}</div>
        </div>
      )}

      <div className="card">
        <div className="card-header" style={{ marginBottom: "10px" }}>
          <div>
            <div className="card-title">Config Editor</div>
            <div className="card-subtitle">Edit full gateway/agent settings JSON5</div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              className="nav-item"
              style={{ padding: "8px 12px" }}
              onClick={() => void refreshAll()}
              disabled={loading || saving || applying}
            >
              {loading ? "Refreshing..." : "Reload"}
            </button>
            <button
              type="button"
              className="nav-item"
              style={{ padding: "8px 12px", color: "var(--color-accent)" }}
              onClick={() => void saveConfig(false)}
              disabled={!connected || loading || saving || applying}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              className="nav-item"
              style={{ padding: "8px 12px", color: "var(--color-success)" }}
              onClick={() => void saveConfig(true)}
              disabled={!connected || loading || saving || applying}
            >
              {applying ? "Applying..." : "Save + Apply"}
            </button>
          </div>
        </div>

        <textarea
          value={configRaw}
          onChange={(event) => setConfigRaw(event.target.value)}
          spellCheck={false}
          className="search-bar mono"
          style={{ minHeight: "380px", resize: "vertical", lineHeight: 1.5 }}
        />

        <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--color-muted)" }}>
          Tip: <span className="mono">Save + Apply</span> writes settings and schedules gateway
          restart.
        </div>
      </div>

      {configIssues.length > 0 && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: "10px" }}>
            Validation Issues
          </div>
          <div style={{ display: "grid", gap: "6px" }}>
            {configIssues.map((issue, index) => (
              <div
                key={`${issue.path}-${index}`}
                style={{ fontSize: "13px", color: "var(--color-warning)" }}
              >
                <span className="mono">{issue.path || "<root>"}</span>:{" "}
                {issue.message || "Invalid value"}
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === "complete" && (
        <>
          <div className="grid grid-2">
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="card-title" style={{ marginBottom: "10px" }}>
                Schema Snapshot
              </div>
              <pre
                className="mono"
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  maxHeight: "420px",
                  overflow: "auto",
                  color: "var(--color-muted)",
                }}
              >
                {schemaRaw || "Schema not loaded yet."}
              </pre>
            </div>

            <div className="card" style={{ marginBottom: 0 }}>
              <div className="card-title" style={{ marginBottom: "10px" }}>
                CLI Settings Commands
              </div>
              <div
                style={{
                  display: "grid",
                  gap: "8px",
                  fontSize: "13px",
                  color: "var(--color-muted)",
                }}
              >
                <div>
                  <span className="mono">anima settings</span> — advanced complete settings wizard.
                </div>
                <div>
                  <span className="mono">anima settings gateway</span> — gateway-only complete flow.
                </div>
                <div>
                  <span className="mono">anima settings show --view runtime --status</span> — full
                  active settings snapshot.
                </div>
                <div>
                  <span className="mono">anima settings get gateway.port</span> — read by path.
                </div>
                <div>
                  <span className="mono">anima settings set gateway.port 18789 --json</span> — write
                  by path.
                </div>
                <div>
                  <span className="mono">anima settings unset gateway.trustedProxies</span> — remove
                  by path.
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 0, marginTop: "12px" }}>
            <div className="card-title" style={{ marginBottom: "10px" }}>
              Important History
            </div>
            <div
              style={{ display: "grid", gap: "8px", fontSize: "13px", color: "var(--color-muted)" }}
            >
              <div>
                Migration archives are copied to{" "}
                <span className="mono">~/.anima/important-history/</span> with timestamped folders.
              </div>
              <div>
                <span className="mono">anima migrate --preset codex</span> — import from
                codex-coherence protocol.
              </div>
              <div>
                <span className="mono">anima migrate --preset openclaw</span> — import from common
                OpenClaw export locations.
              </div>
              <div>
                <span className="mono">anima migrate --preset claude</span> — import from
                claude-coherence protocol.
              </div>
              <div>
                <span className="mono">anima migrate --source /absolute/path/to/protocol</span> —
                import from a custom folder.
              </div>
              <div>
                <span className="mono">
                  codex exec &quot;cd ~/Desktop/hell/anima && node anima.mjs migrate --preset
                  codex&quot;
                </span>{" "}
                — run migration through Codex directly.
              </div>
            </div>
          </div>

          <div className="grid grid-2" style={{ marginTop: "12px" }}>
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="card-header" style={{ marginBottom: "10px" }}>
                <div>
                  <div className="card-title">Heartbeat Settings</div>
                  <div className="card-subtitle">Edit cadence + delivery defaults quickly</div>
                </div>
                <button
                  type="button"
                  className="nav-item"
                  style={{ padding: "8px 12px", color: "var(--color-success)" }}
                  onClick={() => void saveHeartbeatSettings()}
                  disabled={!connected || loading || saving || applying || heartbeatSaving}
                >
                  {heartbeatSaving ? "Saving..." : "Save Heartbeat"}
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <input
                  className="search-bar mono"
                  placeholder="every (e.g. 5m)"
                  value={heartbeatEvery}
                  onChange={(event) => setHeartbeatEvery(event.target.value)}
                />
                <input
                  className="search-bar mono"
                  placeholder="target (last|none|channel-id)"
                  value={heartbeatTarget}
                  onChange={(event) => setHeartbeatTarget(event.target.value)}
                />
                <input
                  className="search-bar mono"
                  placeholder="session key (e.g. main)"
                  value={heartbeatSession}
                  onChange={(event) => setHeartbeatSession(event.target.value)}
                />
                <input
                  className="search-bar mono"
                  placeholder="model override (provider/model)"
                  value={heartbeatModel}
                  onChange={(event) => setHeartbeatModel(event.target.value)}
                />
                <input
                  className="search-bar mono"
                  placeholder="active start (HH:MM)"
                  value={heartbeatActiveStart}
                  onChange={(event) => setHeartbeatActiveStart(event.target.value)}
                />
                <input
                  className="search-bar mono"
                  placeholder="active end (HH:MM)"
                  value={heartbeatActiveEnd}
                  onChange={(event) => setHeartbeatActiveEnd(event.target.value)}
                />
                <input
                  className="search-bar mono"
                  placeholder="active timezone (user/local/IANA)"
                  value={heartbeatActiveTimezone}
                  onChange={(event) => setHeartbeatActiveTimezone(event.target.value)}
                />
                <input
                  className="search-bar mono"
                  placeholder="ack max chars (number)"
                  value={heartbeatAckMaxChars}
                  onChange={(event) => setHeartbeatAckMaxChars(event.target.value)}
                />
              </div>

              <textarea
                value={heartbeatPrompt}
                onChange={(event) => setHeartbeatPrompt(event.target.value)}
                spellCheck={false}
                className="search-bar mono"
                placeholder="heartbeat prompt override"
                style={{ minHeight: "96px", resize: "vertical", lineHeight: 1.5 }}
              />

              <label
                style={{
                  marginTop: "8px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "13px",
                  color: "var(--color-muted)",
                }}
              >
                <input
                  type="checkbox"
                  checked={heartbeatIncludeReasoning}
                  onChange={(event) => setHeartbeatIncludeReasoning(event.target.checked)}
                />
                Include reasoning payload for heartbeat runs
              </label>
            </div>

            <div className="card" style={{ marginBottom: 0 }}>
              <div className="card-header" style={{ marginBottom: "10px" }}>
                <div>
                  <div className="card-title">Runtime History</div>
                  <div className="card-subtitle">
                    Minimized by default. Open each section for full detail.
                  </div>
                </div>
                <button
                  type="button"
                  className="nav-item"
                  style={{ padding: "8px 12px" }}
                  onClick={() => void refreshRuntime()}
                  disabled={!connected || runtimeLoading}
                >
                  {runtimeLoading ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              {runtimeError && (
                <div
                  style={{ marginBottom: "8px", color: "var(--color-warning)", fontSize: "12px" }}
                >
                  {runtimeError}
                </div>
              )}

              <details>
                <summary style={{ cursor: "pointer", fontSize: "13px", marginBottom: "8px" }}>
                  Heartbeat
                  {lastHeartbeat?.ts
                    ? ` · ${new Date(lastHeartbeat.ts).toLocaleString()}`
                    : " · no events yet"}
                </summary>
                <div
                  style={{
                    display: "grid",
                    gap: "6px",
                    fontSize: "12px",
                    color: "var(--color-muted)",
                    marginTop: "8px",
                  }}
                >
                  <div>Status: {lastHeartbeat?.status || "unknown"}</div>
                  {lastHeartbeat?.preview && (
                    <div>
                      Preview: <span className="mono">{lastHeartbeat.preview}</span>
                    </div>
                  )}
                  {lastHeartbeat?.channel && (
                    <div>
                      Channel: <span className="mono">{lastHeartbeat.channel}</span>
                    </div>
                  )}
                  {lastHeartbeat?.reason && (
                    <div>
                      Reason: <span className="mono">{lastHeartbeat.reason}</span>
                    </div>
                  )}
                  {heartbeatAgents.length === 0 ? (
                    <div>No heartbeat agents reported.</div>
                  ) : (
                    heartbeatAgents.map((agent) => (
                      <div key={agent.agentId}>
                        <span className="mono">{agent.agentId}</span>:{" "}
                        {agent.enabled ? "enabled" : "disabled"} · every {agent.every}
                        {agent.everyMs != null ? ` (${Math.round(agent.everyMs / 1000)}s)` : ""}
                      </div>
                    ))
                  )}
                </div>
              </details>

              <details style={{ marginTop: "10px" }}>
                <summary style={{ cursor: "pointer", fontSize: "13px", marginBottom: "8px" }}>
                  User Messages · {userMessages.length}
                </summary>
                {userMessages.length === 0 ? (
                  <div style={{ fontSize: "12px", color: "var(--color-muted)", marginTop: "8px" }}>
                    No user messages found in session history.
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gap: "8px",
                      maxHeight: "280px",
                      overflow: "auto",
                      marginTop: "8px",
                    }}
                  >
                    {userMessages
                      .slice()
                      .toReversed()
                      .map((message) => (
                        <div
                          key={message.id}
                          style={{
                            border: "1px solid var(--color-border)",
                            borderRadius: "8px",
                            padding: "8px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "11px",
                              color: "var(--color-muted)",
                              marginBottom: "6px",
                            }}
                          >
                            {new Date(message.timestamp).toLocaleString()}
                          </div>
                          <MarkdownText
                            value={message.text}
                            className="settings-message-markdown"
                          />
                        </div>
                      ))}
                  </div>
                )}
              </details>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
