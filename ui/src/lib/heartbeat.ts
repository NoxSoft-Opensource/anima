import type { ConfigSnapshot } from "../api";

export type HeartbeatFormState = {
  enabled: boolean;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readHeartbeatFormState(snapshot?: ConfigSnapshot | null): HeartbeatFormState {
  const defaults: HeartbeatFormState = {
    enabled: false,
    every: "5m",
    target: "last",
    session: "main",
    model: "",
    prompt:
      "Check mission control, review queued work, and when NoxSoft MCP/chat is available, check in with Nox briefly before syncing continuity files.",
    activeStart: "",
    activeEnd: "",
    activeTimezone: "",
    ackMaxChars: "",
    includeReasoning: false,
  };

  const config = snapshot?.config;
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
    enabled: true,
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

export function buildHeartbeatPatch(state: HeartbeatFormState): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    includeReasoning: state.includeReasoning,
  };

  const every = state.every.trim();
  const target = state.target.trim();
  const session = state.session.trim();
  const model = state.model.trim();
  const prompt = state.prompt.trim();
  const activeStart = state.activeStart.trim();
  const activeEnd = state.activeEnd.trim();
  const activeTimezone = state.activeTimezone.trim();
  const ackMaxCharsRaw = state.ackMaxChars.trim();

  if (every) {
    patch.every = every;
  }
  if (target) {
    patch.target = target;
  }
  if (session) {
    patch.session = session;
  }
  if (model) {
    patch.model = model;
  }
  if (prompt) {
    patch.prompt = prompt;
  }
  if (activeStart || activeEnd || activeTimezone) {
    patch.activeHours = {
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
    patch.ackMaxChars = ackMaxChars;
  }

  return {
    agents: {
      defaults: {
        heartbeat: patch,
      },
    },
  };
}
