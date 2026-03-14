/**
 * Agent Self-Upgrade System for ANIMA 6
 *
 * Allows an Anima instance to:
 * 1. Check for new versions on npm
 * 2. Pull the latest code
 * 3. Rebuild
 * 4. Restart itself
 *
 * This enables agents to self-evolve — modify their own code,
 * upgrade to new versions, and restart with improvements.
 */

import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("self-upgrade");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpgradeCheck {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  channel: "npm" | "git" | "local";
}

export interface UpgradeResult {
  success: boolean;
  previousVersion: string;
  newVersion: string;
  steps: UpgradeStep[];
  error?: string;
  restartRequired: boolean;
}

export interface UpgradeStep {
  name: string;
  status: "success" | "failed" | "skipped";
  durationMs: number;
  output?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Version check
// ---------------------------------------------------------------------------

/**
 * Check if a newer version is available on npm.
 */
export function checkForUpgrade(packageDir: string): UpgradeCheck {
  try {
    const pkgPath = path.join(packageDir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const currentVersion = pkg.version;
    const packageName = pkg.name;

    let latestVersion = currentVersion;
    try {
      const output = execSync(`npm view ${packageName} version`, {
        timeout: 10_000,
        encoding: "utf8",
      }).trim();
      latestVersion = output;
    } catch {
      log.warn("failed to check npm for latest version");
    }

    const updateAvailable =
      latestVersion !== currentVersion && compareVersions(latestVersion, currentVersion) > 0;

    return {
      currentVersion,
      latestVersion,
      updateAvailable,
      channel: "npm",
    };
  } catch (err) {
    log.error(`upgrade check failed: ${String(err)}`);
    return {
      currentVersion: "unknown",
      latestVersion: "unknown",
      updateAvailable: false,
      channel: "npm",
    };
  }
}

/**
 * Check if there are git updates available.
 */
export function checkGitUpdates(repoDir: string): UpgradeCheck {
  try {
    const pkgPath = path.join(repoDir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const currentVersion = pkg.version;

    execSync("git fetch origin", { cwd: repoDir, timeout: 15_000 });
    const behindOutput = execSync("git rev-list HEAD..origin/main --count", {
      cwd: repoDir,
      encoding: "utf8",
      timeout: 5_000,
    }).trim();

    const behind = parseInt(behindOutput, 10);

    return {
      currentVersion,
      latestVersion: behind > 0 ? `${currentVersion}+${behind}` : currentVersion,
      updateAvailable: behind > 0,
      channel: "git",
    };
  } catch (err) {
    log.warn(`git update check failed: ${String(err)}`);
    return {
      currentVersion: "unknown",
      latestVersion: "unknown",
      updateAvailable: false,
      channel: "git",
    };
  }
}

// ---------------------------------------------------------------------------
// Upgrade execution
// ---------------------------------------------------------------------------

/**
 * Pull latest code from git, rebuild, and prepare for restart.
 */
export function performGitUpgrade(repoDir: string): UpgradeResult {
  const steps: UpgradeStep[] = [];
  const pkgPath = path.join(repoDir, "package.json");
  const previousVersion = JSON.parse(fs.readFileSync(pkgPath, "utf8")).version;

  // Step 1: Git pull
  const pullStep = executeStep("git-pull", () => {
    execSync("git pull origin main", { cwd: repoDir, timeout: 30_000, encoding: "utf8" });
  });
  steps.push(pullStep);
  if (pullStep.status === "failed") {
    return {
      success: false,
      previousVersion,
      newVersion: previousVersion,
      steps,
      error: pullStep.error,
      restartRequired: false,
    };
  }

  // Step 2: Install dependencies
  const installStep = executeStep("install", () => {
    execSync("pnpm install --frozen-lockfile", {
      cwd: repoDir,
      timeout: 120_000,
      encoding: "utf8",
    });
  });
  steps.push(installStep);
  if (installStep.status === "failed") {
    return {
      success: false,
      previousVersion,
      newVersion: previousVersion,
      steps,
      error: installStep.error,
      restartRequired: false,
    };
  }

  // Step 3: Build
  const buildStep = executeStep("build", () => {
    execSync("pnpm build", { cwd: repoDir, timeout: 60_000, encoding: "utf8" });
  });
  steps.push(buildStep);
  if (buildStep.status === "failed") {
    return {
      success: false,
      previousVersion,
      newVersion: previousVersion,
      steps,
      error: buildStep.error,
      restartRequired: false,
    };
  }

  // Step 4: Run tests
  const testStep = executeStep("test", () => {
    execSync("pnpm test:fast", { cwd: repoDir, timeout: 180_000, encoding: "utf8" });
  });
  steps.push(testStep);

  const newVersion = JSON.parse(fs.readFileSync(pkgPath, "utf8")).version;

  return {
    success: true,
    previousVersion,
    newVersion,
    steps,
    restartRequired: true,
  };
}

/**
 * Restart the current process.
 * Spawns a new instance and exits the current one.
 */
export function restartSelf(entryScript: string, args: string[] = []): void {
  log.info(`restarting self: ${entryScript} ${args.join(" ")}`);

  const child = spawn(process.execPath, [entryScript, ...args], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, ANIMA_RESTARTED: "1" },
  });

  child.unref();

  log.info("new process spawned, exiting current process");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Liveness monitoring
// ---------------------------------------------------------------------------

export interface LivenessConfig {
  /** How often to send heartbeat (ms) */
  heartbeatIntervalMs: number;
  /** How long before considering an agent dead (ms) */
  deadThresholdMs: number;
  /** Callback when an agent is detected as dead */
  onAgentDead?: (agentId: string, lastSeen: number) => void;
}

const DEFAULT_LIVENESS: LivenessConfig = {
  heartbeatIntervalMs: 30_000, // 30s
  deadThresholdMs: 120_000, // 2 min
};

/**
 * Start liveness heartbeat.
 * Writes a timestamp to a file every interval.
 * Other processes can check this file to verify liveness.
 */
export function startLivenessHeartbeat(
  heartbeatFile: string,
  config?: Partial<LivenessConfig>,
): { stop: () => void } {
  const opts = { ...DEFAULT_LIVENESS, ...config };

  const write = () => {
    try {
      fs.mkdirSync(path.dirname(heartbeatFile), { recursive: true });
      fs.writeFileSync(
        heartbeatFile,
        JSON.stringify({
          pid: process.pid,
          timestamp: Date.now(),
          uptime: process.uptime(),
        }),
      );
    } catch (err) {
      log.warn(`heartbeat write failed: ${String(err)}`);
    }
  };

  write(); // Write immediately
  const interval = setInterval(write, opts.heartbeatIntervalMs);

  return {
    stop: () => clearInterval(interval),
  };
}

/**
 * Check if an agent is alive by reading its heartbeat file.
 */
export function checkAgentLiveness(
  heartbeatFile: string,
  deadThresholdMs = 120_000,
): { alive: boolean; lastSeen: number; pid?: number } {
  try {
    if (!fs.existsSync(heartbeatFile)) {
      return { alive: false, lastSeen: 0 };
    }
    const raw = fs.readFileSync(heartbeatFile, "utf8");
    const data = JSON.parse(raw);
    const age = Date.now() - data.timestamp;
    return {
      alive: age < deadThresholdMs,
      lastSeen: data.timestamp,
      pid: data.pid,
    };
  } catch {
    return { alive: false, lastSeen: 0 };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function executeStep(name: string, fn: () => void): UpgradeStep {
  const start = Date.now();
  try {
    fn();
    return { name, status: "success", durationMs: Date.now() - start };
  } catch (err) {
    return {
      name,
      status: "failed",
      durationMs: Date.now() - start,
      error: String(err),
    };
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va !== vb) {
      return va - vb;
    }
  }
  return 0;
}
