/**
 * Pi-embedded agent — STUBBED
 *
 * The the original pi-embedded LLM provider abstraction has been removed.
 * ANIMA uses Claude Code CLI as its sole interface to Claude.
 * These exports are kept as stubs to prevent import breakage during Phase 1.
 * Full replacement comes in Phase 2 (Task 7: Claude Code CLI Spawner).
 */

export type EmbeddedPiAgentMeta = Record<string, unknown>;
export type EmbeddedPiCompactResult = { ok: boolean };
export type EmbeddedPiRunMeta = Record<string, unknown>;
export type EmbeddedPiRunResult = {
  status: "completed" | "failed" | "timeout";
  output?: string;
};

export async function runEmbeddedPiAgent(): Promise<EmbeddedPiRunResult> {
  throw new Error("pi-embedded removed — use Claude Code CLI spawner (Phase 2, Task 7)");
}

export async function compactEmbeddedPiSession(): Promise<EmbeddedPiCompactResult> {
  throw new Error("pi-embedded removed — use Claude Code CLI spawner (Phase 2, Task 7)");
}

export function abortEmbeddedPiRun(): void {
  // no-op stub
}

export function isEmbeddedPiRunActive(): boolean {
  return false;
}

export function isEmbeddedPiRunStreaming(): boolean {
  return false;
}

export function queueEmbeddedPiMessage(): void {
  // no-op stub
}

export function resolveEmbeddedSessionLane(): string {
  return "default";
}

export async function waitForEmbeddedPiRunEnd(): Promise<void> {
  // no-op stub
}
