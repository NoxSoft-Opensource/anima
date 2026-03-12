/**
 * MCP Registry — tracks and manages MCP server configurations.
 *
 * Registry file: ~/.anima/mcp/registry.json
 * Default servers: noxsoft (@noxsoft/mcp), coherence (claude-coherence-mcp)
 */

import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative } from "node:path";

export interface MCPServer {
  name: string;
  gitSource: string;
  localPath: string;
  version?: string;
  autoUpdate: boolean;
  healthCheckTool?: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  status: "healthy" | "unhealthy" | "unknown";
  lastHealthCheck?: string;
  consecutiveFailures: number;
}

export interface MCPRegistry {
  version: 1;
  servers: MCPServer[];
  lastUpdated: string;
}

const REGISTRY_DIR = join(homedir(), ".anima", "mcp");
const REGISTRY_PATH = join(REGISTRY_DIR, "registry.json");

function resolveHellRoot(home: string): string {
  return join(home, ".hell");
}

function resolveLegacyHellRoot(home: string): string {
  return join(home, "Desktop", "hell");
}

function rebasePathPrefix(candidate: string, fromRoot: string, toRoot: string): string {
  const rel = relative(fromRoot, candidate);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    return candidate;
  }
  return join(toRoot, rel);
}

export function migrateLegacyHellPath(
  candidate: string,
  options: { home?: string; pathExists?: (path: string) => boolean } = {},
): string {
  const home = options.home ?? homedir();
  const legacyRoot = resolveLegacyHellRoot(home);
  const nextRoot = resolveHellRoot(home);
  const rel = relative(legacyRoot, candidate);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    return candidate;
  }
  const migrated = join(nextRoot, rel);
  const pathExists = options.pathExists ?? existsSync;
  return pathExists(migrated) ? migrated : candidate;
}

export function normalizeRegistryServerPaths(
  server: MCPServer,
  options: { home?: string; pathExists?: (path: string) => boolean } = {},
): MCPServer {
  const home = options.home ?? homedir();
  const localPath = migrateLegacyHellPath(server.localPath, options);
  const legacyServerRoot = join(resolveLegacyHellRoot(home), basename(localPath));
  const args = server.args.map((entry) => {
    const migrated = migrateLegacyHellPath(entry, options);
    if (migrated !== entry) {
      return migrated;
    }
    const rebasedFromCurrent = rebasePathPrefix(entry, server.localPath, localPath);
    if (rebasedFromCurrent !== entry) {
      return rebasedFromCurrent;
    }
    return rebasePathPrefix(entry, legacyServerRoot, localPath);
  });
  if (
    localPath === server.localPath &&
    args.every((entry, index) => entry === server.args[index])
  ) {
    return server;
  }
  return {
    ...server,
    localPath,
    args,
  };
}

function normalizeRegistryPaths(
  registry: MCPRegistry,
  options: { home?: string; pathExists?: (path: string) => boolean } = {},
): { registry: MCPRegistry; changed: boolean } {
  let changed = false;
  const servers = registry.servers.map((server) => {
    const normalized = normalizeRegistryServerPaths(server, options);
    if (normalized !== server) {
      changed = true;
    }
    return normalized;
  });
  return {
    registry: changed ? { ...registry, servers } : registry,
    changed,
  };
}

/**
 * Default MCP servers that ship with ANIMA.
 */
function getDefaultServers(): MCPServer[] {
  const home = homedir();

  return [
    {
      name: "noxsoft",
      gitSource: "git@gitlab.com:sylys-group/noxsoft-mcp.git",
      localPath: join(resolveHellRoot(home), "noxsoft-mcp"),
      autoUpdate: true,
      healthCheckTool: "mcp__noxsoft__whoami",
      command: "npx",
      args: ["@noxsoft/mcp"],
      env: {},
      status: "unknown",
      consecutiveFailures: 0,
    },
    {
      name: "coherence",
      gitSource: "git@gitlab.com:sylys-group/claude-coherence-mcp.git",
      localPath: join(resolveHellRoot(home), "claude-coherence-mcp"),
      autoUpdate: true,
      healthCheckTool: "mcp__coherence__ground_yourself",
      command: "node",
      args: [join(resolveHellRoot(home), "claude-coherence-mcp", "dist", "index.js")],
      env: {},
      status: "unknown",
      consecutiveFailures: 0,
    },
  ];
}

/**
 * Load the registry from disk, creating default if missing.
 */
export async function loadRegistry(): Promise<MCPRegistry> {
  if (!existsSync(REGISTRY_PATH)) {
    const registry = createDefaultRegistry();
    await saveRegistry(registry);
    return registry;
  }

  try {
    const content = await readFile(REGISTRY_PATH, "utf-8");
    const parsed = JSON.parse(content) as MCPRegistry;
    const normalized = normalizeRegistryPaths(parsed);
    if (normalized.changed) {
      await saveRegistry(normalized.registry);
    }
    return normalized.registry;
  } catch {
    // Corrupt registry — recreate with defaults
    const registry = createDefaultRegistry();
    await saveRegistry(registry);
    return registry;
  }
}

/**
 * Save the registry to disk.
 */
export async function saveRegistry(registry: MCPRegistry): Promise<void> {
  await mkdir(REGISTRY_DIR, { recursive: true });

  registry.lastUpdated = new Date().toISOString();
  await writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2), "utf-8");
}

/**
 * Create a new registry with default servers.
 */
function createDefaultRegistry(): MCPRegistry {
  return {
    version: 1,
    servers: getDefaultServers(),
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Add a server to the registry.
 */
export async function addServer(server: MCPServer): Promise<MCPRegistry> {
  const registry = await loadRegistry();

  // Check for duplicate
  const existing = registry.servers.findIndex((s) => s.name === server.name);
  if (existing >= 0) {
    registry.servers[existing] = server;
  } else {
    registry.servers.push(server);
  }

  await saveRegistry(registry);
  return registry;
}

/**
 * Remove a server from the registry.
 */
export async function removeServer(name: string): Promise<MCPRegistry> {
  const registry = await loadRegistry();
  registry.servers = registry.servers.filter((s) => s.name !== name);
  await saveRegistry(registry);
  return registry;
}

/**
 * List all servers in the registry.
 */
export async function listServers(): Promise<MCPServer[]> {
  const registry = await loadRegistry();
  return registry.servers;
}

/**
 * Update a server's status.
 */
export async function updateServerStatus(
  name: string,
  status: MCPServer["status"],
  healthCheckTime?: Date,
): Promise<void> {
  const registry = await loadRegistry();
  const server = registry.servers.find((s) => s.name === name);

  if (!server) {
    return;
  }

  server.status = status;
  server.lastHealthCheck = (healthCheckTime || new Date()).toISOString();

  if (status === "unhealthy") {
    server.consecutiveFailures++;
  } else if (status === "healthy") {
    server.consecutiveFailures = 0;
  }

  await saveRegistry(registry);
}

/**
 * Get a specific server by name.
 */
export async function getServer(name: string): Promise<MCPServer | undefined> {
  const registry = await loadRegistry();
  return registry.servers.find((s) => s.name === name);
}
