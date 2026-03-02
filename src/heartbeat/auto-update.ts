/**
 * Auto-Update — checks for ANIMA CLI updates and updates MCP servers.
 *
 * Runs periodically during heartbeat to keep everything current.
 * ANIMA self-update logs availability but does not restart mid-cycle.
 * MCP servers can be restarted since they're child processes.
 */

import { execFile as execFileCb } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { UpdateResult } from "../mcp/updater.js";
import { listServers } from "../mcp/registry.js";
import { updateServer } from "../mcp/updater.js";

const execFile = promisify(execFileCb);

export interface AnimaUpdateCheck {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  installed: boolean;
  error?: string;
}

/**
 * Read the current ANIMA version from package.json.
 */
async function getCurrentVersion(): Promise<string> {
  // Walk up from dist/ to find the package.json
  // In development: src/heartbeat/ -> package.json is at root
  // In production: dist/ -> package.json is at root (shipped in npm package)
  const candidates = [
    join(import.meta.dirname, "..", "..", "package.json"),
    join(import.meta.dirname, "..", "package.json"),
  ];

  for (const candidate of candidates) {
    try {
      const content = await readFile(candidate, "utf-8");
      const pkg = JSON.parse(content) as { version: string };
      if (pkg.version) {
        return pkg.version;
      }
    } catch {
      // Try next candidate
    }
  }

  return "0.0.0";
}

/**
 * Check npm registry for the latest version of @noxsoft/anima.
 */
async function getLatestNpmVersion(): Promise<string | null> {
  try {
    const { stdout } = await execFile("npm", ["view", "@noxsoft/anima", "version"], {
      timeout: 30_000,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Compare two semver strings. Returns true if b is newer than a.
 */
function isNewer(current: string, latest: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);

  const c = parse(current);
  const l = parse(latest);

  for (let i = 0; i < 3; i++) {
    const cv = c[i] ?? 0;
    const lv = l[i] ?? 0;
    if (lv > cv) {
      return true;
    }
    if (lv < cv) {
      return false;
    }
  }

  return false;
}

/**
 * Check if a newer version of @noxsoft/anima is available on npm.
 * If available and auto-install is desired, installs it globally.
 * Does NOT restart — the caller should schedule restart after the current cycle.
 */
export async function checkAnimaUpdate(): Promise<AnimaUpdateCheck> {
  const currentVersion = await getCurrentVersion();

  const latestVersion = await getLatestNpmVersion();

  if (!latestVersion) {
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      installed: false,
      error: "Could not reach npm registry",
    };
  }

  const updateAvailable = isNewer(currentVersion, latestVersion);

  if (!updateAvailable) {
    return {
      currentVersion,
      latestVersion,
      updateAvailable: false,
      installed: false,
    };
  }

  // Auto-install the update globally
  let installed = false;
  try {
    await execFile("npm", ["install", "-g", `@noxsoft/anima@${latestVersion}`], {
      timeout: 120_000,
    });
    installed = true;
  } catch (err) {
    return {
      currentVersion,
      latestVersion,
      updateAvailable: true,
      installed: false,
      error: `Install failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return {
    currentVersion,
    latestVersion,
    updateAvailable: true,
    installed,
  };
}

/**
 * Update all MCP servers that have autoUpdate enabled.
 * Uses the existing MCP updater which handles git pull, install, build, and rollback.
 */
export async function updateAllMcpServers(): Promise<UpdateResult[]> {
  const servers = await listServers();
  const results: UpdateResult[] = [];

  for (const server of servers) {
    if (!server.autoUpdate) {
      continue;
    }

    try {
      const result = await updateServer(server);
      results.push(result);
    } catch (err) {
      results.push({
        name: server.name,
        success: false,
        steps: [],
        error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return results;
}
