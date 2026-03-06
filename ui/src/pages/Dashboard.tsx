import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getConfigSnapshot,
  getRegistrationStatus,
  getRuntimeInspect,
  getStatus,
  patchConfigValue,
  patchMissionState,
  setHeartbeatsEnabled,
  setWorkingMode,
  tailLogs,
  wakeHeartbeat,
  type ConfigSnapshot,
  type DaemonStatus,
  type LogsTailResponse,
  type RegistrationStatus,
  type RuntimeInspectResponse,
  type WorkingMode,
  type SubagentStatus,
} from "../api";
import MarkdownText from "../components/MarkdownText";
import { buildOperatorConnectParams, readGatewayChallengeNonce } from "../gateway-connect";
import { resolveGatewayConnectAuth, resolveGatewayWsUrl } from "../gateway-connection";
import {
  buildHeartbeatPatch,
  readHeartbeatFormState,
  type HeartbeatFormState,
} from "../lib/heartbeat";

const GATEWAY_WS_URL = resolveGatewayWsUrl();
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

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  addEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => void;
  removeEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ) => void;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionResultEventLike = Event & {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type SpeechRecognitionErrorEventLike = Event & {
  error?: string;
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
    if ("message" in record) {
      return extractText(record.message);
    }
    if ("content" in record) {
      return extractText(record.content);
    }
  }
  return "";
}

function mergeStreamText(current: string, incoming: string): string {
  const next = incoming.replace(/\r/g, "");
  if (!next) {
    return current;
  }
  if (!current || next === current) {
    return next;
  }
  if (next.startsWith(current) || next.includes(current)) {
    return next;
  }
  const maxOverlap = Math.min(current.length, next.length);
  for (let i = maxOverlap; i > 0; i -= 1) {
    if (current.slice(-i) === next.slice(0, i)) {
      return `${current}${next.slice(i)}`;
    }
  }
  return `${current}${next}`;
}

function normalizeHistoryMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      if (record.role !== "user" && record.role !== "assistant") {
        return null;
      }
      const text = extractText(record.content).trim();
      if (!text) {
        return null;
      }
      return {
        id: makeId(),
        role: record.role,
        text,
        timestamp: typeof record.timestamp === "number" ? record.timestamp : Date.now(),
      } satisfies ChatMessage;
    })
    .filter((row): row is ChatMessage => Boolean(row));
}

function formatRelativeTime(value: number | string | null | undefined): string {
  if (!value) {
    return "never";
  }
  const ts = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(ts)) {
    return "unknown";
  }
  const deltaMs = Date.now() - ts;
  const deltaMinutes = Math.round(deltaMs / 60_000);
  if (Math.abs(deltaMinutes) < 1) {
    return "just now";
  }
  if (Math.abs(deltaMinutes) < 60) {
    return `${deltaMinutes}m ago`;
  }
  const hours = Math.round(deltaMinutes / 60);
  if (Math.abs(hours) < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatSubagentLabel(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) {
    return "subagent";
  }
  const marker = ":subagent:";
  const markerIndex = trimmed.lastIndexOf(marker);
  if (markerIndex >= 0) {
    return `subagent:${trimmed.slice(markerIndex + marker.length)}`;
  }
  return trimmed.length > 56 ? `${trimmed.slice(0, 53)}...` : trimmed;
}

function StatusPill(props: { tone?: "accent" | "success" | "warning" | "error"; label: string }) {
  const tone = props.tone ?? "accent";
  return <span className={`badge badge-${tone}`}>{props.label}</span>;
}

function RuntimeStat(props: { label: string; value: string; detail?: string }) {
  return (
    <div className="runtime-stat">
      <div className="runtime-stat-label">{props.label}</div>
      <div className="runtime-stat-value">{props.value}</div>
      {props.detail ? <div className="runtime-stat-detail">{props.detail}</div> : null}
    </div>
  );
}

function WorkingModeToggle(props: {
  value: WorkingMode;
  busy: boolean;
  onChange: (mode: WorkingMode) => void;
}) {
  return (
    <div className="segmented-control">
      {(["read", "write"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          className={`segment ${props.value === mode ? "active" : ""}`}
          disabled={props.busy}
          onClick={() => props.onChange(mode)}
        >
          {mode.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function SubagentStatusCard({ subagents }: { subagents: SubagentStatus | undefined }) {
  if (!subagents) {
    return null;
  }
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Subagents</div>
          <div className="card-subtitle">Native orchestration visibility</div>
        </div>
        <StatusPill label={`${subagents.total} tracked`} />
      </div>
      <div className="stats-grid compact">
        <RuntimeStat label="Active" value={String(subagents.active)} />
        <RuntimeStat label="Recent" value={String(subagents.recent)} />
        <RuntimeStat label="Failed" value={String(subagents.failed)} />
      </div>
      {subagents.latest.length === 0 ? (
        <div className="empty-note">No subagent activity yet.</div>
      ) : (
        <div className="activity-list">
          {subagents.latest.map((entry) => (
            <div key={`${entry.key}:${entry.updatedAt ?? "none"}`} className="activity-row">
              <div>
                <div className="mono subtle">{formatSubagentLabel(entry.key)}</div>
                <div className="runtime-stat-detail">{formatRelativeTime(entry.updatedAt)}</div>
              </div>
              <StatusPill
                tone={
                  entry.status === "failed"
                    ? "error"
                    : entry.status === "active"
                      ? "success"
                      : entry.status === "recent"
                        ? "accent"
                        : "warning"
                }
                label={entry.status}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dashboard(): React.ReactElement {
  const [status, setStatus] = useState<DaemonStatus | null>(null);
  const [runtime, setRuntime] = useState<RuntimeInspectResponse | null>(null);
  const [registration, setRegistration] = useState<RegistrationStatus | null>(null);
  const [configSnapshot, setConfigSnapshot] = useState<ConfigSnapshot | null>(null);
  const [heartbeatForm, setHeartbeatForm] = useState<HeartbeatFormState>(() =>
    readHeartbeatFormState(null),
  );
  const [logsState, setLogsState] = useState<LogsTailResponse | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);
  const [heartbeatSaving, setHeartbeatSaving] = useState(false);
  const [heartbeatToggleSaving, setHeartbeatToggleSaving] = useState(false);
  const [wakeText, setWakeText] = useState(
    "Check chat.noxsoft.net, sync mission control, and report anything needing action.",
  );

  const [chatConnected, setChatConnected] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatStream, setChatStream] = useState("");

  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechListening, setSpeechListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [voiceNames, setVoiceNames] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map());
  const reconnectTimerRef = useRef<number | null>(null);
  const connectTimerRef = useRef<number | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const chatStreamRef = useRef<string>("");
  const feedBottomRef = useRef<HTMLDivElement | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const spokenMessageIdsRef = useRef<Set<string>>(new Set());

  const assistantName =
    runtime?.assistant?.name?.trim() || registration?.agent?.display_name || "ANIMA";
  const workingMode = runtime?.mission?.state?.workingMode ?? "write";
  const repoStatus = runtime?.mission?.repo ?? runtime?.mission?.state?.repo;
  const speechState = runtime?.mission?.state?.speech;

  const refreshDashboard = useCallback(async () => {
    setRefreshing(true);
    try {
      const [nextStatus, nextRuntime, nextRegistration, nextConfig, nextLogs] = await Promise.all([
        getStatus(),
        getRuntimeInspect(),
        getRegistrationStatus(),
        getConfigSnapshot(),
        tailLogs().catch(() => null),
      ]);
      setStatus(nextStatus);
      setRuntime(nextRuntime);
      setRegistration(nextRegistration);
      setConfigSnapshot(nextConfig);
      setHeartbeatForm(readHeartbeatFormState(nextConfig));
      if (nextLogs) {
        setLogsState(nextLogs);
      }
      setDashboardError(null);
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : String(error));
    } finally {
      setRefreshing(false);
      setInitialLoadDone(true);
    }
  }, []);

  const logsCursorRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    logsCursorRef.current = logsState?.cursor;
  }, [logsState?.cursor]);

  const refreshLogs = useCallback(async () => {
    try {
      const next = await tailLogs(logsCursorRef.current);
      setLogsState((current) => {
        if (!current || next.reset) {
          return next;
        }
        return {
          ...next,
          lines: [...current.lines, ...next.lines].slice(-320),
        };
      });
    } catch {
      // Keep the dashboard usable even when logs are unavailable.
    }
  }, []);

  useEffect(() => {
    void refreshDashboard();
    const interval = window.setInterval(() => {
      void refreshDashboard();
    }, 15_000);
    const logInterval = window.setInterval(() => {
      void refreshLogs();
    }, 4_000);
    return () => {
      window.clearInterval(interval);
      window.clearInterval(logInterval);
    };
  }, [refreshDashboard, refreshLogs]);

  useEffect(() => {
    chatStreamRef.current = chatStream;
  }, [chatStream]);

  useEffect(() => {
    feedBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatMessages, chatStream]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const synth = window.speechSynthesis;
    if (!synth) {
      return;
    }
    const updateVoices = () => {
      const names = synth
        .getVoices()
        .map((voice) => voice.name)
        .filter(Boolean);
      setVoiceNames(names);
    };
    updateVoices();
    synth.addEventListener?.("voiceschanged", updateVoices);
    return () => synth.removeEventListener?.("voiceschanged", updateVoices);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const ctor =
      (window as Window & { SpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ||
      (window as Window & { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .webkitSpeechRecognition;
    if (!ctor) {
      setSpeechSupported(false);
      speechRecognitionRef.current = null;
      return;
    }

    setSpeechSupported(true);
    const recognition = new ctor();
    recognition.continuous = speechState?.continuous ?? true;
    recognition.interimResults = true;
    recognition.lang = speechState?.lang || "en-US";
    const handleResult = (rawEvent: Event) => {
      const event = rawEvent as SpeechRecognitionResultEventLike;
      let transcript = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const alt = result?.[0];
        if (alt?.transcript) {
          transcript += alt.transcript;
        }
      }
      if (transcript.trim()) {
        setChatInput(transcript.trim());
      }
    };
    const handleError = (rawEvent: Event) => {
      const event = rawEvent as SpeechRecognitionErrorEventLike;
      setSpeechError(event.error || "Voice capture failed.");
      setSpeechListening(false);
    };
    const handleEnd = () => {
      setSpeechListening(false);
    };
    recognition.addEventListener("result", handleResult);
    recognition.addEventListener("error", handleError);
    recognition.addEventListener("end", handleEnd);
    speechRecognitionRef.current = recognition;

    return () => {
      recognition.removeEventListener("result", handleResult);
      recognition.removeEventListener("error", handleError);
      recognition.removeEventListener("end", handleEnd);
      recognition.stop();
      speechRecognitionRef.current = null;
    };
  }, [speechState?.continuous, speechState?.lang]);

  useEffect(() => {
    if (!speechState?.autoSpeak || typeof window === "undefined" || !window.speechSynthesis) {
      return;
    }
    const latest = chatMessages.toReversed().find((message) => message.role === "assistant");
    if (!latest || spokenMessageIdsRef.current.has(latest.id)) {
      return;
    }
    const utterance = new SpeechSynthesisUtterance(latest.text);
    utterance.lang = speechState.lang || "en-US";
    utterance.rate = speechState.rate || 1;
    utterance.pitch = speechState.pitch || 1;
    if (speechState.voiceName) {
      const voice = window.speechSynthesis
        .getVoices()
        .find((candidate) => candidate.name === speechState.voiceName);
      if (voice) {
        utterance.voice = voice;
      }
    }
    spokenMessageIdsRef.current.add(latest.id);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [chatMessages, speechState]);

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
          reject: (error) => reject(error),
        });

        try {
          ws.send(JSON.stringify(frame));
        } catch (error) {
          pendingRef.current.delete(id);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    };
  }, []);

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
        setChatMessages(normalizeHistoryMessages(payload?.messages));
      } catch (error) {
        if (!disposed) {
          setChatError(error instanceof Error ? error.message : String(error));
        }
      }
    }

    async function sendConnect() {
      if (disposed || connectInFlight || didConnect) {
        return;
      }
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        // WebSocket closed before we could send connect — the close handler
        // will schedule a reconnect, so silently bail out.
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
            id: "anima-dashboard",
            version: "1.0.0",
            platform: "web",
            mode: "webchat",
          },
          scopes: ["operator.read", "operator.admin"],
          caps: [],
          auth,
          nonce: connectNonce,
        });
        await sendRequest("connect", connectParams);
        if (disposed) {
          return;
        }
        didConnect = true;
        setChatConnected(true);
        setChatError(null);
        void loadHistory();
      } catch (error) {
        if (!disposed) {
          setChatConnected(false);
          const msg = error instanceof Error ? error.message : String(error);
          // Don't surface transient websocket disconnects as errors — the
          // reconnect loop will handle it.
          if (msg !== "Gateway websocket is not connected") {
            setChatError(msg);
          }
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

    function handleChatEvent(payload: ChatEventPayload) {
      if (payload.sessionKey && payload.sessionKey !== CHAT_SESSION_KEY) {
        return;
      }

      if (payload.state === "delta") {
        const delta = extractText(payload.message);
        if (delta) {
          setChatStream((prev) => mergeStreamText(prev, delta));
        }
        return;
      }

      if (payload.state === "final") {
        const currentRunId = activeRunIdRef.current;
        if (payload.runId && currentRunId && payload.runId !== currentRunId) {
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

      if (payload.state === "error") {
        const message = payload.errorMessage || "Chat run failed";
        setChatError(message);
        setChatMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: "assistant",
            text: `Error: ${message}`,
            timestamp: Date.now(),
          },
        ]);
        activeRunIdRef.current = null;
        setChatBusy(false);
        setChatStream("");
        return;
      }

      if (payload.state === "aborted") {
        activeRunIdRef.current = null;
        setChatBusy(false);
        setChatStream("");
      }
    }

    function connect() {
      connectInFlight = false;
      didConnect = false;
      connectNonce = undefined;
      const ws = new WebSocket(GATEWAY_WS_URL);
      wsRef.current = ws;
      setChatConnected(false);

      ws.addEventListener("open", () => {
        if (connectTimerRef.current) {
          window.clearTimeout(connectTimerRef.current);
        }
        connectTimerRef.current = window.setTimeout(() => {
          connectTimerRef.current = null;
          void sendConnect();
        }, 300);
      });

      ws.addEventListener("message", (event) => {
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
            const nonce = readGatewayChallengeNonce(frame.payload);
            if (nonce) {
              connectNonce = nonce;
            }
            void sendConnect();
            return;
          }
          if (frame.event === "chat") {
            handleChatEvent((frame.payload || {}) as ChatEventPayload);
          }
        }
      });

      ws.addEventListener("error", () => {
        setChatError("Websocket error while connecting to ANIMA gateway");
      });

      ws.addEventListener("close", () => {
        connectInFlight = false;
        didConnect = false;
        setChatConnected(false);
        clearPendingWithError("Gateway websocket closed");
        scheduleReconnect();
      });
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

  const updateSpeechState = useCallback(
    async (patch: Partial<NonNullable<RuntimeInspectResponse["mission"]["state"]["speech"]>>) => {
      try {
        const nextState = await patchMissionState({ speech: patch });
        if (runtime) {
          setRuntime({
            ...runtime,
            mission: {
              ...runtime.mission,
              state: {
                ...runtime.mission.state,
                speech: nextState.speech,
              },
            },
          });
        }
      } catch (error) {
        setActionMessage(error instanceof Error ? error.message : String(error));
      }
    },
    [runtime],
  );

  async function onSendMessage(event: React.FormEvent) {
    event.preventDefault();
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
    } catch (error) {
      setChatError(error instanceof Error ? error.message : String(error));
      setChatBusy(false);
      setChatStream("");
      activeRunIdRef.current = null;
    }
  }

  async function applyWorkingMode(mode: WorkingMode) {
    setModeSaving(true);
    setActionMessage(null);
    try {
      await setWorkingMode(mode);
      await refreshDashboard();
      setActionMessage(`Working mode set to ${mode}.`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setModeSaving(false);
    }
  }

  async function saveHeartbeatSettings() {
    if (!configSnapshot?.hash) {
      setActionMessage("Config hash missing. Refresh the dashboard and try again.");
      return;
    }
    setHeartbeatSaving(true);
    setActionMessage(null);
    try {
      await patchConfigValue(
        JSON.stringify(buildHeartbeatPatch(heartbeatForm), null, 2),
        configSnapshot.hash,
      );
      await refreshDashboard();
      setActionMessage("Heartbeat settings updated.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setHeartbeatSaving(false);
    }
  }

  async function toggleHeartbeat(enabled: boolean) {
    setHeartbeatToggleSaving(true);
    setActionMessage(null);
    try {
      await setHeartbeatsEnabled(enabled);
      await refreshDashboard();
      setActionMessage(enabled ? "Heartbeat enabled." : "Heartbeat disabled.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setHeartbeatToggleSaving(false);
    }
  }

  async function sendWake(mode: "now" | "next-heartbeat") {
    setActionMessage(null);
    try {
      const text = wakeText.trim() || "Check NoxSoft chat, mission control, and continuity status.";
      await wakeHeartbeat(text, mode);
      setActionMessage(
        mode === "now" ? "Heartbeat wake sent immediately." : "Wake queued for the next heartbeat.",
      );
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function startVoiceCapture() {
    if (!speechRecognitionRef.current) {
      setSpeechError("Browser speech recognition is not available here.");
      return;
    }
    setSpeechError(null);
    setSpeechListening(true);
    speechRecognitionRef.current.start();
  }

  function stopVoiceCapture() {
    speechRecognitionRef.current?.stop();
    setSpeechListening(false);
  }

  if (!initialLoadDone) {
    return (
      <div>
        <h1 className="page-title">Assistant Home</h1>
        <div className="card empty-state-card">
          <div className="empty-state-symbol">~</div>
          <div className="empty-state-copy">Connecting to gateway...</div>
          <div className="runtime-stat-detail">Establishing connection to the ANIMA daemon.</div>
        </div>
      </div>
    );
  }

  if (dashboardError && !runtime && !status) {
    return (
      <div>
        <h1 className="page-title">Assistant Home</h1>
        <div className="card empty-state-card">
          <div className="empty-state-symbol">!</div>
          <div className="empty-state-copy">Unable to reach gateway</div>
          <div className="runtime-stat-detail" style={{ marginTop: "0.5rem" }}>
            {dashboardError}
          </div>
          <div className="runtime-stat-detail" style={{ marginTop: "1rem" }}>
            Make sure the daemon is running with <code>anima start</code> and that the gateway is
            accessible. If connecting via browser, verify the URL includes{" "}
            <code>?token=YOUR_TOKEN</code>.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header-row">
        <div>
          <h1 className="page-title">{assistantName} Home</h1>
          <div className="page-subtitle">
            Local mission control, heartbeat orchestration, and direct gateway chat.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span className={`status-chip ${dashboardError ? "offline" : "online"}`}>
            {dashboardError ? "Gateway unreachable" : "Gateway connected"}
          </span>
          <button
            type="button"
            className="action-button ghost"
            onClick={() => void refreshDashboard()}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="hero-grid">
        <div className="card identity-hero">
          <div className="identity-badge">{runtime?.assistant.avatar || "A"}</div>
          <div>
            <div className="card-title">{assistantName}</div>
            <div className="card-subtitle mono">
              {runtime?.assistant.agentId || registration?.agent?.name || "main"}
            </div>
            <div className="badge-row top-gap">
              <StatusPill
                tone={status?.heartbeat.running ? "success" : "warning"}
                label={status?.heartbeat.running ? "heartbeat live" : "heartbeat idle"}
              />
              <StatusPill
                tone={registration?.agent ? "accent" : "warning"}
                label={registration?.agent ? "registered" : "not registered"}
              />
              <StatusPill
                tone={repoStatus?.remoteConfigured ? "success" : "warning"}
                label={repoStatus?.remoteConfigured ? "repo linked" : "repo pending"}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header compact">
            <div>
              <div className="card-title">Working Mode</div>
              <div className="card-subtitle">
                Control whether ANIMA is in read-only or write-capable mode.
              </div>
            </div>
            <WorkingModeToggle value={workingMode} busy={modeSaving} onChange={applyWorkingMode} />
          </div>
          <div className="runtime-stat-detail top-gap">
            Session security:{" "}
            <span className="mono">{runtime?.mainSession.execSecurity ?? "unknown"}</span> · Ask
            policy: <span className="mono">{runtime?.mainSession.execAsk ?? "unknown"}</span>
          </div>
        </div>
      </div>

      {actionMessage ? (
        <div className="card status-banner">
          <div>{actionMessage}</div>
        </div>
      ) : null}

      <div className="dashboard-grid">
        <div className="dashboard-main-column">
          <div className="card live-chat-card">
            <div className="card-header">
              <div>
                <div className="card-title">Talk to {assistantName}</div>
                <div className="card-subtitle">
                  Direct gateway chat with markdown rendering and local voice mode.
                </div>
              </div>
              <span className={`status-chip ${chatConnected ? "online" : "offline"}`}>
                {chatConnected ? "Connected" : "Reconnecting"}
              </span>
            </div>

            <div className="live-chat-feed">
              {chatMessages.length === 0 && !chatStream ? (
                <div className="empty-note">
                  Conversation history is empty. Send a message to begin.
                </div>
              ) : null}

              {chatMessages.map((message) => (
                <div
                  key={message.id}
                  className={`live-chat-row ${message.role === "user" ? "user" : "assistant"}`}
                >
                  <div className={`live-chat-bubble ${message.role}`}>
                    <div className="live-chat-role">
                      {message.role === "user" ? "You" : assistantName}
                    </div>
                    <MarkdownText value={message.text} className="live-chat-markdown" />
                  </div>
                </div>
              ))}

              {chatStream ? (
                <div className="live-chat-row assistant">
                  <div className="live-chat-bubble assistant">
                    <div className="live-chat-role">{assistantName}</div>
                    <MarkdownText value={chatStream} className="live-chat-markdown" />
                  </div>
                </div>
              ) : null}

              <div ref={feedBottomRef} />
            </div>

            <div className="voice-toolbar">
              <button
                type="button"
                className="action-button ghost"
                onClick={speechListening ? stopVoiceCapture : startVoiceCapture}
                disabled={!speechSupported}
              >
                {speechListening ? "Stop Listening" : "Start Listening"}
              </button>
              <button
                type="button"
                className="action-button ghost"
                onClick={() =>
                  void updateSpeechState({ autoSpeak: !(speechState?.autoSpeak ?? false) })
                }
              >
                Auto Speak: {speechState?.autoSpeak ? "On" : "Off"}
              </button>
              <button
                type="button"
                className="action-button ghost"
                onClick={() =>
                  void updateSpeechState({ continuous: !(speechState?.continuous ?? true) })
                }
              >
                Continuous: {speechState?.continuous === false ? "Off" : "On"}
              </button>
            </div>
            {speechError ? (
              <div className="runtime-stat-detail warning-text">{speechError}</div>
            ) : null}
            {chatError ? <div className="runtime-stat-detail warning-text">{chatError}</div> : null}

            <form onSubmit={onSendMessage} className="live-chat-input-row">
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder={`Message ${assistantName} directly...`}
                className="live-chat-input"
                rows={4}
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
        </div>

        <div className="dashboard-side-column">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Heartbeat Studio</div>
                <div className="card-subtitle">
                  Custom cadence, prompt, wake control, and continuity reminders.
                </div>
              </div>
              <button
                type="button"
                className="action-button ghost"
                onClick={() => void toggleHeartbeat(!(status?.heartbeat.running ?? false))}
                disabled={heartbeatToggleSaving}
              >
                {heartbeatToggleSaving
                  ? "Saving..."
                  : status?.heartbeat.running
                    ? "Disable"
                    : "Enable"}
              </button>
            </div>
            <div className="stats-grid compact">
              <RuntimeStat label="Cadence" value={heartbeatForm.every || "unset"} />
              <RuntimeStat
                label="Last beat"
                value={
                  status?.heartbeat.lastBeat
                    ? formatRelativeTime(status.heartbeat.lastBeat)
                    : "none"
                }
                detail={runtime?.lastHeartbeat?.preview || "No heartbeat summary yet."}
              />
              <RuntimeStat
                label="Queued events"
                value={String(runtime?.queuedSystemEvents.length ?? 0)}
              />
            </div>
            <div className="form-grid two-col top-gap">
              <label className="field-block">
                <span>Every</span>
                <input
                  className="search-bar mono"
                  value={heartbeatForm.every}
                  onChange={(event) =>
                    setHeartbeatForm((prev) => ({ ...prev, every: event.target.value }))
                  }
                  placeholder="5m"
                />
              </label>
              <label className="field-block">
                <span>Target</span>
                <input
                  className="search-bar mono"
                  value={heartbeatForm.target}
                  onChange={(event) =>
                    setHeartbeatForm((prev) => ({ ...prev, target: event.target.value }))
                  }
                  placeholder="last"
                />
              </label>
            </div>
            <label className="field-block top-gap-sm">
              <span>Prompt</span>
              <textarea
                className="search-bar mono"
                rows={4}
                value={heartbeatForm.prompt}
                onChange={(event) =>
                  setHeartbeatForm((prev) => ({ ...prev, prompt: event.target.value }))
                }
                placeholder="Heartbeat reminder and continuity prompt"
              />
            </label>
            <div className="button-row top-gap">
              <button
                type="button"
                className="action-button"
                onClick={() => void saveHeartbeatSettings()}
                disabled={heartbeatSaving}
              >
                {heartbeatSaving ? "Saving..." : "Save Heartbeat"}
              </button>
              <button
                type="button"
                className="action-button ghost"
                onClick={() => void sendWake("now")}
              >
                Wake Now
              </button>
              <button
                type="button"
                className="action-button ghost"
                onClick={() => void sendWake("next-heartbeat")}
              >
                Queue Wake
              </button>
            </div>
            <label className="field-block top-gap">
              <span>Wake text</span>
              <textarea
                className="search-bar"
                rows={3}
                value={wakeText}
                onChange={(event) => setWakeText(event.target.value)}
              />
            </label>
            <div className="runtime-stat-detail top-gap-sm">
              Reminder baked into runtime: check chat.noxsoft.net with Nox when tools are available,
              then sync mission control.
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Continuity</div>
                <div className="card-subtitle">
                  Local mission control and repo-backed persistence.
                </div>
              </div>
              <StatusPill
                tone={repoStatus?.remoteConfigured ? "success" : "warning"}
                label={repoStatus?.remoteConfigured ? "linked" : "needs repo"}
              />
            </div>
            <div className="stats-grid compact">
              <RuntimeStat
                label="Mission dir"
                value={runtime?.mission?.directory || "~/.anima/mission-control"}
              />
              <RuntimeStat
                label="Repo"
                value={repoStatus?.url || "Create a private SSH repo"}
                detail={repoStatus?.branch || "branch unset"}
              />
              <RuntimeStat
                label="History"
                value={String(runtime?.mission?.importantHistory?.length ?? 0)}
                detail="archived continuity files"
              />
            </div>
            <div className="runtime-stat-detail top-gap">
              Preferred flow: create a private GitHub or GitLab repo, then connect the SSH remote in
              Mission Control or Settings so ANIMA can persist continuity safely.
            </div>
            {runtime?.mission?.files?.find((file) => file.fileName === "self-directives.md") ? (
              <details className="details-panel top-gap" open>
                <summary>Self directives</summary>
                <MarkdownText
                  value={
                    runtime.mission.files.find((file) => file.fileName === "self-directives.md")
                      ?.content || ""
                  }
                  className="markdown-preview"
                />
              </details>
            ) : null}
          </div>

          <SubagentStatusCard subagents={status?.subagents} />

          <details className="card details-panel">
            <summary>Agent Logs</summary>
            <div className="runtime-stat-detail top-gap-sm mono">
              {logsState?.file || "No log file detected."}
            </div>
            <pre className="log-console">{logsState?.lines.join("\n") || "No log lines yet."}</pre>
          </details>

          <details className="card details-panel">
            <summary>Inner World</summary>
            <div className="activity-list top-gap">
              {(runtime?.mission?.innerWorld || []).map((entry) => (
                <div key={entry.id} className="inner-world-entry">
                  <div className="activity-row">
                    <div>
                      <div className="card-title small">{entry.title}</div>
                      <div className="runtime-stat-detail mono">{entry.path}</div>
                    </div>
                    <div className="runtime-stat-detail">{formatRelativeTime(entry.updatedAt)}</div>
                  </div>
                  <MarkdownText value={entry.content} className="markdown-preview" />
                </div>
              ))}
            </div>
          </details>

          <details className="card details-panel">
            <summary>Important History</summary>
            {(runtime?.mission?.importantHistory || []).length ? (
              <div className="activity-list top-gap">
                {(runtime?.mission?.importantHistory || []).map((entry) => (
                  <div key={entry.id} className="inner-world-entry">
                    <div className="activity-row">
                      <div>
                        <div className="card-title small">{entry.relativePath}</div>
                        <div className="runtime-stat-detail mono">{entry.archiveId}</div>
                        <div className="runtime-stat-detail mono">{entry.path}</div>
                      </div>
                      <div className="runtime-stat-detail">
                        {formatRelativeTime(entry.updatedAt)}
                      </div>
                    </div>
                    <MarkdownText value={entry.content} className="markdown-preview" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-note top-gap">
                No archived continuity has been imported yet.
              </div>
            )}
          </details>

          <details className="card details-panel">
            <summary>Speech Setup</summary>
            <div className="form-grid top-gap two-col">
              <label className="field-block">
                <span>Language</span>
                <input
                  className="search-bar mono"
                  value={speechState?.lang || "en-US"}
                  onChange={(event) => void updateSpeechState({ lang: event.target.value })}
                />
              </label>
              <label className="field-block">
                <span>Voice</span>
                <select
                  className="search-bar"
                  value={speechState?.voiceName || ""}
                  onChange={(event) =>
                    void updateSpeechState({ voiceName: event.target.value || undefined })
                  }
                >
                  <option value="">System default</option>
                  {voiceNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="runtime-stat-detail top-gap-sm">
              No API keys required. Voice mode uses browser speech recognition plus local OS speech
              synthesis when available.
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
