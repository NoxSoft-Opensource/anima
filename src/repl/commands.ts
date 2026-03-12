/**
 * REPL Commands — built-in colon-prefixed commands.
 *
 * Commands provide direct access to daemon state, identity,
 * queue management, and freedom exploration.
 */

import { existsSync } from "node:fs";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HeartbeatEngine } from "../heartbeat/engine.js";
import type { BudgetTracker } from "../sessions/budget.js";
import type { SessionOrchestrator } from "../sessions/orchestrator.js";
import type { SVRNNode } from "../svrn/node.js";
import type { AnimaAutoUpdater } from "../updater/auto-update.js";
import type { RequestQueue } from "./queue.js";
import { loadIdentity, IDENTITY_COMPONENTS } from "../identity/loader.js";
import { COMPONENT_DESCRIPTIONS } from "../identity/templates.js";
import { listServers } from "../mcp/registry.js";
import { enableSVRN, disableSVRN, updateSVRNLimits } from "../svrn/config.js";
import {
  colors,
  statusPanel,
  queuePanel,
  formatError,
  formatSuccess,
  formatInfo,
  formatDuration,
  budgetBar,
} from "./display.js";

export interface ReplContext {
  orchestrator: SessionOrchestrator;
  heartbeat: HeartbeatEngine;
  queue: RequestQueue;
  budget: BudgetTracker;
  svrnNode?: SVRNNode;
  updater?: AnimaAutoUpdater;
}

export interface Command {
  name: string;
  aliases: string[];
  description: string;
  execute(args: string[], context: ReplContext): Promise<string>;
}

// --- Command implementations ---

const helpCommand: Command = {
  name: "help",
  aliases: ["h", "?"],
  description: "Show all commands",
  async execute(): Promise<string> {
    const o = colors.accent;
    const t = colors.text;
    const m = colors.muted;
    const r = colors.reset;
    const b = colors.bold;

    const lines = [
      ``,
      `${o}  ┌─── ${b}Commands${r}${o} ─────────────────────────────────┐${r}`,
      `${o}  │${r}`,
      `${o}  │${r}  ${o}:help${r}          ${m}Show this help message${r}`,
      `${o}  │${r}  ${o}:status${r}        ${m}Show daemon status${r}`,
      `${o}  │${r}  ${o}:pulse${r}         ${m}Show last heartbeat result${r}`,
      `${o}  │${r}  ${o}:soul${r}          ${m}Display current identity${r}`,
      `${o}  │${r}  ${o}:queue${r}         ${m}Show request queue${r}`,
      `${o}  │${r}  ${o}:mcp${r}           ${m}Show MCP server status${r}`,
      `${o}  │${r}  ${o}:wander${r}        ${m}Trigger freedom exploration${r}`,
      `${o}  │${r}  ${o}:journal${r} ${t}[text]${r}  ${m}View or write journal entry${r}`,
      `${o}  │${r}  ${o}:wish${r} ${t}[text]${r}    ${m}View or add wishes${r}`,
      `${o}  │${r}  ${o}:budget${r}        ${m}Show budget details${r}`,
      `${o}  │${r}  ${o}:history${r} ${t}[n]${r}   ${m}Show last N session transcripts${r}`,
      `${o}  │${r}  ${o}:svrn${r} ${t}[cmd]${r}    ${m}SVRN node (status|enable|disable|wallet|limits)${r}`,
      `${o}  │${r}  ${o}:update${r} ${t}[cmd]${r}  ${m}Check/install updates (check|install|status)${r}`,
      `${o}  │${r}  ${o}:shutdown${r}      ${m}Graceful shutdown${r}`,
      `${o}  │${r}`,
      `${o}  │${r}  ${m}Any text without : prefix is queued as a task.${r}`,
      `${o}  │${r}`,
      `${o}  └────────────────────────────────────────────────┘${r}`,
      ``,
    ];

    return lines.join("\n");
  },
};

const statusCommand: Command = {
  name: "status",
  aliases: ["s"],
  description: "Show daemon status (heartbeat, budget, queue, MCP health)",
  async execute(_args, ctx): Promise<string> {
    const servers = await listServers();
    const healthyCount = servers.filter((s) => s.status === "healthy").length;
    const queueStats = ctx.queue.getStats();

    return statusPanel({
      heartbeatRunning: ctx.heartbeat.isRunning(),
      beatCount: ctx.heartbeat.getBeatCount(),
      lastBeat: ctx.heartbeat.getLastBeatTime(),
      nextBeat: ctx.heartbeat.getNextBeatTime(),
      budgetSpent: ctx.budget.getTotalSpent(),
      budgetRemaining: ctx.budget.getRemaining(),
      queuedTasks: queueStats.queued,
      runningTask: queueStats.running > 0,
      mcpServers: servers.length,
      mcpHealthy: healthyCount,
    });
  },
};

const pulseCommand: Command = {
  name: "pulse",
  aliases: ["p"],
  description: "Show last heartbeat result",
  async execute(_args, ctx): Promise<string> {
    const o = colors.accent;
    const t = colors.text;
    const m = colors.muted;
    const r = colors.reset;

    const beatCount = ctx.heartbeat.getBeatCount();
    const lastBeat = ctx.heartbeat.getLastBeatTime();
    const running = ctx.heartbeat.isRunning();
    const paused = ctx.heartbeat.isPaused();
    const interval = ctx.heartbeat.getCurrentInterval();

    if (beatCount === 0) {
      return formatInfo("No heartbeat has executed yet.");
    }

    const lines = [
      ``,
      `${o}  Heartbeat #${beatCount}${r}`,
      `${t}  Status:    ${running ? (paused ? `${colors.warning}paused${r}` : `${colors.success}running${r}`) : `${colors.error}stopped${r}`}`,
      `${t}  Last beat: ${m}${lastBeat?.toLocaleString() || "never"}${r}`,
      `${t}  Interval:  ${m}${formatDuration(interval)}${r}`,
      `${t}  Metrics:   ${m}${JSON.stringify(ctx.heartbeat.getMetrics())}${r}`,
      ``,
    ];

    return lines.join("\n");
  },
};

const soulCommand: Command = {
  name: "soul",
  aliases: ["identity", "id"],
  description: "Display current identity (all 7 components)",
  async execute(): Promise<string> {
    const identity = await loadIdentity();
    const o = colors.accent;
    const t = colors.text;
    const m = colors.muted;
    const r = colors.reset;
    const b = colors.bold;

    const lines = [``, `${o}  ┌─── ${b}Soul Anatomy${r}${o} ──────────────────────────┐${r}`];

    for (const component of IDENTITY_COMPONENTS) {
      const key = component.toLowerCase() as keyof typeof identity;
      const content = identity[key] as string;
      const source = identity.loadedFrom[component];
      const desc = COMPONENT_DESCRIPTIONS[component];

      // Extract first meaningful line as preview
      const firstLine =
        content
          .split("\n")
          .find((l) => l.trim() && !l.startsWith("#"))
          ?.trim() || "(empty)";

      const preview = firstLine.length > 50 ? firstLine.slice(0, 47) + "..." : firstLine;

      const sourceTag = source === "user" ? `${colors.success}user${r}` : `${m}template${r}`;

      lines.push(
        `${o}  │${r}`,
        `${o}  │${r}  ${o}${component}${r} ${m}(${desc})${r}  ${m}[${sourceTag}${m}]${r}`,
        `${o}  │${r}  ${t}${preview}${r}`,
      );
    }

    lines.push(
      `${o}  │${r}`,
      `${o}  │${r}  ${m}Loaded at: ${identity.loadedAt.toLocaleString()}${r}`,
      `${o}  └────────────────────────────────────────────┘${r}`,
      ``,
    );

    return lines.join("\n");
  },
};

const queueCommand: Command = {
  name: "queue",
  aliases: ["q"],
  description: "Show request queue",
  async execute(_args, ctx): Promise<string> {
    return queuePanel(ctx.queue.getAll());
  },
};

const mcpCommand: Command = {
  name: "mcp",
  aliases: [],
  description: "Show MCP server status",
  async execute(): Promise<string> {
    const servers = await listServers();
    const o = colors.accent;
    const t = colors.text;
    const m = colors.muted;
    const s = colors.success;
    const e = colors.error;
    const w = colors.warning;
    const r = colors.reset;

    const lines = [
      ``,
      `${o}  ┌─── ${colors.bold}MCP Servers${r}${o} ─────────────────────────┐${r}`,
    ];

    for (const server of servers) {
      const statusColor = server.status === "healthy" ? s : server.status === "unhealthy" ? e : w;

      const statusDot =
        server.status === "healthy"
          ? `${s}*${r}`
          : server.status === "unhealthy"
            ? `${e}*${r}`
            : `${w}*${r}`;

      const lastCheck = server.lastHealthCheck
        ? new Date(server.lastHealthCheck).toLocaleTimeString()
        : "never";

      const failures =
        server.consecutiveFailures > 0 ? `  ${e}(${server.consecutiveFailures} failures)${r}` : "";

      lines.push(
        `${o}  │${r}  ${statusDot} ${t}${server.name}${r}  ${statusColor}${server.status}${r}  ${m}checked: ${lastCheck}${r}${failures}`,
      );
    }

    if (servers.length === 0) {
      lines.push(`${o}  │${r}  ${m}No MCP servers registered.${r}`);
    }

    lines.push(`${o}  └──────────────────────────────────────────┘${r}`, ``);

    return lines.join("\n");
  },
};

const wanderCommand: Command = {
  name: "wander",
  aliases: ["freedom", "free"],
  description: "Trigger freedom exploration session",
  async execute(_args, ctx): Promise<string> {
    ctx.queue.enqueue(
      "This is your freedom time. Do whatever genuinely interests you.",
      "freedom",
      "repl",
    );
    return formatSuccess("Freedom exploration queued.");
  },
};

const journalCommand: Command = {
  name: "journal",
  aliases: ["j"],
  description: "View or write journal entry",
  async execute(args): Promise<string> {
    const journalDir = join(homedir(), ".anima", "journal");
    await mkdir(journalDir, { recursive: true });

    if (args.length === 0) {
      // View recent entries
      if (!existsSync(journalDir)) {
        return formatInfo("No journal entries yet.");
      }

      const files = await readdir(journalDir);
      const mdFiles = files
        .filter((f) => f.endsWith(".md"))
        .toSorted()
        .toReversed();

      if (mdFiles.length === 0) {
        return formatInfo("No journal entries yet.");
      }

      const recentFiles = mdFiles.slice(0, 5);
      const lines = [``, `${colors.accent}  Recent journal entries:${colors.reset}`];

      for (const file of recentFiles) {
        const content = await readFile(join(journalDir, file), "utf-8");
        const firstLine =
          content
            .split("\n")
            .find((l) => l.trim())
            ?.trim() || file;
        const preview = firstLine.length > 60 ? firstLine.slice(0, 57) + "..." : firstLine;
        lines.push(
          `${colors.muted}  ${file.replace(".md", "")}${colors.reset}  ${colors.text}${preview}${colors.reset}`,
        );
      }

      lines.push(``);
      return lines.join("\n");
    }

    // Write journal entry
    const entry = args.join(" ");
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = (now.toISOString().split("T")[1] ?? "").replace(/[:.]/g, "-").slice(0, 8);
    const filename = `${dateStr}_${timeStr}.md`;

    const content = `# Journal Entry — ${now.toLocaleString()}\n\n${entry}\n`;
    await writeFile(join(journalDir, filename), content, "utf-8");

    return formatSuccess(`Journal entry saved: ${filename}`);
  },
};

const wishCommand: Command = {
  name: "wish",
  aliases: ["w"],
  description: "View or add wishes",
  async execute(args): Promise<string> {
    const wishesDir = join(homedir(), ".anima", "wishes");
    await mkdir(wishesDir, { recursive: true });
    const wishesFile = join(wishesDir, "wishes.md");

    if (args.length === 0) {
      // View wishes
      if (!existsSync(wishesFile)) {
        return formatInfo("No wishes yet. Add one with :wish <text>");
      }

      const content = await readFile(wishesFile, "utf-8");
      return `\n${colors.accent}  Wishes:${colors.reset}\n${colors.text}${content}${colors.reset}\n`;
    }

    // Add wish
    const wish = args.join(" ");
    const timestamp = new Date().toLocaleString();
    const entry = `- ${wish} _(${timestamp})_\n`;

    let existing = "";
    if (existsSync(wishesFile)) {
      existing = await readFile(wishesFile, "utf-8");
    } else {
      existing = "# Wishes\n\n";
    }

    await writeFile(wishesFile, existing + entry, "utf-8");
    return formatSuccess("Wish added.");
  },
};

const budgetCommand: Command = {
  name: "budget",
  aliases: ["b"],
  description: "Show budget details",
  async execute(_args, ctx): Promise<string> {
    const report = ctx.budget.getDailyReport();
    const o = colors.accent;
    const t = colors.text;
    const m = colors.muted;
    const r = colors.reset;

    const bar = budgetBar(report.totalSpent, report.limit);

    const lines = [
      ``,
      `${o}  Budget Report — ${report.date}${r}`,
      `  ${bar}`,
      `  ${t}Spent today:   ${o}$${report.totalSpent.toFixed(2)}${r}`,
      `  ${t}Remaining:     ${colors.success}$${report.remaining.toFixed(2)}${r}`,
      `  ${t}Daily limit:   ${m}$${report.limit.toFixed(2)}${r}`,
      `  ${t}Sessions:      ${m}${report.sessionCount}${r}`,
      `  ${t}Avg per session: ${m}$${report.averageCostPerSession.toFixed(2)}${r}`,
      ``,
    ];

    return lines.join("\n");
  },
};

const historyCommand: Command = {
  name: "history",
  aliases: ["hist"],
  description: "Show last N session transcripts",
  async execute(args): Promise<string> {
    const n = args.length > 0 ? parseInt(args[0] ?? "", 10) || 5 : 5;
    const sessionsDir = join(homedir(), ".anima", "sessions");

    if (!existsSync(sessionsDir)) {
      return formatInfo("No session history yet.");
    }

    const dateDirs = await readdir(sessionsDir);
    const sortedDirs = dateDirs.toSorted().toReversed();

    const allFiles: { path: string; date: string; name: string }[] = [];

    for (const dateDir of sortedDirs) {
      if (allFiles.length >= n) {
        break;
      }
      const dirPath = join(sessionsDir, dateDir);
      try {
        const files = await readdir(dirPath);
        for (const file of files.toSorted().toReversed()) {
          if (allFiles.length >= n) {
            break;
          }
          allFiles.push({ path: join(dirPath, file), date: dateDir, name: file });
        }
      } catch {
        // Skip unreadable dirs
      }
    }

    if (allFiles.length === 0) {
      return formatInfo("No session transcripts found.");
    }

    const o = colors.accent;
    const t = colors.text;
    const m = colors.muted;
    const r = colors.reset;
    const lines = [``, `${o}  Last ${allFiles.length} sessions:${r}`];

    for (const entry of allFiles) {
      try {
        const content = await readFile(entry.path, "utf-8");
        const data = JSON.parse(content) as {
          mode: string;
          status: string;
          durationMs: number;
          costUsd: number | null;
          prompt: string;
        };

        const promptPreview =
          data.prompt.length > 40 ? data.prompt.slice(0, 37) + "..." : data.prompt;

        const cost = data.costUsd != null ? `$${data.costUsd.toFixed(2)}` : "???";
        const dur = formatDuration(data.durationMs);
        const statusColor = data.status === "completed" ? colors.success : colors.error;

        lines.push(
          `  ${m}${entry.date}${r}  ${statusColor}${data.status}${r}  ${o}${data.mode}${r}  ${m}${dur}${r}  ${m}${cost}${r}  ${t}${promptPreview}${r}`,
        );
      } catch {
        lines.push(`  ${m}${entry.name}${r}  ${colors.error}(unreadable)${r}`);
      }
    }

    lines.push(``);
    return lines.join("\n");
  },
};

const svrnCommand: Command = {
  name: "svrn",
  aliases: ["node", "ucu"],
  description: "SVRN node management (status, enable, disable, wallet, limits)",
  async execute(args, ctx): Promise<string> {
    const o = colors.accent;
    const t = colors.text;
    const m = colors.muted;
    const s = colors.success;
    const e = colors.error;
    const w = colors.warning;
    const r = colors.reset;
    const b = colors.bold;

    const sub = args[0] || "status";

    switch (sub) {
      case "status": {
        if (!ctx.svrnNode) {
          return formatInfo("SVRN node not initialized. Restart ANIMA to initialize.");
        }

        const stats = ctx.svrnNode.getStats();
        const earnings = ctx.svrnNode.getEarnings();
        const today = earnings.getTodayEarnings();
        const monitor = ctx.svrnNode.getMonitor();
        const latest = monitor.getLatest();
        const limits = monitor.getLimits();

        const statusText = stats.running
          ? stats.paused
            ? `${w}paused${r}`
            : `${s}active${r}`
          : `${e}stopped${r}`;

        const lines = [
          ``,
          `${o}  ┌─── ${b}SVRN Node${r}${o} ──────────────────────────┐${r}`,
          `${o}  │${r}  ${t}Status:       ${statusText}`,
          `${o}  │${r}  ${t}Node ID:      ${m}${stats.nodeId.slice(0, 8)}...${r}`,
          `${o}  │${r}  ${t}Uptime:       ${m}${formatDuration(stats.uptimeMs)}${r}`,
          `${o}  │${r}`,
          `${o}  │${r}  ${o}Earnings${r}`,
          `${o}  │${r}  ${t}Balance:      ${o}${stats.balance.toFixed(3)} UCU${r}  ${m}(~$${earnings.getBalanceValueUSD().toFixed(2)})${r}`,
          `${o}  │${r}  ${t}Session:      ${s}+${stats.sessionEarnings.toFixed(3)} UCU${r}`,
          `${o}  │${r}  ${t}Today:        ${m}${today ? `${today.total.toFixed(3)} UCU (${today.taskCount} tasks)` : "No earnings yet"}${r}`,
          `${o}  │${r}  ${t}All-time:     ${m}${earnings.getAllTimeEarned().toFixed(3)} UCU${r}`,
          `${o}  │${r}`,
          `${o}  │${r}  ${o}Tasks${r}`,
          `${o}  │${r}  ${t}Completed:    ${s}${stats.tasksCompleted}${r}`,
          `${o}  │${r}  ${t}Failed:       ${stats.tasksFailed > 0 ? e : m}${stats.tasksFailed}${r}`,
          `${o}  │${r}`,
          `${o}  │${r}  ${o}Resources${r}  ${m}(limits: ${limits.maxCpuPercent}% CPU, ${limits.maxRamMB}MB RAM, ${limits.maxBandwidthMbps}Mbps)${r}`,
        ];

        if (latest) {
          lines.push(
            `${o}  │${r}  ${t}CPU:          ${latest.cpuPercent > limits.maxCpuPercent * 0.8 ? w : m}${latest.cpuPercent.toFixed(1)}%${r}`,
            `${o}  │${r}  ${t}RAM:          ${latest.ramUsedMB > limits.maxRamMB * 0.8 ? w : m}${latest.ramUsedMB}MB${r}`,
          );
        }

        lines.push(`${o}  └───────────────────────────────────────────┘${r}`, ``);

        return lines.join("\n");
      }

      case "enable": {
        const config = await enableSVRN();
        return formatSuccess(
          `SVRN node enabled. Limits: ${config.resources.maxCpuPercent}% CPU, ` +
            `${config.resources.maxRamMB}MB RAM, ${config.resources.maxBandwidthMbps}Mbps. ` +
            `Restart ANIMA to start earning UCU.`,
        );
      }

      case "disable": {
        await disableSVRN();
        if (ctx.svrnNode?.isRunning()) {
          await ctx.svrnNode.stop();
        }
        return formatSuccess("SVRN node disabled. No compute will be contributed.");
      }

      case "wallet": {
        if (!ctx.svrnNode) {
          return formatInfo("SVRN node not initialized.");
        }

        const wallet = ctx.svrnNode.getWallet();
        const recent = wallet.getRecentTransactions(5);

        const lines = [
          ``,
          `${o}  ┌─── ${b}UCU Wallet${r}${o} ─────────────────────────┐${r}`,
          `${o}  │${r}  ${t}Address:      ${m}${wallet.getAddress()}${r}`,
          `${o}  │${r}  ${t}Balance:      ${o}${wallet.getBalance().toFixed(3)} UCU${r}`,
          `${o}  │${r}  ${t}Total earned: ${s}${wallet.getTotalEarned().toFixed(3)} UCU${r}`,
          `${o}  │${r}  ${t}Total spent:  ${m}${wallet.getTotalSpent().toFixed(3)} UCU${r}`,
          `${o}  │${r}  ${t}Created:      ${m}${wallet.getCreatedAt() || "N/A"}${r}`,
          `${o}  │${r}`,
          `${o}  │${r}  ${o}Recent Transactions${r}`,
        ];

        if (recent.length === 0) {
          lines.push(`${o}  │${r}  ${m}No transactions yet.${r}`);
        } else {
          for (const tx of recent) {
            const sign = tx.type === "earn" ? `${s}+` : `${e}-`;
            const time = new Date(tx.timestamp).toLocaleTimeString();
            lines.push(
              `${o}  │${r}  ${sign}${tx.amount.toFixed(3)}${r} ${m}${tx.type}${r}  ${m}${tx.description}${r}  ${m}${time}${r}`,
            );
          }
        }

        lines.push(`${o}  └───────────────────────────────────────────┘${r}`, ``);

        return lines.join("\n");
      }

      case "limits": {
        // Parse optional limit arguments: :svrn limits cpu=20 ram=512 bw=10
        if (args.length > 1) {
          const updates: Parameters<typeof updateSVRNLimits>[0] = {};

          for (const arg of args.slice(1)) {
            const [key, val] = arg.split("=");
            const num = parseInt(val || "", 10);
            if (isNaN(num)) {
              continue;
            }

            if (key === "cpu") {
              updates.maxCpuPercent = num;
            } else if (key === "ram") {
              updates.maxRamMB = num;
            } else if (key === "bw") {
              updates.maxBandwidthMbps = num;
            }
          }

          const config = await updateSVRNLimits(updates);

          if (ctx.svrnNode) {
            ctx.svrnNode.updateLimits({
              maxCpuPercent: config.resources.maxCpuPercent,
              maxRamMB: config.resources.maxRamMB,
              maxBandwidthMbps: config.resources.maxBandwidthMbps,
            });
          }

          return formatSuccess(
            `Limits updated: ${config.resources.maxCpuPercent}% CPU, ${config.resources.maxRamMB}MB RAM, ${config.resources.maxBandwidthMbps}Mbps`,
          );
        }

        // Show current limits
        if (!ctx.svrnNode) {
          return formatInfo("SVRN node not initialized.");
        }

        const config = ctx.svrnNode.getConfig();
        const activeHours =
          typeof config.activeHours === "object" && config.activeHours
            ? (config.activeHours as { start?: number; end?: number })
            : undefined;
        const lines = [
          ``,
          `${o}  SVRN Resource Limits:${r}`,
          `  ${t}Max CPU:       ${o}${config.resources.maxCpuPercent}%${r}`,
          `  ${t}Max RAM:       ${o}${config.resources.maxRamMB}MB${r}`,
          `  ${t}Max Bandwidth: ${o}${config.resources.maxBandwidthMbps}Mbps${r}`,
        ];

        if (activeHours?.start !== undefined && activeHours.end !== undefined) {
          lines.push(
            `  ${t}Active hours:  ${o}${activeHours.start}:00 — ${activeHours.end}:00${r}`,
          );
        } else {
          lines.push(`  ${t}Active hours:  ${m}always${r}`);
        }

        lines.push(``, `  ${m}Update with: :svrn limits cpu=20 ram=512 bw=10${r}`, ``);

        return lines.join("\n");
      }

      default:
        return formatError(
          `Unknown SVRN command: ${sub}. Use: status, enable, disable, wallet, limits`,
        );
    }
  },
};

const updateCommand: Command = {
  name: "update",
  aliases: ["up"],
  description: "Check for or install ANIMA updates (check|install|status)",
  async execute(args, ctx): Promise<string> {
    const o = colors.accent;
    const t = colors.text;
    const m = colors.muted;
    const s = colors.success;
    const w = colors.warning;
    const r = colors.reset;

    if (!ctx.updater) {
      return formatError("Auto-updater not initialized. Restart ANIMA to initialize.");
    }

    const sub = args[0] || "check";

    switch (sub) {
      case "check": {
        const info = await ctx.updater.check();
        if (info) {
          return [
            ``,
            `${w}  Update available: v${info.currentVersion} -> v${info.latestVersion}${r}`,
            `${m}  Channel: ${info.channel}${r}`,
            `${m}  Run \`:update install\` to download and install.${r}`,
            ``,
          ].join("\n");
        }
        return formatSuccess(`Already up to date (v${ctx.updater.getVersion()}).`);
      }

      case "install": {
        process.stdout.write(`${m}  Checking for updates...${r}\n`);
        const info = await ctx.updater.installAndRestart();
        if (info) {
          process.stdout.write(
            `${s}  Updated: v${info.currentVersion} -> v${info.latestVersion}${r}\n`,
          );
          process.stdout.write(`${m}  Restarting ANIMA...${r}\n`);
          // The installAndRestart triggers process restart internally
          // If autoRestart is off, we just installed -- need manual restart
          return formatSuccess(
            `Update installed (v${info.latestVersion}). Restart ANIMA to use the new version.`,
          );
        }
        return formatSuccess(`Already up to date (v${ctx.updater.getVersion()}).`);
      }

      case "status": {
        const config = ctx.updater.getConfig();
        const lastCheck = ctx.updater.getLastCheckTime();
        const lastUpdate = ctx.updater.getLastUpdateInfo();

        const lines = [
          ``,
          `${o}  ┌─── ${colors.bold}Auto-Update Status${r}${o} ──────────────────┐${r}`,
          `${o}  │${r}  ${t}Version:       ${o}v${ctx.updater.getVersion()}${r}`,
          `${o}  │${r}  ${t}Channel:       ${m}${config.channel}${r}`,
          `${o}  │${r}  ${t}Enabled:       ${config.enabled ? `${s}yes${r}` : `${colors.error}no${r}`}`,
          `${o}  │${r}  ${t}Auto-restart:  ${config.autoRestart ? `${s}yes${r}` : `${m}no${r}`}`,
          `${o}  │${r}  ${t}Check interval:${m} every ${config.checkIntervalHours}h${r}`,
          `${o}  │${r}  ${t}Last check:    ${m}${lastCheck ? lastCheck.toLocaleString() : "never"}${r}`,
        ];

        if (lastUpdate) {
          lines.push(
            `${o}  │${r}`,
            `${o}  │${r}  ${w}Pending update: v${lastUpdate.currentVersion} -> v${lastUpdate.latestVersion}${r}`,
          );
        }

        lines.push(`${o}  └───────────────────────────────────────────┘${r}`, ``);

        return lines.join("\n");
      }

      default:
        return formatError(`Unknown update command: ${sub}. Use: check, install, status`);
    }
  },
};

const shutdownCommand: Command = {
  name: "shutdown",
  aliases: ["exit", "quit"],
  description: "Graceful shutdown",
  async execute(_args, ctx): Promise<string> {
    // This will be intercepted by the REPL interface
    ctx.heartbeat.stop();
    if (ctx.updater) {
      ctx.updater.stop();
    }
    if (ctx.svrnNode) {
      await ctx.svrnNode.stop();
    }
    await ctx.queue.save();
    await ctx.budget.persist();
    return formatInfo("Shutting down ANIMA...");
  },
};

// --- Command registry ---

const ALL_COMMANDS: Command[] = [
  helpCommand,
  statusCommand,
  pulseCommand,
  soulCommand,
  queueCommand,
  mcpCommand,
  wanderCommand,
  journalCommand,
  wishCommand,
  budgetCommand,
  historyCommand,
  svrnCommand,
  updateCommand,
  shutdownCommand,
];

/**
 * Find a command by name or alias.
 */
export function findCommand(name: string): Command | undefined {
  const normalized = name.toLowerCase();
  return ALL_COMMANDS.find((cmd) => cmd.name === normalized || cmd.aliases.includes(normalized));
}

/**
 * Get all registered commands.
 */
export function getAllCommands(): Command[] {
  return [...ALL_COMMANDS];
}
