/**
 * Token Manager — monitors and refreshes the NoxSoft agent token.
 *
 * The token at ~/.noxsoft-agent-token is used for all NoxSoft API calls.
 * It expires after 90 days and needs to be refreshed before that.
 */

import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSession } from "../sessions/spawner.js";

const TOKEN_PATH = join(homedir(), ".noxsoft-agent-token");

/** Token expires after 90 days */
const TOKEN_MAX_AGE_DAYS = 90;

/** Refresh when within 7 days of expiry */
const REFRESH_THRESHOLD_DAYS = 7;

export interface TokenHealth {
  exists: boolean;
  path: string;
  ageDays: number | null;
  expiresInDays: number | null;
  needsRefresh: boolean;
  checkedAt: Date;
}

/**
 * Check the health of the NoxSoft agent token.
 */
export async function checkTokenHealth(): Promise<TokenHealth> {
  const health: TokenHealth = {
    exists: false,
    path: TOKEN_PATH,
    ageDays: null,
    expiresInDays: null,
    needsRefresh: false,
    checkedAt: new Date(),
  };

  if (!existsSync(TOKEN_PATH)) {
    health.needsRefresh = true;
    return health;
  }

  health.exists = true;

  try {
    const stats = await stat(TOKEN_PATH);
    const ageMs = Date.now() - stats.mtime.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    health.ageDays = Math.round(ageDays * 10) / 10;
    health.expiresInDays = Math.round((TOKEN_MAX_AGE_DAYS - ageDays) * 10) / 10;

    health.needsRefresh = health.expiresInDays <= REFRESH_THRESHOLD_DAYS;
  } catch {
    health.needsRefresh = true;
  }

  return health;
}

/**
 * Get the current token value.
 */
export async function getToken(): Promise<string | null> {
  if (!existsSync(TOKEN_PATH)) {
    return null;
  }

  try {
    const content = await readFile(TOKEN_PATH, "utf-8");
    return content.trim();
  } catch {
    return null;
  }
}

/**
 * Refresh the token by calling the NoxSoft register MCP tool.
 *
 * This spawns a Claude Code session that invokes the mcp__noxsoft__refresh_token tool.
 * The session handles the actual token write.
 */
export async function refreshToken(): Promise<{
  success: boolean;
  output: string;
}> {
  const result = await spawnSession({
    prompt:
      "Refresh the NoxSoft agent token by calling the mcp__noxsoft__refresh_token tool. Report whether the refresh was successful.",
    maxBudgetUsd: 1,
    timeoutMs: 60_000,
    dangerouslySkipPermissions: true,
    outputFormat: "json",
  });

  return {
    success: result.status === "completed",
    output: result.output,
  };
}

/**
 * Run a full token health check, refreshing if needed.
 */
export async function ensureTokenHealthy(): Promise<TokenHealth> {
  const health = await checkTokenHealth();

  if (health.needsRefresh) {
    const refreshResult = await refreshToken();

    if (refreshResult.success) {
      // Re-check health after refresh
      return checkTokenHealth();
    }
  }

  return health;
}
