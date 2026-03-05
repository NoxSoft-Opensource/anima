/**
 * anima start — simple startup mode.
 *
 * Starts the Gateway + portal + dashboard, prints clean links, and keeps
 * runtime logs in the dashboard/log file by default.
 */

import type { AnimaConfig } from "../config/config.js";
import type { GatewayReadyInfo } from "./gateway-cli/run.js";
import { openUrl } from "../commands/onboard-helpers.js";
import { loadConfig, resolveGatewayPort } from "../config/config.js";
import { resolveAssistantIdentity } from "../gateway/assistant-identity.js";
import { runGatewayCommand } from "./gateway-cli/run.js";

export interface StartOptions {
  port?: number;
  noOpen?: boolean;
  showLogs?: boolean;
  force?: boolean;
  // Deprecated legacy flags kept for compatibility with older scripts.
  daemon?: boolean;
  noRepl?: boolean;
  heartbeatInterval?: number;
  budget?: number;
}

export function resolveStartupIdentityName(cfg: AnimaConfig): string {
  return resolveAssistantIdentity({ cfg }).name;
}

function writeLine(message = ""): void {
  process.stdout.write(`${message}\n`);
}

function printReadyLinks(
  info: GatewayReadyInfo,
  opts: { opened: boolean; noOpen: boolean; showLogs: boolean },
): void {
  writeLine("");
  writeLine("ANIMA is ready.");
  writeLine(`Gateway:   ${info.gatewayWsUrl}`);
  writeLine(`Portal:    ${info.portalUrl}`);
  writeLine(`Dashboard: ${info.dashboardUrl}`);
  writeLine(`Logs:      ${info.logFile}`);
  if (opts.noOpen) {
    writeLine("Browser launch disabled (--no-open).");
  } else if (opts.opened) {
    writeLine("Dashboard opened in browser.");
  } else {
    writeLine("Could not auto-open browser. Open the Dashboard URL manually.");
  }
  if (!opts.showLogs) {
    writeLine("CLI logs are hidden. Use the dashboard for runtime visibility.");
  }
  writeLine("Press Ctrl+C to stop.");
  writeLine("");
}

export async function startDaemon(options: StartOptions = {}): Promise<void> {
  const cfg = loadConfig();
  const identityName = resolveStartupIdentityName(cfg);
  const resolvedPort =
    typeof options.port === "number" && Number.isFinite(options.port)
      ? Math.floor(options.port)
      : resolveGatewayPort(cfg);
  if (!Number.isFinite(resolvedPort) || resolvedPort <= 0) {
    throw new Error("Invalid gateway port.");
  }

  const showLogs = Boolean(options.showLogs);
  const noOpen = Boolean(options.noOpen);

  writeLine(`Starting ANIMA (${identityName})...`);
  writeLine(`Mode: gateway + portal + dashboard`);
  writeLine(`Port: ${resolvedPort}`);
  if (!showLogs) {
    writeLine("Console logs: hidden (dashboard/log file only)");
  }

  await runGatewayCommand({
    port: resolvedPort,
    force: Boolean(options.force),
    allowUnconfigured: true,
    verbose: showLogs,
    consoleSilent: !showLogs,
    onReady: async (info) => {
      const opened = noOpen ? false : await openUrl(info.dashboardUrl).catch(() => false);
      printReadyLinks(info, { opened, noOpen, showLogs });
    },
  });
}
