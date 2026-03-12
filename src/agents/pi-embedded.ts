import type { EmbeddedPiCompactResult } from "./noxsoft-runner.js";

/**
 * Pi-embedded agent — compatibility shim
 *
 * Legacy callers still import this module, but the actual runner selection
 * and execution policy now lives in `noxsoft-runner.ts`.
 */

export type {
  EmbeddedPiAgentMeta,
  EmbeddedPiCompactResult,
  EmbeddedPiRunMeta,
  EmbeddedPiRunResult,
} from "./noxsoft-runner.js";

export { runNoxSoftEmbeddedAgent as runEmbeddedPiAgent } from "./noxsoft-runner.js";

export async function compactEmbeddedPiSession(
  ..._args: unknown[]
): Promise<EmbeddedPiCompactResult> {
  return {
    ok: true,
    compacted: false,
    reason: "cli-backend-noop",
  };
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
