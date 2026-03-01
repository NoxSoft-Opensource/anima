/**
 * Models configuration — SIMPLIFIED
 *
 * The multi-provider LLM abstraction (pi-ai) has been removed.
 * ANIMA uses Claude Code CLI exclusively. This file retains only
 * the minimal interface needed by the rest of the codebase.
 * Full replacement comes in Phase 2.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { type AnimaConfig, loadConfig } from "../config/config.js";
import { resolveAnimaAgentDir } from "./agent-paths.js";

export async function ensureAnimaModelsJson(
  config?: AnimaConfig,
  agentDirOverride?: string,
): Promise<{ agentDir: string; wrote: boolean }> {
  const cfg = config ?? loadConfig();
  const agentDir = agentDirOverride?.trim() ? agentDirOverride.trim() : resolveAnimaAgentDir();

  // ANIMA uses Claude Code CLI — no multi-provider models.json needed.
  // Keep the function signature for compatibility; just ensure the dir exists.
  await fs.mkdir(agentDir, { recursive: true, mode: 0o700 });

  const targetPath = path.join(agentDir, "models.json");
  const content = JSON.stringify({ providers: {} }, null, 2) + "\n";

  let existing = "";
  try {
    existing = await fs.readFile(targetPath, "utf8");
  } catch {
    // file doesn't exist yet
  }

  if (existing === content) {
    return { agentDir, wrote: false };
  }

  await fs.writeFile(targetPath, content, { mode: 0o600 });
  return { agentDir, wrote: true };
}
