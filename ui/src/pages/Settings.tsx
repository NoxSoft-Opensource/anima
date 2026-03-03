import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const GATEWAY_WS_URL = "ws://localhost:18789/ws";
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
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshConfig(), refreshSchema()]);
  }, [refreshConfig, refreshSchema]);

  useEffect(() => {
    let disposed = false;

    function clearPendingWithError(message: string) {
      for (const pending of pendingRef.current.values()) {
        pending.reject(new Error(message));
      }
      pendingRef.current.clear();
    }

    async function sendConnect() {
      try {
        await sendRequest("connect", {
          minProtocol: GATEWAY_PROTOCOL_VERSION,
          maxProtocol: GATEWAY_PROTOCOL_VERSION,
          client: {
            id: "anima-settings-ui",
            version: "1.0.0",
            platform: "web",
            mode: "settings",
          },
          role: "operator",
          scopes: ["operator.admin"],
          caps: [],
        });

        if (disposed) {
          return;
        }

        setConnected(true);
        setError(null);
        setStatusMessage("Connected to gateway settings RPC.");
        void refreshAll();
      } catch (err) {
        if (!disposed) {
          setConnected(false);
          setError(err instanceof Error ? err.message : String(err));
        }
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
          void sendConnect();
        }
      };

      ws.onerror = () => {
        setError("Websocket error while connecting to ANIMA gateway");
      };

      ws.onclose = () => {
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
              style={{ display: "grid", gap: "8px", fontSize: "13px", color: "var(--color-muted)" }}
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
      )}
    </div>
  );
}
