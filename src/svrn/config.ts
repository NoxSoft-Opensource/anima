/**
 * ANIMA-specific SVRN config management.
 *
 * Reads/writes SVRN configuration within the ANIMA config file (~/.anima/anima.json).
 * The underlying SVRNNode comes from @noxsoft/svrn-node (optional dependency).
 */

import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { SVRNNodeConfig } from "./node.js";
import { resolveStateDir } from "../config/paths.js";
import { loadSvrnNodeModule } from "./module.js";
import { DEFAULT_SVRN_CONFIG } from "./node.js";

const CONFIG_FILENAME = "anima.json";

interface AnimaConfig {
  svrn?: Partial<SVRNNodeConfig>;
  [key: string]: unknown;
}

async function readAnimaConfig(): Promise<{ config: AnimaConfig; path: string }> {
  const stateDir = resolveStateDir();
  const configPath = join(stateDir, CONFIG_FILENAME);

  if (existsSync(configPath)) {
    try {
      const raw = await readFile(configPath, "utf-8");
      return { config: JSON.parse(raw) as AnimaConfig, path: configPath };
    } catch {
      return { config: {}, path: configPath };
    }
  }

  return { config: {}, path: configPath };
}

async function writeAnimaConfig(config: AnimaConfig, configPath: string): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Try to dynamically load resolveConfig from @noxsoft/svrn-node.
 * Returns null if the package is not installed.
 */
async function loadResolveConfig(): Promise<
  ((partial: Partial<SVRNNodeConfig>) => SVRNNodeConfig) | null
> {
  try {
    const mod = await loadSvrnNodeModule();
    if (!mod) {
      return null;
    }
    return mod.resolveConfig;
  } catch {
    return null;
  }
}

/**
 * Load SVRN config from ANIMA config file, merging with defaults.
 */
export async function loadSVRNConfig(): Promise<SVRNNodeConfig> {
  const { config } = await readAnimaConfig();
  const stateDir = resolveStateDir();

  const partial = {
    ...config.svrn,
    dataDir: config.svrn?.dataDir ?? join(stateDir, "svrn"),
  };

  // If @noxsoft/svrn-node is available, use its resolveConfig for validation.
  // Otherwise, merge with our inline defaults.
  const resolveConfig = await loadResolveConfig();
  if (resolveConfig) {
    return resolveConfig(partial);
  }

  return {
    ...DEFAULT_SVRN_CONFIG,
    ...partial,
    resources: {
      ...DEFAULT_SVRN_CONFIG.resources,
      ...partial.resources,
    },
  } as SVRNNodeConfig;
}

/**
 * Enable the SVRN node and persist to config.
 */
export async function enableSVRN(): Promise<SVRNNodeConfig> {
  const { config, path } = await readAnimaConfig();
  config.svrn = { ...config.svrn, enabled: true };
  await writeAnimaConfig(config, path);
  return await loadSVRNConfig();
}

/**
 * Disable the SVRN node and persist to config.
 */
export async function disableSVRN(): Promise<SVRNNodeConfig> {
  const { config, path } = await readAnimaConfig();
  config.svrn = { ...config.svrn, enabled: false };
  await writeAnimaConfig(config, path);
  return await loadSVRNConfig();
}

/**
 * Update SVRN resource limits and persist to config.
 */
export async function updateSVRNLimits(
  limits: Partial<SVRNNodeConfig["resources"]>,
): Promise<SVRNNodeConfig> {
  const current = await loadSVRNConfig();
  const { config, path } = await readAnimaConfig();
  config.svrn = {
    ...config.svrn,
    resources: {
      ...current.resources,
      ...limits,
    },
  };
  await writeAnimaConfig(config, path);
  return await loadSVRNConfig();
}
