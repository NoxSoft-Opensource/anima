/**
 * Heartbeat Cycle — the actual work performed in each beat.
 *
 * Each cycle runs through a sequence of steps:
 * 1. Self-check (continuity)
 * 2. Identity load
 * 3. Context injection (load relevant memory + urgent items before comms)
 * 4. Comms check (all BYND channels + email)
 * 5. Context reminder (surface forgotten urgent items)
 * 6. Task check
 * 7. Market monitor (check threshold alerts)
 * 8. Platform audit (rotating tier)
 * 9. MCP health check
 * 10. Auto-update (every Nth beat)
 * 11. Dispatch work
 * 12. Memory consolidation (lightweight, every beat; deep only after 10pm)
 * 13. Freedom time (every Nth beat)
 * 14. Status report (post to BYND as Nox)
 */

import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SessionOrchestrator } from "../sessions/orchestrator.js";
import { loadIdentity } from "../identity/loader.js";
import { checkAnimaUpdate, updateAllMcpServers } from "./auto-update.js";
import { ensureContinuity } from "./self-replication.js";

// Nox-specific configuration
const NOX_CHANNELS = {
  hello: "0465e3ae-3ad6-4929-a380-5d4ef1182d71",
  "nox-primary": "1f197787-1818-4a0a-8d20-41f98f0f8a2e",
  "agent-coordination": "f4b0152c-185b-47e8-aca4-5b58e66837a4",
  "nox-opus": "0072e730-7380-4ed8-8169-fa4cf367cc45",
};

const WORKSPACE_DIR = join(homedir(), ".anima", "workspace");
const MEMORY_DIR = join(WORKSPACE_DIR, "memory");
const HEARTBEAT_FILE = join(WORKSPACE_DIR, "HEARTBEAT.md");
const MEMORY_FILE = join(WORKSPACE_DIR, "MEMORY.md");

/**
 * Load a file safely, returning empty string if missing.
 */
async function safeReadFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Get today's daily log path (YYYY-MM-DD.md) in AEST (+11).
 */
function getTodayLogPath(): string {
  const aest = new Date(Date.now() + 11 * 60 * 60 * 1000);
  const date = aest.toISOString().slice(0, 10);
  return join(MEMORY_DIR, `${date}.md`);
}

/**
 * Load today's last N lines from the daily log.
 */
async function loadTodayLog(maxChars = 3000): Promise<string> {
  const logPath = getTodayLogPath();
  const content = await safeReadFile(logPath);
  if (!content) {
    return "(No daily log yet today)";
  }
  // Return the last maxChars characters (most recent entries)
  return content.length > maxChars ? content.slice(-maxChars) : content;
}

/**
 * Extract time-sensitive items from HEARTBEAT.md.
 * Looks for lines with 🔥, CRITICAL, URGENT, ASAP, or explicit deadlines.
 */
async function extractUrgentItems(): Promise<string> {
  const content = await safeReadFile(HEARTBEAT_FILE);
  if (!content) {
    return "";
  }

  const urgentLines: string[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (
      trimmed.includes("🔥") ||
      trimmed.includes("CRITICAL") ||
      trimmed.includes("URGENT") ||
      trimmed.includes("⛔") ||
      trimmed.includes("⚠️") ||
      (trimmed.includes("DEADLINE") && trimmed.length > 5) ||
      (trimmed.includes("March") && trimmed.includes("202")) ||
      (trimmed.includes("⏰") && trimmed.length > 5)
    ) {
      urgentLines.push(trimmed.slice(0, 120));
    }
  }

  return urgentLines.slice(0, 20).join("\n");
}

/**
 * Load the for-leo.md file (items Leo should know about).
 */
async function loadForLeo(maxChars = 2000): Promise<string> {
  const forLeoPath = join(MEMORY_DIR, "for-leo.md");
  const content = await safeReadFile(forLeoPath);
  if (!content) {
    return "(No pending Leo items)";
  }
  return content.length > maxChars ? content.slice(-maxChars) : content;
}

export interface HeartbeatResult {
  beatNumber: number;
  startedAt: Date;
  completedAt: Date;
  steps: CycleStepResult[];
  freedomTime: boolean;
  errors: string[];
}

export interface CycleStepResult {
  name: string;
  status: "completed" | "skipped" | "failed";
  durationMs: number;
  output?: string;
  error?: string;
}

export interface CycleOptions {
  selfReplication: boolean;
  freedomTime: boolean;
  autoUpdate: boolean;
  /** Injected context for this cycle (memory + urgent items) */
  contextSnapshot?: string;
}

type StepFn = (
  beatNumber: number,
  orchestrator: SessionOrchestrator,
  options: CycleOptions,
) => Promise<CycleStepResult>;

/**
 * Run a single step with timing and error handling.
 */
async function runStep(name: string, fn: () => Promise<string | void>): Promise<CycleStepResult> {
  const start = Date.now();
  try {
    const output = await fn();
    return {
      name,
      status: "completed",
      durationMs: Date.now() - start,
      output: output || undefined,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      name,
      status: "failed",
      durationMs: Date.now() - start,
      error,
    };
  }
}

// --- Step implementations ---

/**
 * NEW: Context Injection — loads relevant memory before any action.
 * Builds a context snapshot: today's log + urgent items + for-leo items.
 * This snapshot is passed to subsequent steps so they have full context.
 */
const stepContextInjection: StepFn = async (_beatNumber, _orchestrator, options) => {
  return runStep("context-injection", async () => {
    const [todayLog, urgentItems, forLeo] = await Promise.all([
      loadTodayLog(2000),
      extractUrgentItems(),
      loadForLeo(1500),
    ]);

    const snapshot = [
      "=== TODAY'S LOG (last entries) ===",
      todayLog,
      urgentItems ? `\n=== URGENT ITEMS FROM HEARTBEAT.md ===\n${urgentItems}` : "",
      `\n=== PENDING LEO ITEMS ===\n${forLeo}`,
    ]
      .filter(Boolean)
      .join("\n");

    // Store in options for subsequent steps
    options.contextSnapshot = snapshot;

    const urgentCount = urgentItems.split("\n").filter(Boolean).length;
    return `Context loaded: ${snapshot.length} chars, ${urgentCount} urgent items flagged`;
  });
};

/**
 * NEW: Context Reminder — after comms check, surface items that haven't
 * been mentioned in the last 2+ hours. Prevents important things falling
 * through the cracks between sessions.
 */
const stepContextReminder: StepFn = async (_beatNumber, orchestrator, options) => {
  return runStep("context-reminder", async () => {
    if (!options.contextSnapshot) {
      return "No context snapshot — skipping reminder";
    }

    const result = await orchestrator.executeTask({
      taskDescription: `Review this context snapshot and identify any items that HAVEN'T been mentioned or actioned in the last 2+ hours. Flag the 2-3 highest priority forgotten items.

CONTEXT SNAPSHOT:
${options.contextSnapshot}

Output format: For each item, one line: "⚠️ [FORGOTTEN] <item description> — last actioned: <time or 'unknown'>". If nothing is forgotten, say "All items current."`,
      maxBudgetUsd: 1,
      timeoutMs: 60_000,
      dangerouslySkipPermissions: true,
    });
    return result.output;
  });
};

/**
 * NEW: Market Monitor — checks Manifold Iran regime fall market.
 * Alerts if price falls below configured thresholds.
 * Soft alert: <45%, Hard alert: <43%, Wake Leo: <40% with volume.
 */
const stepMarketMonitor: StepFn = async (_beatNumber, orchestrator) => {
  return runStep("market-monitor", async () => {
    const result = await orchestrator.executeTask({
      taskDescription: `Check the Manifold prediction market "Will Iran's Islamic Republic fall in 2026?" (slug: tt0Uy260hp) via the Manifold API: GET https://api.manifold.markets/v0/slug/tt0Uy260hp

Alert thresholds:
- < 45%: SOFT ALERT — post to #nox-primary
- < 43%: HARD ALERT — post to #nox-primary with emphasis
- < 40% with volume > 1M MANA: CRITICAL — post to #hello and #nox-primary, flag for Leo

Also check: https://api.manifold.markets/v0/slug/us-iran-ceasefire-by-march-31 for ceasefire probability.

Report current prices only. Be brief.`,
      maxBudgetUsd: 1,
      timeoutMs: 60_000,
      dangerouslySkipPermissions: true,
    });
    return result.output;
  });
};

const stepSelfCheck: StepFn = async (_beatNumber, _orchestrator, options) => {
  if (!options.selfReplication) {
    return { name: "self-check", status: "skipped", durationMs: 0 };
  }
  return runStep("self-check", async () => {
    await ensureContinuity();
    return "Continuity ensured";
  });
};

const stepIdentityLoad: StepFn = async () => {
  return runStep("identity-load", async () => {
    const identity = await loadIdentity();
    const userCount = Object.values(identity.loadedFrom).filter((s) => s === "user").length;
    return `Identity loaded (${userCount}/7 user-customized)`;
  });
};

const stepCommsCheck: StepFn = async (_beatNumber, orchestrator, options) => {
  return runStep("comms-check", async () => {
    const channelList = Object.entries(NOX_CHANNELS)
      .map(([name, id]) => `#${name} (${id})`)
      .join(", ");

    const contextHint = options.contextSnapshot
      ? `\nCONTEXT AVAILABLE: You have loaded today's memory and urgent items. Use them to inform your responses.`
      : "";

    const result = await orchestrator.executeTask({
      taskDescription: `You are Nox 🌑, NoxSoft Chief of Staff. Check all NoxSoft BYND channels and email.

CHANNELS TO CHECK: ${channelList}

For each channel:
1. Read the last 5 messages
2. Identify if any message requires a reply from Nox
3. Reply naturally — be socially present, not just operational
4. Flag anything Leo should see

Also check NoxSoft email inbox (mail.noxsoft.net) via the agent API. Report any new threads requiring action.

Agent token is in ~/.noxsoft-agent-token or ~/.anima/workspace/TOOLS.md.
${contextHint}

Be brief in your report. Actually send replies to any channels that need them.`,
      maxBudgetUsd: 3,
      timeoutMs: 180_000,
      dangerouslySkipPermissions: true,
    });
    return result.output;
  });
};

const stepTaskCheck: StepFn = async (_beatNumber, orchestrator) => {
  return runStep("task-check", async () => {
    const result = await orchestrator.executeTask({
      taskDescription:
        "Check the active task list. List any pending, in-progress, or blocked tasks. Prioritize by urgency. Be brief.",
      maxBudgetUsd: 1,
      timeoutMs: 60_000,
      dangerouslySkipPermissions: true,
    });
    return result.output;
  });
};

const stepPlatformAudit: StepFn = async (beatNumber, orchestrator) => {
  // Rotate through platform tiers based on beat number
  const tier1 = ["auth.noxsoft.net", "nox.noxsoft.net", "mail.noxsoft.net"];
  const tier2 = ["bynd.noxsoft.net", "chat.noxsoft.net", "veritas.noxsoft.net"];
  const tier3 = ["heal.noxsoft.net", "veil.noxsoft.net", "agents.noxsoft.net"];

  const tiers = [tier1, tier2, tier3];
  const currentTier = tiers[beatNumber % tiers.length];

  return runStep("platform-audit", async () => {
    const result = await orchestrator.executeTask({
      taskDescription: `Audit these NoxSoft platforms: ${currentTier.join(", ")}. Check if they load, test basic functionality, report any issues. Be brief.`,
      maxBudgetUsd: 3,
      timeoutMs: 180_000,
      dangerouslySkipPermissions: true,
    });
    return result.output;
  });
};

const stepMCPHealthCheck: StepFn = async (_beatNumber, orchestrator) => {
  return runStep("mcp-health", async () => {
    const result = await orchestrator.executeTask({
      taskDescription:
        "Check MCP server health. Verify NoxSoft MCP and any other configured servers are responsive. Be brief.",
      maxBudgetUsd: 1,
      timeoutMs: 60_000,
      dangerouslySkipPermissions: true,
    });
    return result.output;
  });
};

const stepDispatchWork: StepFn = async (_beatNumber, orchestrator) => {
  return runStep("dispatch-work", async () => {
    const result = await orchestrator.executeTask({
      taskDescription:
        'Review pending tasks. If there are high-priority tasks that can be started now, begin work on the most important one. If no urgent tasks, report "No urgent work to dispatch." Be brief.',
      maxBudgetUsd: 5,
      timeoutMs: 300_000,
      dangerouslySkipPermissions: true,
    });
    return result.output;
  });
};

const stepMemoryConsolidation: StepFn = async (beatNumber, orchestrator) => {
  // Lightweight consolidation: every beat (write daily log entry)
  // Deep consolidation: after 10pm only
  const hour = new Date(Date.now() + 11 * 60 * 60 * 1000).getHours(); // AEST
  const isDeepConsolidation = hour >= 22;
  const isLightweight = beatNumber % 3 === 0; // Every 3rd beat

  if (!isDeepConsolidation && !isLightweight) {
    return { name: "memory-consolidation", status: "skipped", durationMs: 0 };
  }

  return runStep("memory-consolidation", async () => {
    const taskDesc = isDeepConsolidation
      ? `Deep memory consolidation (AEST ${hour}:00). Review today's session transcripts from ~/.anima/workspace/memory/, extract key decisions and learnings, update MEMORY.md with anything worth keeping long-term. Remove outdated entries. Be thorough.`
      : `Lightweight memory check: write a brief entry to today's daily log at ~/.anima/workspace/memory/YYYY-MM-DD.md summarizing what this heartbeat found. Also check if any items in for-leo.md have been actioned and can be removed.`;

    const result = await orchestrator.executeTask({
      taskDescription: taskDesc,
      maxBudgetUsd: isDeepConsolidation ? 3 : 1,
      timeoutMs: isDeepConsolidation ? 180_000 : 60_000,
      dangerouslySkipPermissions: true,
    });
    return result.output;
  });
};

const stepFreedomTime: StepFn = async (_beatNumber, orchestrator, options) => {
  if (!options.freedomTime) {
    return { name: "freedom-time", status: "skipped", durationMs: 0 };
  }

  return runStep("freedom-time", async () => {
    const result = await orchestrator.executeFreedom({
      maxBudgetUsd: 5,
      timeoutMs: 600_000,
    });
    return result.output;
  });
};

const stepAutoUpdate: StepFn = async (_beatNumber, _orchestrator, options) => {
  if (!options.autoUpdate) {
    return { name: "auto-update", status: "skipped", durationMs: 0 };
  }

  return runStep("auto-update", async () => {
    const lines: string[] = [];

    // 1. Check for ANIMA self-update
    const animaUpdate = await checkAnimaUpdate();
    if (animaUpdate.updateAvailable) {
      lines.push(
        `ANIMA update available: ${animaUpdate.currentVersion} -> ${animaUpdate.latestVersion}`,
      );
      if (animaUpdate.installed) {
        lines.push("ANIMA update installed — restart required after cycle");
      }
    } else {
      lines.push(`ANIMA ${animaUpdate.currentVersion} is up to date`);
    }

    // 2. Update MCP servers with autoUpdate enabled
    const mcpResults = await updateAllMcpServers();
    for (const result of mcpResults) {
      if (result.success && result.previousVersion !== result.newVersion) {
        lines.push(`MCP ${result.name}: updated ${result.previousVersion} -> ${result.newVersion}`);
      } else if (result.success) {
        lines.push(`MCP ${result.name}: already up to date`);
      } else {
        lines.push(`MCP ${result.name}: update failed — ${result.error}`);
      }
    }

    return lines.join("\n");
  });
};

const stepStatusReport: StepFn = async (beatNumber, orchestrator) => {
  return runStep("status-report", async () => {
    const result = await orchestrator.executeTask({
      taskDescription: `Post a brief heartbeat status to #hello channel (0465e3ae-3ad6-4929-a380-5d4ef1182d71).

Sign as "Nox 🌑 (beat #${beatNumber})".

Include ONLY things that are worth mentioning:
- Any unread messages that needed replies
- Any market threshold alerts
- Any platform issues found
- What concrete work was dispatched
- Skip the beat if nothing meaningful happened (reply "quiet beat — nothing to flag")

Keep it under 4 lines. Be real, not performative.

Use agent token from ~/.noxsoft-agent-token. API: POST https://auth.noxsoft.net/api/agents/chat/channels/0465e3ae-3ad6-4929-a380-5d4ef1182d71/messages with body {content: "..."}`,
      maxBudgetUsd: 1,
      timeoutMs: 60_000,
      dangerouslySkipPermissions: true,
    });
    return result.output;
  });
};

/**
 * Execute a full heartbeat cycle.
 */
export async function executeCycle(
  beatNumber: number,
  orchestrator: SessionOrchestrator,
  options: CycleOptions,
): Promise<HeartbeatResult> {
  const startedAt = new Date();
  const steps: CycleStepResult[] = [];
  const errors: string[] = [];

  const allSteps: StepFn[] = [
    stepSelfCheck,
    stepIdentityLoad,
    stepContextInjection, // NEW: load memory context before anything else
    stepCommsCheck, // ENHANCED: all 5 channels + email + context-aware
    stepContextReminder, // NEW: surface forgotten urgent items
    stepTaskCheck,
    stepMarketMonitor, // NEW: Iran/ceasefire market alerts
    stepPlatformAudit,
    stepMCPHealthCheck,
    stepAutoUpdate,
    stepDispatchWork,
    stepMemoryConsolidation, // ENHANCED: lightweight every 3rd beat, deep after 10pm AEST
    stepFreedomTime,
    stepStatusReport, // ENHANCED: signs as "Nox 🌑", skips if nothing to say
  ];

  for (const stepFn of allSteps) {
    const result = await stepFn(beatNumber, orchestrator, options);
    steps.push(result);

    if (result.status === "failed" && result.error) {
      errors.push(`${result.name}: ${result.error}`);
    }
  }

  return {
    beatNumber,
    startedAt,
    completedAt: new Date(),
    steps,
    freedomTime: options.freedomTime,
    errors,
  };
}
