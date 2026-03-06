import React, { useCallback, useEffect, useRef, useState } from "react";
import { buildOperatorConnectParams, readGatewayChallengeNonce } from "../gateway-connect";
import { resolveGatewayConnectAuth, resolveGatewayWsUrl } from "../gateway-connection";

const GATEWAY_WS_URL = resolveGatewayWsUrl();
const GATEWAY_PROTOCOL_VERSION = 3;

type MCPServer = {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  status: "healthy" | "unhealthy" | "unknown";
  lastHealthCheck?: string;
  consecutiveFailures: number;
};

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

function makeId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── Add/Edit form ────────────────────────────────────────────────────────────
function ServerForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: MCPServer;
  onSubmit: (server: {
    name: string;
    command: string;
    args: string[];
    env: Record<string, string>;
  }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [command, setCommand] = useState(initial?.command ?? "");
  const [args, setArgs] = useState(initial?.args?.join(" ") ?? "");
  const [envText, setEnvText] = useState(
    initial?.env
      ? Object.entries(initial.env)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n")
      : "",
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const envMap: Record<string, string> = {};
    for (const line of envText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes("=")) {
        continue;
      }
      const eqIdx = trimmed.indexOf("=");
      envMap[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
    }
    onSubmit({
      name: name.trim(),
      command: command.trim(),
      args: args.trim() ? args.trim().split(/\s+/) : [],
      env: envMap,
    });
  };

  return (
    <form className="mcp-form" onSubmit={handleSubmit}>
      <div className="mcp-form-row">
        <label className="mcp-form-label">Name</label>
        <input
          className="mcp-form-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. noxsoft"
          required
          disabled={!!initial}
        />
      </div>
      <div className="mcp-form-row">
        <label className="mcp-form-label">Command</label>
        <input
          className="mcp-form-input"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="e.g. npx"
          required
        />
      </div>
      <div className="mcp-form-row">
        <label className="mcp-form-label">Arguments</label>
        <input
          className="mcp-form-input"
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          placeholder="e.g. @noxsoft/mcp"
        />
      </div>
      <div className="mcp-form-row">
        <label className="mcp-form-label">Environment</label>
        <textarea
          className="mcp-form-textarea"
          value={envText}
          onChange={(e) => setEnvText(e.target.value)}
          placeholder={"KEY=value\nANOTHER=value"}
          rows={3}
        />
      </div>
      <div className="mcp-form-actions">
        <button type="submit" className="action-button">
          {initial ? "Update" : "Add Server"}
        </button>
        <button type="button" className="action-button ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Server card ──────────────────────────────────────────────────────────────
function ServerCard({
  server,
  onEdit,
  onRemove,
}: {
  server: MCPServer;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const statusColor =
    server.status === "healthy"
      ? "var(--color-success)"
      : server.status === "unhealthy"
        ? "var(--color-error, #ef4444)"
        : "var(--color-warning)";

  return (
    <div className="card mcp-server-card">
      <div
        className="card-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span className="mcp-status-dot" style={{ background: statusColor }} />
          <div>
            <div className="card-title">{server.name}</div>
            <div className="card-subtitle mono" style={{ fontSize: "11px" }}>
              {server.command} {server.args.join(" ")}
            </div>
          </div>
        </div>
        <span className="mcp-status-badge" style={{ color: statusColor, borderColor: statusColor }}>
          {server.status}
        </span>
      </div>

      <div className="mcp-server-meta">
        {server.lastHealthCheck && (
          <div className="mcp-meta-row">
            <span className="mcp-meta-label">Last check</span>
            <span>{new Date(server.lastHealthCheck).toLocaleString()}</span>
          </div>
        )}
        {server.consecutiveFailures > 0 && (
          <div className="mcp-meta-row">
            <span className="mcp-meta-label">Failures</span>
            <span style={{ color: "var(--color-error, #ef4444)" }}>
              {server.consecutiveFailures}
            </span>
          </div>
        )}
        {Object.keys(server.env || {}).length > 0 && (
          <div className="mcp-meta-row">
            <span className="mcp-meta-label">Env</span>
            <span className="mono" style={{ fontSize: "10px" }}>
              {Object.keys(server.env).join(", ")}
            </span>
          </div>
        )}
      </div>

      <div className="mcp-card-actions">
        <button type="button" className="action-button ghost small" onClick={onEdit}>
          Edit
        </button>
        {confirmRemove ? (
          <>
            <button
              type="button"
              className="action-button small"
              style={{ background: "var(--color-error, #ef4444)" }}
              onClick={onRemove}
            >
              Confirm Remove
            </button>
            <button
              type="button"
              className="action-button ghost small"
              onClick={() => setConfirmRemove(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="action-button ghost small"
            onClick={() => setConfirmRemove(true)}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main MCP page ────────────────────────────────────────────────────────────
export default function MCP(): React.ReactElement {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editServer, setEditServer] = useState<MCPServer | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map());

  const sendRequest = useCallback(async (method: string, params?: unknown): Promise<unknown> => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected");
    }
    const id = makeId();
    return new Promise((resolve, reject) => {
      pendingRef.current.set(id, { resolve, reject });
      ws.send(JSON.stringify({ type: "req", id, method, params: params ?? {} }));
      setTimeout(() => {
        if (pendingRef.current.has(id)) {
          pendingRef.current.delete(id);
          reject(new Error("Request timed out"));
        }
      }, 15000);
    });
  }, []);

  const loadServers = useCallback(async () => {
    try {
      const res = (await sendRequest("mcp.list")) as { servers?: MCPServer[] };
      setServers(res?.servers ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [sendRequest]);

  useEffect(() => {
    let disposed = false;
    let connectNonce: string | undefined;

    async function sendConnect() {
      try {
        const auth = resolveGatewayConnectAuth();
        if (!auth) {
          return;
        }
        const connectParams = await buildOperatorConnectParams({
          minProtocol: GATEWAY_PROTOCOL_VERSION,
          maxProtocol: GATEWAY_PROTOCOL_VERSION,
          client: {
            id: "anima-control-ui",
            version: "1.0.0",
            platform: "web",
            mode: "webchat",
          },
          scopes: ["operator.read", "operator.admin"],
          caps: [],
          auth,
          nonce: connectNonce,
        });
        const id = makeId();
        wsRef.current?.send(
          JSON.stringify({ type: "req", id, method: "connect", params: connectParams }),
        );
        pendingRef.current.set(id, {
          resolve: () => {
            setConnected(true);
          },
          reject: () => {},
        });
      } catch {}
    }

    const ws = new WebSocket(GATEWAY_WS_URL);
    wsRef.current = ws;

    ws.addEventListener("open", () => {});

    ws.addEventListener("message", (event) => {
      let frame: RpcResponseFrame & { type: string; event?: string; payload?: unknown };
      try {
        frame = JSON.parse(String(event.data));
      } catch {
        return;
      }

      if (frame.type === "event" && frame.event === "connect.challenge") {
        const nonce = readGatewayChallengeNonce(frame.payload);
        if (nonce) {
          connectNonce = nonce;
        }
        void sendConnect();
        return;
      }

      if (frame.type === "res") {
        const pending = pendingRef.current.get(frame.id);
        if (pending) {
          pendingRef.current.delete(frame.id);
          if (frame.ok) {
            pending.resolve(frame.payload);
          } else {
            pending.reject(new Error(frame.error?.message || "Request failed"));
          }
        }
      }
    });

    ws.addEventListener("close", () => {
      if (!disposed) {
        setConnected(false);
      }
    });

    return () => {
      disposed = true;
      ws.close();
    };
  }, []);

  // Load servers once connected
  useEffect(() => {
    if (connected) {
      void loadServers();
    }
  }, [connected, loadServers]);

  const handleAdd = async (server: {
    name: string;
    command: string;
    args: string[];
    env: Record<string, string>;
  }) => {
    try {
      const res = (await sendRequest("mcp.add", server)) as { servers?: MCPServer[] };
      setServers(res?.servers ?? []);
      setShowAdd(false);
      setSyncStatus("Server added and synced to ~/.claude/mcp.json");
      setTimeout(() => setSyncStatus(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleEdit = async (server: {
    name: string;
    command: string;
    args: string[];
    env: Record<string, string>;
  }) => {
    try {
      const res = (await sendRequest("mcp.add", server)) as { servers?: MCPServer[] };
      setServers(res?.servers ?? []);
      setEditServer(null);
      setSyncStatus("Server updated and synced");
      setTimeout(() => setSyncStatus(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRemove = async (name: string) => {
    try {
      const res = (await sendRequest("mcp.remove", { name })) as { servers?: MCPServer[] };
      setServers(res?.servers ?? []);
      setSyncStatus(`Removed ${name} and synced`);
      setTimeout(() => setSyncStatus(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSync = async () => {
    try {
      const res = (await sendRequest("mcp.sync")) as {
        added: string[];
        updated: string[];
        removed: string[];
      };
      const parts: string[] = [];
      if (res.added?.length) {
        parts.push(`added ${res.added.join(", ")}`);
      }
      if (res.updated?.length) {
        parts.push(`updated ${res.updated.join(", ")}`);
      }
      if (res.removed?.length) {
        parts.push(`removed ${res.removed.join(", ")}`);
      }
      setSyncStatus(parts.length ? `Synced: ${parts.join("; ")}` : "Already in sync");
      setTimeout(() => setSyncStatus(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const healthy = servers.filter((s) => s.status === "healthy").length;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          MCP Servers
        </h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span className={`status-chip ${connected ? "online" : "offline"}`}>
            {connected ? "Connected" : "Connecting"}
          </span>
        </div>
      </div>

      {error && (
        <div
          className="card"
          style={{ borderColor: "var(--color-error, #ef4444)", marginBottom: "16px" }}
        >
          <div style={{ color: "var(--color-error, #ef4444)", fontSize: "13px" }}>{error}</div>
          <button
            type="button"
            className="action-button ghost small"
            style={{ marginTop: "8px" }}
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {syncStatus && (
        <div
          className="mcp-sync-toast"
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-success)",
            borderRadius: "var(--radius-md)",
            padding: "8px 14px",
            fontSize: "12px",
            color: "var(--color-success)",
            marginBottom: "16px",
          }}
        >
          {syncStatus}
        </div>
      )}

      {servers.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <div style={{ fontSize: "13px", color: "var(--color-muted)" }}>
            <span
              style={{
                color: healthy === servers.length ? "var(--color-success)" : "var(--color-warning)",
                fontWeight: 600,
              }}
            >
              {healthy}/{servers.length}
            </span>{" "}
            servers healthy
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="action-button ghost small" onClick={handleSync}>
              Sync to Claude
            </button>
            <button type="button" className="action-button small" onClick={() => setShowAdd(true)}>
              + Add Server
            </button>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="card" style={{ marginBottom: "16px" }}>
          <div className="card-title" style={{ marginBottom: "12px" }}>
            Add MCP Server
          </div>
          <ServerForm onSubmit={handleAdd} onCancel={() => setShowAdd(false)} />
        </div>
      )}

      {editServer && (
        <div className="card" style={{ marginBottom: "16px" }}>
          <div className="card-title" style={{ marginBottom: "12px" }}>
            Edit {editServer.name}
          </div>
          <ServerForm
            initial={editServer}
            onSubmit={handleEdit}
            onCancel={() => setEditServer(null)}
          />
        </div>
      )}

      {servers.length === 0 && connected ? (
        <div className="card" style={{ padding: "40px", textAlign: "center" }}>
          <div style={{ color: "var(--color-muted)", marginBottom: "16px" }}>
            No MCP servers registered yet.
          </div>
          <button type="button" className="action-button" onClick={() => setShowAdd(true)}>
            + Add Your First Server
          </button>
        </div>
      ) : (
        <div className="grid grid-2">
          {servers.map((server) => (
            <ServerCard
              key={server.name}
              server={server}
              onEdit={() => setEditServer(server)}
              onRemove={() => handleRemove(server.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
