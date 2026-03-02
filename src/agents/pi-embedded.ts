/**
 * Pi-embedded agent — STUBBED
 *
 * The the original pi-embedded LLM provider abstraction has been removed.
 * ANIMA uses Claude Code CLI as its sole interface to Claude.
 * These exports are kept as stubs to prevent import breakage during Phase 1.
 * Full replacement comes in Phase 2 (Task 7: Claude Code CLI Spawner).
 */

import type { SessionSystemPromptReport } from "../config/sessions/types.js";
import type { NormalizedUsage } from "./usage.js";

export type EmbeddedPiAgentMeta = Record<string, unknown>;

export type EmbeddedPiCompactResult = {
  ok: boolean;
  compacted?: boolean;
  reason?: string;
  result?: {
    tokensBefore?: number;
    tokensAfter?: number;
  };
};

export type EmbeddedPiRunMeta = Record<string, unknown>;

export type EmbeddedPiRunResult = {
  status: "completed" | "failed" | "timeout";
  output?: string;
  payloads?: Array<{
    text?: string;
    mediaUrl?: string;
    mediaUrls?: string[];
  }>;
  meta: {
    durationMs?: number;
    error?: { message: string; kind?: string };
    systemPromptReport?: SessionSystemPromptReport;
    agentMeta?: {
      sessionId?: string;
      provider?: string;
      model?: string;
      usage?: NormalizedUsage;
      promptTokens?: number;
      lastCallUsage?: NormalizedUsage;
    };
  };
  messagingToolSentTexts?: string[];
  messagingToolSentTargets?: Array<{
    to: string;
    text: string;
    provider?: string;
    accountId?: string;
  }>;
};

export async function runEmbeddedPiAgent(..._args: unknown[]): Promise<EmbeddedPiRunResult> {
  throw new Error("pi-embedded removed — use Claude Code CLI spawner (Phase 2, Task 7)");
}

export async function compactEmbeddedPiSession(
  ..._args: unknown[]
): Promise<EmbeddedPiCompactResult> {
  throw new Error("pi-embedded removed — use Claude Code CLI spawner (Phase 2, Task 7)");
}

export function abortEmbeddedPiRun(..._args: unknown[]): boolean {
  return false;
}

export function isEmbeddedPiRunActive(..._args: unknown[]): boolean {
  return false;
}

export function isEmbeddedPiRunStreaming(..._args: unknown[]): boolean {
  return false;
}

export function queueEmbeddedPiMessage(..._args: unknown[]): boolean {
  return false;
}

export function resolveEmbeddedSessionLane(..._args: unknown[]): string {
  return "default";
}

export async function waitForEmbeddedPiRunEnd(..._args: unknown[]): Promise<boolean> {
  return true;
}
