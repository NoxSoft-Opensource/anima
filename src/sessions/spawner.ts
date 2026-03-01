/**
 * Claude Code CLI Spawner — ANIMA's interface to Claude
 *
 * Uses execFile (not exec) for security — no shell injection.
 * Full implementation comes in Phase 2 (Task 7).
 */
import { execFile } from "child_process";

export interface SessionResult {
  id: string;
  status: "completed" | "failed" | "timeout";
  output: string;
  tokensUsed?: number;
  costUsd?: number;
  durationMs: number;
  exitCode: number;
}

export interface SpawnOptions {
  prompt: string;
  model?: string;
  maxBudgetUsd?: number;
  timeoutMs?: number;
  systemPrompt?: string;
}

/**
 * Spawn a Claude Code CLI session.
 * Placeholder — full implementation in Task 7.
 */
export async function spawnSession(options: SpawnOptions): Promise<SessionResult> {
  // TODO: Full implementation in Phase 2, Task 7
  throw new Error("Session spawner not yet implemented — Phase 2, Task 7");
}
