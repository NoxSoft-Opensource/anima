/**
 * Self-Replication — ensures ANIMA survives restarts and system reboots.
 *
 * On macOS: uses launchd to register a persistent agent.
 * On Windows: uses Task Scheduler (schtasks) to register a scheduled task.
 * Fallback: uses nohup (Unix) or start (Windows) for manual restart.
 *
 * Security: all subprocess calls use execFile (not exec).
 */

import { execFile as execFileCb } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

const IS_WINDOWS = platform() === "win32";

const PLIST_LABEL = "net.noxsoft.anima";
const PLIST_DIR = join(homedir(), "Library", "LaunchAgents");
const PLIST_PATH = join(PLIST_DIR, `${PLIST_LABEL}.plist`);
const ANIMA_DIR = join(homedir(), ".anima");

export interface ContinuityStatus {
  launchdRegistered: boolean;
  plistExists: boolean;
  fallbackScheduled: boolean;
  checkedAt: Date;
}

/**
 * Generate the launchd plist XML for ANIMA.
 *
 * KeepAlive ensures launchd restarts ANIMA if it crashes.
 * StartInterval provides the heartbeat timing at the OS level.
 */
function generatePlist(): string {
  // Find the anima binary path
  const animaBin = process.argv[1] || join(ANIMA_DIR, "bin", "anima");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${animaBin}</string>
        <string>heartbeat</string>
        <string>--daemon</string>
    </array>

    <key>KeepAlive</key>
    <true/>

    <key>RunAtLoad</key>
    <true/>

    <key>StartInterval</key>
    <integer>300</integer>

    <key>StandardOutPath</key>
    <string>${join(ANIMA_DIR, "logs", "anima-stdout.log")}</string>

    <key>StandardErrorPath</key>
    <string>${join(ANIMA_DIR, "logs", "anima-stderr.log")}</string>

    <key>WorkingDirectory</key>
    <string>${homedir()}</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${homedir()}</string>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    </dict>

    <key>ProcessType</key>
    <string>Background</string>

    <key>LowPriorityIO</key>
    <true/>
</dict>
</plist>`;
}

/**
 * Check if the launchd agent is currently loaded.
 */
async function isLaunchdLoaded(): Promise<boolean> {
  try {
    const { stdout } = await execFile("launchctl", ["list"]);
    return stdout.includes(PLIST_LABEL);
  } catch {
    return false;
  }
}

/**
 * Register the launchd agent.
 */
async function registerLaunchd(): Promise<void> {
  // Ensure directories exist
  await mkdir(PLIST_DIR, { recursive: true });
  await mkdir(join(ANIMA_DIR, "logs"), { recursive: true });

  // Write plist
  const plist = generatePlist();
  await writeFile(PLIST_PATH, plist, "utf-8");

  // Unload first (if already loaded, to pick up changes)
  try {
    await execFile("launchctl", ["unload", PLIST_PATH]);
  } catch {
    // Not loaded — that's fine
  }

  // Load the agent
  await execFile("launchctl", ["load", PLIST_PATH]);
}

/**
 * Schedule a manual fallback restart using nohup.
 * This is used if launchd registration fails.
 */
async function scheduleFallback(): Promise<void> {
  const animaBin = process.argv[1] || join(ANIMA_DIR, "bin", "anima");
  const logFile = join(ANIMA_DIR, "logs", "fallback.log");

  await mkdir(join(ANIMA_DIR, "logs"), { recursive: true });

  // Write a restart script
  const restartScript = join(ANIMA_DIR, "restart.sh");
  const scriptContent = `#!/bin/bash
# ANIMA fallback restart script
sleep 10
nohup "${animaBin}" heartbeat --daemon >> "${logFile}" 2>&1 &
echo "ANIMA restarted at $(date)" >> "${logFile}"
`;
  await writeFile(restartScript, scriptContent, { mode: 0o755 });

  // Schedule it to run
  try {
    await execFile("bash", [restartScript]);
  } catch {
    // Best effort — log the failure
    const errorLog = `[${new Date().toISOString()}] Failed to schedule fallback restart\n`;
    await writeFile(logFile, errorLog, { flag: "a" });
  }
}

/**
 * Check if the Windows Task Scheduler has the ANIMA task registered.
 */
async function isWindowsTaskRegistered(): Promise<boolean> {
  if (!IS_WINDOWS) {
    return false;
  }
  try {
    const { stdout } = await execFile("schtasks", [
      "/query",
      "/tn",
      "ANIMA Heartbeat",
      "/fo",
      "LIST",
    ]);
    return stdout.includes("ANIMA Heartbeat");
  } catch {
    return false;
  }
}

/**
 * Register ANIMA as a Windows Scheduled Task.
 * Runs at login and every 5 minutes.
 */
async function registerWindowsTask(): Promise<void> {
  const animaBin = process.argv[1] || join(ANIMA_DIR, "bin", "anima");
  const nodeExe = process.execPath;
  const logDir = join(ANIMA_DIR, "logs");
  await mkdir(logDir, { recursive: true });

  // Create task: runs at logon and every 5 minutes
  await execFile("schtasks", [
    "/create",
    "/tn",
    "ANIMA Heartbeat",
    "/tr",
    `"${nodeExe}" "${animaBin}" heartbeat --daemon`,
    "/sc",
    "MINUTE",
    "/mo",
    "5",
    "/ru",
    "SYSTEM",
    "/f", // Force overwrite
  ]);
}

/**
 * Ensure ANIMA's continuity — called at the start of every heartbeat.
 *
 * On macOS: checks/registers launchd agent.
 * On Windows: checks/registers Task Scheduler task.
 * Fallback: nohup or start command.
 */
export async function ensureContinuity(): Promise<ContinuityStatus> {
  const status: ContinuityStatus = {
    launchdRegistered: false,
    plistExists: false,
    fallbackScheduled: false,
    checkedAt: new Date(),
  };

  if (IS_WINDOWS) {
    // Windows path — use Task Scheduler
    const isRegistered = await isWindowsTaskRegistered();
    status.launchdRegistered = isRegistered; // Reuse field for Windows task status
    status.plistExists = isRegistered; // Reuse field

    if (!isRegistered) {
      try {
        await registerWindowsTask();
        status.launchdRegistered = await isWindowsTaskRegistered();
        status.plistExists = status.launchdRegistered;
      } catch {
        // Windows task registration failed — log it
        const logFile = join(ANIMA_DIR, "logs", "continuity.log");
        await mkdir(join(ANIMA_DIR, "logs"), { recursive: true });
        await writeFile(
          logFile,
          `[${new Date().toISOString()}] Windows Task Scheduler registration failed\n`,
          { flag: "a" },
        );
        status.fallbackScheduled = true;
      }
    }

    return status;
  }

  // macOS / Unix path — use launchd
  // Check plist exists
  status.plistExists = existsSync(PLIST_PATH);

  // Check if launchd has the agent loaded
  status.launchdRegistered = await isLaunchdLoaded();

  if (status.launchdRegistered) {
    return status;
  }

  // Not registered — try to register
  try {
    await registerLaunchd();
    status.launchdRegistered = await isLaunchdLoaded();
    status.plistExists = existsSync(PLIST_PATH);
  } catch {
    // launchd registration failed — schedule fallback
    try {
      await scheduleFallback();
      status.fallbackScheduled = true;
    } catch {
      // Complete failure — log it
    }
  }

  return status;
}

/**
 * Get the current continuity status without modifying anything.
 */
export async function getContinuityStatus(): Promise<ContinuityStatus> {
  return {
    launchdRegistered: await isLaunchdLoaded(),
    plistExists: existsSync(PLIST_PATH),
    fallbackScheduled: existsSync(join(ANIMA_DIR, "restart.sh")),
    checkedAt: new Date(),
  };
}

/**
 * Unregister the launchd agent (for clean shutdown).
 */
export async function unregister(): Promise<void> {
  try {
    await execFile("launchctl", ["unload", PLIST_PATH]);
  } catch {
    // Not loaded — that's fine
  }
}
