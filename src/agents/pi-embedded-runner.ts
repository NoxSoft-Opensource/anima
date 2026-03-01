/**
 * Pi-embedded runner — STUBBED
 *
 * The OpenClaw pi-embedded LLM provider abstraction has been removed.
 * ANIMA uses Claude Code CLI as its sole interface to Claude.
 * These exports are kept as stubs to prevent import breakage during Phase 1.
 */

export type {
  EmbeddedPiAgentMeta,
  EmbeddedPiCompactResult,
  EmbeddedPiRunMeta,
  EmbeddedPiRunResult,
} from "./pi-embedded.js";

export {
  runEmbeddedPiAgent,
  compactEmbeddedPiSession,
  abortEmbeddedPiRun,
  isEmbeddedPiRunActive,
  isEmbeddedPiRunStreaming,
  queueEmbeddedPiMessage,
  resolveEmbeddedSessionLane,
  waitForEmbeddedPiRunEnd,
} from "./pi-embedded.js";

export type MessagingToolSend = {
  to: string;
  text: string;
};

export function applyExtraParamsToAgent(): void {
  // stub
}

export function resolveExtraParams(): Record<string, unknown> {
  return {};
}

export function applyGoogleTurnOrderingFix(): void {
  // stub
}

export function getDmHistoryLimitFromSessionKey(): number | undefined {
  return undefined;
}

export function getHistoryLimitFromSessionKey(): number | undefined {
  return undefined;
}

export function limitHistoryTurns(): void {
  // stub
}

export function buildEmbeddedSandboxInfo(): Record<string, unknown> {
  return {};
}

export function createSystemPromptOverride(): string | undefined {
  return undefined;
}

export function splitSdkTools(): { local: unknown[]; remote: unknown[] } {
  return { local: [], remote: [] };
}
