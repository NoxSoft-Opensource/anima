import { motion } from "framer-motion";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getQueue,
  getStatus,
  getSVRNStatus,
  type DaemonStatus,
  type QueueItem,
  type SVRNStatus,
} from "../api";

const GATEWAY_WS_URL = "ws://localhost:18789/ws";
const CHAT_SESSION_KEY = "main";
const GATEWAY_PROTOCOL_VERSION = 3;

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

type ChatEventPayload = {
  runId?: string;
  sessionKey?: string;
  state?: "delta" | "final" | "error" | "aborted";
  message?: unknown;
  errorMessage?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (typeof record.text === "string") {
      return record.text;
    }

    if (record.type === "text" && typeof record.text === "string") {
      return record.text;
    }

    if (record.message) {
      return extractText(record.message);
    }

    if (record.content) {
      return extractText(record.content);
    }
  }

  return "";
}

function normalizeHistoryMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const messages: ChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const role = record.role;
    if (role !== "user" && role !== "assistant") {
      continue;
    }

    const text = extractText(record.content).trim();
    if (!text) {
      continue;
    }

    const ts = typeof record.timestamp === "number" ? record.timestamp : Date.now();

    messages.push({
      id: makeId(),
      role,
      text,
      timestamp: ts,
    });
  }

  return messages;
}

function HeartbeatPulse({ running, beatCount }: { running: boolean; beatCount: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
      <div style={{ position: "relative", width: "80px", height: "80px" }}>
        <motion.div
          className={running ? "pulse-ring" : ""}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `2px solid ${running ? "var(--color-accent)" : "var(--color-border)"}`,
            opacity: running ? 1 : 0.4,
          }}
        />
        <motion.div
          animate={running ? { scale: [1, 1.2, 1] } : {}}
          transition={running ? { duration: 1, repeat: Infinity } : {}}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            background: running ? "var(--color-accent)" : "var(--color-border)",
            boxShadow: running ? "0 0 20px rgba(255, 102, 0, 0.5)" : "none",
          }}
        />
      </div>
      <div>
        <div style={{ fontSize: "20px", fontWeight: 600, fontFamily: "var(--font-heading)" }}>
          {running ? "Alive" : "Offline"}
        </div>
        <div style={{ fontSize: "13px", color: "var(--color-muted)" }}>Beat #{beatCount}</div>
      </div>
    </div>
  );
}

function BudgetMeter({
  spent,
  remaining,
  limit,
}: {
  spent: number;
  remaining: number;
  limit: number;
}) {
  const ratio = Math.min(spent / Math.max(limit, 1), 1);
  const fillColor =
    ratio < 0.5
      ? "var(--color-success)"
      : ratio < 0.8
        ? "var(--color-warning)"
        : "var(--color-error)";

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Daily Budget</span>
        <span className="card-subtitle">
          ${spent.toFixed(2)} / ${limit.toFixed(0)}
        </span>
      </div>
      <div className="progress-bar">
        <motion.div
          className="progress-fill"
          initial={{ width: 0 }}
          animate={{ width: `${ratio * 100}%` }}
          style={{ background: fillColor }}
        />
      </div>
      <div style={{ marginTop: "8px", fontSize: "13px", color: "var(--color-muted)" }}>
        ${remaining.toFixed(2)} remaining
      </div>
    </div>
  );
}

function QueueDisplay({ items }: { items: QueueItem[] }) {
  if (items.length === 0) {
    return (
      <div className="card">
        <div className="card-title">Request Queue</div>
        <div style={{ padding: "16px 0", color: "var(--color-muted)", fontSize: "13px" }}>
          Queue is empty.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: "12px" }}>
        Request Queue
      </div>
      {items.slice(0, 8).map((item) => (
        <div
          key={item.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "8px 0",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <span className={`badge ${item.status}`}>{item.status}</span>
          <span className="mono" style={{ color: "var(--color-muted)", fontSize: "11px" }}>
            {item.id}
          </span>
          <span
            style={{
              flex: 1,
              fontSize: "13px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.prompt}
          </span>
          <span
            className="badge"
            style={{ background: "var(--color-accent-glow)", color: "var(--color-accent)" }}
          >
            {item.priority}
          </span>
        </div>
      ))}
    </div>
  );
}

function SVRNCard({ svrn }: { svrn: SVRNStatus | null }) {
  if (!svrn) {
    return (
      <div className="card">
        <div className="card-header">
          <span className="card-title">SVRN Node</span>
          <span className="card-subtitle">Loading...</span>
        </div>
      </div>
    );
  }

  const statusColor = svrn.running
    ? svrn.paused
      ? "var(--color-warning)"
      : "var(--color-success)"
    : "var(--color-muted)";

  const statusText = svrn.running
    ? svrn.paused
      ? "Paused"
      : "Active"
    : svrn.enabled
      ? "Stopped"
      : "Disabled";

  return (
    <div className="card">
      <div className="card-header" style={{ marginBottom: "12px" }}>
        <span className="card-title">SVRN Node</span>
        <span
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: statusColor,
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
        >
          {statusText}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "8px",
        }}
      >
        <span
          style={{
            fontSize: "28px",
            fontWeight: 700,
            color: "var(--color-accent)",
            fontFamily: "var(--font-heading)",
          }}
        >
          {svrn.balance.toFixed(3)}
        </span>
        <span style={{ fontSize: "12px", color: "var(--color-muted)" }}>
          UCU (~${svrn.earnings.balanceValueUSD.toFixed(2)})
        </span>
      </div>

      <div style={{ display: "flex", gap: "16px", fontSize: "12px", marginBottom: "12px" }}>
        <span style={{ color: "var(--color-success)" }}>
          Session: +{svrn.sessionEarnings.toFixed(3)} UCU
        </span>
        <span style={{ color: "var(--color-muted)" }}>
          Today: {svrn.earnings.todayEarned.toFixed(3)} UCU ({svrn.earnings.todayTasks} tasks)
        </span>
      </div>

      <div
        style={{
          display: "flex",
          gap: "16px",
          fontSize: "12px",
          marginTop: "12px",
          color: "var(--color-muted)",
        }}
      >
        <span>Completed: {svrn.tasksCompleted}</span>
        <span style={{ color: svrn.tasksFailed > 0 ? "var(--color-error)" : undefined }}>
          Failed: {svrn.tasksFailed}
        </span>
      </div>
    </div>
  );
}

export default function Dashboard(): React.ReactElement {
  const [status, setStatus] = useState<DaemonStatus | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [svrn, setSvrn] = useState<SVRNStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [chatConnected, setChatConnected] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatStream, setChatStream] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map());
  const reconnectTimerRef = useRef<number | null>(null);
  const connectTimerRef = useRef<number | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const chatStreamRef = useRef<string>("");
  const feedBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatStreamRef.current = chatStream;
  }, [chatStream]);

  useEffect(() => {
    let active = true;

    async function fetchData() {
      try {
        const [s, q] = await Promise.all([getStatus(), getQueue()]);
        if (!active) {
          return;
        }
        setStatus(s);
        setQueue(q);
        setError(null);

        try {
          const sv = await getSVRNStatus();
          if (active) {
            setSvrn(sv);
          }
        } catch {
          // SVRN endpoint can be optional
        }
      } catch {
        if (active) {
          setError("Could not connect to ANIMA daemon");
        }
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    feedBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatMessages, chatStream]);

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

  useEffect(() => {
    let disposed = false;

    function clearPendingWithError(message: string) {
      for (const pending of pendingRef.current.values()) {
        pending.reject(new Error(message));
      }
      pendingRef.current.clear();
    }

    async function loadHistory() {
      try {
        const response = await sendRequest("chat.history", {
          sessionKey: CHAT_SESSION_KEY,
          limit: 120,
        });

        if (disposed) {
          return;
        }
        const payload = response as { messages?: unknown[] } | null;
        const normalized = normalizeHistoryMessages(payload?.messages);
        setChatMessages(normalized);
      } catch (err) {
        if (!disposed) {
          setChatError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    async function sendConnect() {
      try {
        await sendRequest("connect", {
          minProtocol: GATEWAY_PROTOCOL_VERSION,
          maxProtocol: GATEWAY_PROTOCOL_VERSION,
          client: {
            id: "anima-control-ui",
            version: "1.0.0",
            platform: "web",
            mode: "webchat",
          },
          role: "operator",
          scopes: ["operator.admin"],
          caps: [],
        });

        if (disposed) {
          return;
        }

        setChatConnected(true);
        setChatError(null);
        void loadHistory();
      } catch (err) {
        if (!disposed) {
          setChatConnected(false);
          setChatError(err instanceof Error ? err.message : String(err));
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

    function handleChatEvent(payload: ChatEventPayload) {
      if (payload.sessionKey && payload.sessionKey !== CHAT_SESSION_KEY) {
        return;
      }

      const state = payload.state;
      if (state === "delta") {
        const delta = extractText(payload.message);
        if (delta) {
          setChatStream(delta);
        }
        return;
      }

      if (state === "final") {
        const currentRunId = activeRunIdRef.current;
        if (payload.runId && currentRunId && payload.runId !== currentRunId) {
          void loadHistory();
          return;
        }

        const finalText = extractText(payload.message).trim() || chatStreamRef.current.trim();
        if (finalText) {
          setChatMessages((prev) => [
            ...prev,
            {
              id: makeId(),
              role: "assistant",
              text: finalText,
              timestamp: Date.now(),
            },
          ]);
        }

        activeRunIdRef.current = null;
        setChatBusy(false);
        setChatStream("");
        return;
      }

      if (state === "error") {
        const msg = payload.errorMessage || "Chat run failed";
        setChatError(msg);
        setChatMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: "assistant",
            text: `Error: ${msg}`,
            timestamp: Date.now(),
          },
        ]);
        activeRunIdRef.current = null;
        setChatBusy(false);
        setChatStream("");
        return;
      }

      if (state === "aborted") {
        activeRunIdRef.current = null;
        setChatBusy(false);
        setChatStream("");
      }
    }

    function connect() {
      const ws = new WebSocket(GATEWAY_WS_URL);
      wsRef.current = ws;
      setChatConnected(false);

      ws.onopen = () => {
        if (connectTimerRef.current) {
          window.clearTimeout(connectTimerRef.current);
        }
        connectTimerRef.current = window.setTimeout(() => {
          connectTimerRef.current = null;
          void sendConnect();
        }, 300);
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

        if (frame.type === "event") {
          if (frame.event === "connect.challenge") {
            void sendConnect();
            return;
          }
          if (frame.event === "chat") {
            handleChatEvent((frame.payload || {}) as ChatEventPayload);
          }
        }
      };

      ws.onerror = () => {
        setChatError("Websocket error while connecting to ANIMA gateway");
      };

      ws.onclose = () => {
        setChatConnected(false);
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
      clearPendingWithError("Dashboard shutting down");
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [sendRequest]);

  async function onSendMessage(e: React.FormEvent) {
    e.preventDefault();
    const message = chatInput.trim();
    if (!message || chatBusy) {
      return;
    }

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setChatError("Gateway websocket is not connected");
      return;
    }

    const runId = makeId();
    activeRunIdRef.current = runId;

    setChatMessages((prev) => [
      ...prev,
      {
        id: makeId(),
        role: "user",
        text: message,
        timestamp: Date.now(),
      },
    ]);
    setChatInput("");
    setChatBusy(true);
    setChatStream("");
    setChatError(null);

    try {
      await sendRequest("chat.send", {
        sessionKey: CHAT_SESSION_KEY,
        message,
        deliver: false,
        idempotencyKey: runId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setChatError(msg);
      setChatBusy(false);
      setChatStream("");
      activeRunIdRef.current = null;
    }
  }

  if (error) {
    return (
      <div>
        <h1 className="page-title">Axiom Home</h1>
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px", opacity: 0.3 }}>~</div>
          <div style={{ color: "var(--color-muted)", fontSize: "15px" }}>{error}</div>
          <div style={{ color: "var(--color-muted)", fontSize: "13px", marginTop: "8px" }}>
            Start the daemon with: <span className="mono">anima start</span>
          </div>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div>
        <h1 className="page-title">Axiom Home</h1>
        <div
          className="card"
          style={{ textAlign: "center", padding: "40px", color: "var(--color-muted)" }}
        >
          Connecting...
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Axiom Home</h1>

      <div className="home-grid">
        <div className="card live-chat-card">
          <div className="card-header" style={{ marginBottom: "8px" }}>
            <div>
              <div className="card-title">Talk to Axiom</div>
              <div className="card-subtitle">ANIMA direct gateway chat</div>
            </div>
            <span className={`status-chip ${chatConnected ? "online" : "offline"}`}>
              {chatConnected ? "Connected" : "Reconnecting"}
            </span>
          </div>

          <div className="live-chat-feed">
            {chatMessages.length === 0 && !chatStream && (
              <div style={{ color: "var(--color-muted)", fontSize: "13px" }}>
                Conversation history is empty. Send a message to start.
              </div>
            )}

            {chatMessages.map((message) => (
              <div
                key={message.id}
                className={`live-chat-row ${message.role === "user" ? "user" : "assistant"}`}
              >
                <div className={`live-chat-bubble ${message.role}`}>
                  <div className="live-chat-role">{message.role === "user" ? "You" : "Axiom"}</div>
                  <div>{message.text}</div>
                </div>
              </div>
            ))}

            {chatStream && (
              <div className="live-chat-row assistant">
                <div className="live-chat-bubble assistant">
                  <div className="live-chat-role">Axiom</div>
                  <div>{chatStream}</div>
                </div>
              </div>
            )}

            <div ref={feedBottomRef} />
          </div>

          {chatError && (
            <div style={{ marginTop: "8px", color: "var(--color-error)", fontSize: "12px" }}>
              {chatError}
            </div>
          )}

          <form onSubmit={onSendMessage} className="live-chat-input-row">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Message Axiom directly..."
              className="live-chat-input"
              rows={3}
            />
            <button
              type="submit"
              className="live-chat-send"
              disabled={chatBusy || !chatInput.trim()}
            >
              {chatBusy ? "Sending..." : "Send"}
            </button>
          </form>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="card">
            <HeartbeatPulse
              running={status.heartbeat.running}
              beatCount={status.heartbeat.beatCount}
            />
            <div style={{ marginTop: "16px", fontSize: "12px", color: "var(--color-muted)" }}>
              {status.heartbeat.lastBeat
                ? `Last beat: ${new Date(status.heartbeat.lastBeat).toLocaleTimeString()}`
                : "No beats yet"}
              {status.heartbeat.nextBeat && (
                <span> | Next: {new Date(status.heartbeat.nextBeat).toLocaleTimeString()}</span>
              )}
            </div>
            <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--color-accent)" }}>
              Heartbeat reminder: check chat.noxsoft.net and reply each cycle.
            </div>
          </div>

          <BudgetMeter
            spent={status.budget.spent}
            remaining={status.budget.remaining}
            limit={status.budget.limit}
          />

          <div className="grid grid-4" style={{ marginBottom: "0px" }}>
            <div className="card" style={{ textAlign: "center", marginBottom: 0 }}>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "var(--color-accent)",
                  fontFamily: "var(--font-heading)",
                }}
              >
                {status.queue.queued}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--color-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                }}
              >
                Queued
              </div>
            </div>
            <div className="card" style={{ textAlign: "center", marginBottom: 0 }}>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "var(--color-success)",
                  fontFamily: "var(--font-heading)",
                }}
              >
                {status.queue.running}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--color-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                }}
              >
                Running
              </div>
            </div>
            <div className="card" style={{ textAlign: "center", marginBottom: 0 }}>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "var(--color-text)",
                  fontFamily: "var(--font-heading)",
                }}
              >
                {status.queue.completed}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--color-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                }}
              >
                Done
              </div>
            </div>
            <div className="card" style={{ textAlign: "center", marginBottom: 0 }}>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: status.queue.failed > 0 ? "var(--color-error)" : "var(--color-muted)",
                  fontFamily: "var(--font-heading)",
                }}
              >
                {status.queue.failed}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--color-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                }}
              >
                Failed
              </div>
            </div>
          </div>

          <QueueDisplay items={queue} />
          <SVRNCard svrn={svrn} />
        </div>
      </div>
    </div>
  );
}
