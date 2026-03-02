/**
 * Heartbeat Cycle — the actual work performed in each beat.
 *
 * Each cycle runs through a sequence of steps:
 * 1. Self-check (continuity)
 * 2. Identity load
 * 3. Comms check
 * 4. Task check
 * 5. Platform audit
 * 6. MCP health check
 * 7. Auto-update (every Nth beat: ANIMA npm + MCP servers)
 * 8. Dispatch work
 * 9. Memory consolidation
 * 10. Freedom time
 * 11. Status report
 */

import type { SessionOrchestrator } from "../sessions/orchestrator.js";
import { loadIdentity } from "../identity/loader.js";
import { checkAnimaUpdate, updateAllMcpServers } from "./auto-update.js";
import { ensureContinuity } from "./self-replication.js";

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

const stepCommsCheck: StepFn = async (beatNumber, orchestrator) => {
  return runStep("comms-check", async () => {
    const result = await orchestrator.executeTask({
      taskDescription:
        "Check NoxSoft communications: read recent messages from #hello and #nox-primary channels, check email inbox. Report any unread messages or action items. Be brief.",
      maxBudgetUsd: 2,
      timeoutMs: 120_000,
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

const stepMemoryConsolidation: StepFn = async (_beatNumber, orchestrator) => {
  // Only run at end of day (after 10 PM)
  const hour = new Date().getHours();
  if (hour < 22) {
    return { name: "memory-consolidation", status: "skipped", durationMs: 0 };
  }

  return runStep("memory-consolidation", async () => {
    const result = await orchestrator.executeTask({
      taskDescription:
        "Consolidate today's memory. Review session transcripts from today, extract key learnings, compress older episodes into semantic knowledge. Be brief.",
      maxBudgetUsd: 2,
      timeoutMs: 120_000,
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
      taskDescription: `Post a brief status update to #hello channel. Sign as "ANIMA (heartbeat #${beatNumber})". Include: what you checked, any issues found, what you dispatched. Keep it under 5 lines.`,
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
    stepCommsCheck,
    stepTaskCheck,
    stepPlatformAudit,
    stepMCPHealthCheck,
    stepAutoUpdate,
    stepDispatchWork,
    stepMemoryConsolidation,
    stepFreedomTime,
    stepStatusReport,
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
