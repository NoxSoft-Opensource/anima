import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { DEFAULT_AGENT_ID } from "../routing/session-key.js";
import { resolveUserPath } from "../utils.js";

export function resolveAnimaAgentDir(): string {
  const override =
    process.env.ANIMA_AGENT_DIR?.trim() ||
    process.env.OPENCLAW_AGENT_DIR?.trim() ||
    process.env.PI_CODING_AGENT_DIR?.trim();
  if (override) {
    return resolveUserPath(override);
  }
  const defaultAgentDir = path.join(resolveStateDir(), "agents", DEFAULT_AGENT_ID, "agent");
  return resolveUserPath(defaultAgentDir);
}

/** @deprecated Use resolveAnimaAgentDir() */
export const resolveOpenClawAgentDir = resolveAnimaAgentDir;

export function ensureAnimaAgentEnv(): string {
  const dir = resolveAnimaAgentDir();
  if (!process.env.ANIMA_AGENT_DIR) {
    process.env.ANIMA_AGENT_DIR = dir;
  }
  // Legacy compat
  if (!process.env.OPENCLAW_AGENT_DIR) {
    process.env.OPENCLAW_AGENT_DIR = dir;
  }
  if (!process.env.PI_CODING_AGENT_DIR) {
    process.env.PI_CODING_AGENT_DIR = dir;
  }
  return dir;
}

/** @deprecated Use ensureAnimaAgentEnv() */
export const ensureOpenClawAgentEnv = ensureAnimaAgentEnv;
