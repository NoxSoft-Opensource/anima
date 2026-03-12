/**
 * Transcript Storage — persists session results as JSON.
 *
 * Saves to ~/.anima/sessions/YYYY-MM-DD/{timestamp}_{sessionId}.json
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { SessionResult } from "./spawner.js";

export interface TranscriptEntry {
  sessionId: string;
  mode: "task" | "heartbeat" | "freedom";
  prompt: string;
  systemPrompt: string;
  result: SessionResult;
  metadata?: Record<string, unknown>;
}

interface TranscriptFile {
  version: 1;
  savedAt: string;
  sessionId: string;
  mode: string;
  prompt: string;
  systemPromptLength: number;
  output: string;
  status: string;
  exitCode: number;
  durationMs: number;
  costUsd: number | null;
  tokensUsed: number | null;
  metadata: Record<string, unknown>;
}

/**
 * Save a session transcript to disk.
 *
 * Directory structure: {baseDir}/YYYY-MM-DD/{timestamp}_{sessionId}.json
 */
export async function saveTranscript(baseDir: string, entry: TranscriptEntry): Promise<string> {
  const now = new Date();
  const dateDir = now.toISOString().split("T")[0];
  const timestamp = now.toISOString().replace(/[:.]/g, "-");

  const dir = join(baseDir, dateDir);
  await mkdir(dir, { recursive: true });

  const filename = `${timestamp}_${entry.sessionId}.json`;
  const filePath = join(dir, filename);

  const transcript: TranscriptFile = {
    version: 1,
    savedAt: now.toISOString(),
    sessionId: entry.sessionId,
    mode: entry.mode,
    prompt: entry.prompt,
    systemPromptLength: entry.systemPrompt.length,
    output: entry.result.output,
    status: entry.result.status,
    exitCode: entry.result.exitCode,
    durationMs: entry.result.durationMs,
    costUsd: entry.result.costUsd ?? null,
    tokensUsed: entry.result.tokensUsed ?? null,
    metadata: entry.metadata || {},
  };

  await writeFile(filePath, JSON.stringify(transcript, null, 2), "utf-8");
  return filePath;
}
