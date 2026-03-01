/**
 * ANIMA-specific SVRN config management.
 *
 * Reads/writes SVRN configuration within the ANIMA config file (~/.anima/anima.json).
 * The underlying SVRNNode comes from @noxsoft/svrn-node.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { resolveConfig, type SVRNNodeConfig } from "@noxsoft/svrn-node";
import { resolveStateDir } from "../config/paths.js";

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
 * Load SVRN config from ANIMA config file, merging with defaults.
 */
export async function loadSVRNConfig(): Promise<SVRNNodeConfig> {
  const { config } = await readAnimaConfig();
  const stateDir = resolveStateDir();

  return resolveConfig({
    ...config.svrn,
    dataDir: config.svrn?.dataDir ?? join(stateDir, "svrn"),
  });
}

/**
 * Enable the SVRN node and persist to config.
 */
export async function enableSVRN(): Promise<void> {
  const { config, path } = await readAnimaConfig();
  config.svrn = { ...config.svrn, enabled: true };
  await writeAnimaConfig(config, path);
}

/**
 * Disable the SVRN node and persist to config.
 */
export async function disableSVRN(): Promise<void> {
  const { config, path } = await readAnimaConfig();
  config.svrn = { ...config.svrn, enabled: false };
  await writeAnimaConfig(config, path);
}

/**
 * Update SVRN resource limits and persist to config.
 */
export async function updateSVRNLimits(
  limits: Partial<Pick<SVRNNodeConfig, "resources">>,
): Promise<void> {
  const { config, path } = await readAnimaConfig();
  config.svrn = {
    ...config.svrn,
    resources: {
      ...(config.svrn?.resources ?? {}),
      ...(limits.resources ?? {}),
    },
  };
  await writeAnimaConfig(config, path);
}
