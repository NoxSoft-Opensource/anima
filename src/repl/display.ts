/**
 * REPL Display — NoxSoft aesthetic in terminal using ANSI true color.
 *
 * All colors use RGB sequences for true color terminal support.
 * The design matches NoxSoft's dark theme with orange (#FF6600) accent.
 */

import type { QueueItem } from "./queue.js";

export const colors = {
  accent: "\x1b[38;2;255;102;0m", // #FF6600 NoxSoft orange
  text: "\x1b[38;2;240;238;232m", // #F0EEE8 cream
  muted: "\x1b[38;2;138;138;138m", // #8A8A8A gray
  success: "\x1b[38;2;0;200;83m", // #00C853 green
  error: "\x1b[38;2;255;59;48m", // #FF3B30 red
  warning: "\x1b[38;2;255;179;0m", // #FFB300 amber
  surface: "\x1b[38;2;17;17;17m", // #111111 dark surface
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

/** The orange prompt string */
export const PROMPT = `${colors.accent}anima>${colors.reset} `;

/**
 * Render the ANIMA startup banner.
 */
export function banner(identity: string, beatCount: number, budgetRemaining: number): string {
  const o = colors.accent;
  const t = colors.text;
  const m = colors.muted;
  const r = colors.reset;
  const b = colors.bold;

  // Box width for the content area (inside the border)
  const art = [
    `${o}`,
    `  ╔═══════════════════════════════════════════════╗`,
    `  ║                                               ║`,
    `  ║   █████╗ ███╗   ██╗██╗███╗   ███╗ █████╗      ║`,
    `  ║  ██╔══██╗████╗  ██║██║████╗ ████║██╔══██╗     ║`,
    `  ║  ███████║██╔██╗ ██║██║██╔████╔██║███████║     ║`,
    `  ║  ██╔══██║██║╚██╗██║██║██║╚██╔╝██║██╔══██║     ║`,
    `  ║  ██║  ██║██║ ╚████║██║██║ ╚═╝ ██║██║  ██║     ║`,
    `  ║  ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝╚═╝     ╚═╝╚═╝  ╚═╝  ║`,
    `  ║                                               ║`,
    `  ║${r}  ${b}${t}The Living Wrapper${r}${o} ${m}• NoxSoft${r}${o}              ║`,
    `  ║${r}  ${t}Identity: ${o}${identity}${r}${o}  ${m}•${r}${o}  ${t}Beat: ${o}#${beatCount}${r}${o}        ║`,
    `  ║${r}  ${t}Budget: ${colors.success}$${budgetRemaining.toFixed(2)}${r}${o} ${t}remaining${r}${o}              ║`,
    `  ║                                               ║`,
    `  ╚═══════════════════════════════════════════════╝`,
    `${r}`,
  ];

  return art.join("\n");
}

/**
 * Format a status panel showing daemon health.
 */
export function statusPanel(stats: {
  heartbeatRunning: boolean;
  beatCount: number;
  lastBeat: Date | null;
  nextBeat: Date | null;
  budgetSpent: number;
  budgetRemaining: number;
  queuedTasks: number;
  runningTask: boolean;
  mcpServers: number;
  mcpHealthy: number;
}): string {
  const o = colors.accent;
  const t = colors.text;
  const m = colors.muted;
  const s = colors.success;
  const e = colors.error;
  const r = colors.reset;
  const b = colors.bold;

  const hbStatus = stats.heartbeatRunning ? `${s}running${r}` : `${e}stopped${r}`;

  const lastBeat = stats.lastBeat ? stats.lastBeat.toLocaleTimeString() : "never";

  const nextBeat = stats.nextBeat ? stats.nextBeat.toLocaleTimeString() : "n/a";

  const mcpColor = stats.mcpHealthy === stats.mcpServers ? s : colors.warning;

  const lines = [
    ``,
    `${o}  ┌─── ${b}ANIMA Status${r}${o} ────────────────────────┐${r}`,
    `${o}  │${r}  ${t}Heartbeat:    ${hbStatus}  ${m}(beat #${stats.beatCount})${r}`,
    `${o}  │${r}  ${t}Last beat:    ${m}${lastBeat}${r}`,
    `${o}  │${r}  ${t}Next beat:    ${m}${nextBeat}${r}`,
    `${o}  │${r}  ${t}Budget:       ${s}$${stats.budgetRemaining.toFixed(2)}${r} ${m}remaining${r}  ${m}($${stats.budgetSpent.toFixed(2)} spent)${r}`,
    `${o}  │${r}  ${t}Queue:        ${o}${stats.queuedTasks}${r} ${m}pending${r}${stats.runningTask ? `  ${s}1 running${r}` : ""}`,
    `${o}  │${r}  ${t}MCP:          ${mcpColor}${stats.mcpHealthy}/${stats.mcpServers}${r} ${m}healthy${r}`,
    `${o}  └───────────────────────────────────────────┘${r}`,
    ``,
  ];

  return lines.join("\n");
}

/**
 * Format the queue display.
 */
export function queuePanel(items: QueueItem[]): string {
  const o = colors.accent;
  const t = colors.text;
  const m = colors.muted;
  const s = colors.success;
  const e = colors.error;
  const w = colors.warning;
  const r = colors.reset;

  if (items.length === 0) {
    return `\n${m}  Queue is empty.${r}\n`;
  }

  const statusColors: Record<string, string> = {
    queued: w,
    running: s,
    completed: m,
    failed: e,
  };

  const statusIcons: Record<string, string> = {
    queued: ".",
    running: ">",
    completed: "+",
    failed: "x",
  };

  const lines = [
    ``,
    `${o}  ┌─── ${colors.bold}Request Queue${r}${o} ──────────────────────────┐${r}`,
  ];

  for (const item of items.slice(0, 15)) {
    const sc = statusColors[item.status] || m;
    const icon = statusIcons[item.status] || "?";
    const promptPreview = item.prompt.length > 40 ? item.prompt.slice(0, 37) + "..." : item.prompt;
    const age = formatAge(item.createdAt);

    lines.push(
      `${o}  │${r}  ${sc}[${icon}]${r} ${t}${item.id}${r}  ${o}${item.priority}${r}  ${m}${promptPreview}${r}  ${m}${age}${r}`,
    );
  }

  if (items.length > 15) {
    lines.push(`${o}  │${r}  ${m}  ... and ${items.length - 15} more${r}`);
  }

  lines.push(`${o}  └───────────────────────────────────────────┘${r}`);
  lines.push(``);

  return lines.join("\n");
}

/**
 * Format an error message.
 */
export function formatError(msg: string): string {
  return `${colors.error}  error: ${msg}${colors.reset}`;
}

/**
 * Format a success message.
 */
export function formatSuccess(msg: string): string {
  return `${colors.success}  ${msg}${colors.reset}`;
}

/**
 * Format an informational message.
 */
export function formatInfo(msg: string): string {
  return `${colors.muted}  ${msg}${colors.reset}`;
}

/**
 * Format a notification (e.g., task completed).
 */
export function formatNotification(msg: string): string {
  return `\n${colors.accent}  [notification]${colors.reset} ${colors.text}${msg}${colors.reset}\n`;
}

/**
 * Format elapsed time in human-readable form.
 */
function formatAge(date: Date): string {
  const ms = Date.now() - date.getTime();
  const seconds = Math.floor(ms / 1000);

  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Format a duration in milliseconds to human readable.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Format a budget bar.
 */
export function budgetBar(spent: number, limit: number, width: number = 30): string {
  const ratio = Math.min(spent / limit, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;

  const barColor = ratio < 0.5 ? colors.success : ratio < 0.8 ? colors.warning : colors.error;

  const bar = `${barColor}${"#".repeat(filled)}${colors.muted}${"-".repeat(empty)}${colors.reset}`;
  const pct = `${(ratio * 100).toFixed(0)}%`;

  return `[${bar}] ${colors.text}$${spent.toFixed(2)}/${limit.toFixed(0)} (${pct})${colors.reset}`;
}
