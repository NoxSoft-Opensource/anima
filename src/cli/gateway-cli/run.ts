import type { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import type { GatewayAuthMode } from "../../config/config.js";
import type { GatewayWsLogStyle } from "../../gateway/ws-logging.js";
import { resolveControlUiLinks } from "../../commands/onboard-helpers.js";
import {
  CONFIG_PATH,
  loadConfig,
  readConfigFileSnapshot,
  resolveStateDir,
  resolveGatewayPort,
} from "../../config/config.js";
import { resolveGatewayService } from "../../daemon/service.js";
import { resolveGatewayAuth } from "../../gateway/auth.js";
import { startGatewayServer } from "../../gateway/server.js";
import { setGatewayWsLogStyle } from "../../gateway/ws-logging.js";
import { setVerbose } from "../../globals.js";
import { GatewayLockError } from "../../infra/gateway-lock.js";
import { formatPortDiagnostics, inspectPortUsage } from "../../infra/ports.js";
import {
  getResolvedConsoleSettings,
  getResolvedLoggerSettings,
  setLoggerOverride,
} from "../../logging.js";
import { setConsoleSubsystemFilter, setConsoleTimestampPrefix } from "../../logging/console.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { defaultRuntime } from "../../runtime.js";
import { formatCliCommand } from "../command-format.js";
import { forceFreePortAndWait } from "../ports.js";
import { ensureDevGatewayConfig } from "./dev.js";
import { runGatewayLoop } from "./run-loop.js";
import {
  describeUnknownError,
  extractGatewayMiskeys,
  maybeExplainGatewayServiceStop,
  parsePort,
  toOptionString,
} from "./shared.js";

export type GatewayReadyInfo = {
  port: number;
  bind: "auto" | "lan" | "loopback" | "custom" | "tailnet";
  gatewayWsUrl: string;
  portalUrl: string;
  dashboardUrl: string;
  logFile: string;
};

export type GatewayRunOpts = {
  port?: unknown;
  bind?: unknown;
  token?: unknown;
  auth?: unknown;
  password?: unknown;
  tailscale?: unknown;
  tailscaleResetOnExit?: boolean;
  allowUnconfigured?: boolean;
  force?: boolean;
  verbose?: boolean;
  claudeCliLogs?: boolean;
  wsLog?: unknown;
  compact?: boolean;
  rawStream?: boolean;
  rawStreamPath?: unknown;
  dev?: boolean;
  reset?: boolean;
  consoleSilent?: boolean;
  onReady?: (info: GatewayReadyInfo) => Promise<void> | void;
};

const gatewayLog = createSubsystemLogger("gateway");

function isLikelyAnimaGatewayListener(listener: {
  command?: string;
  commandLine?: string;
}): boolean {
  const combined = `${listener.command ?? ""} ${listener.commandLine ?? ""}`.trim().toLowerCase();
  if (!combined) {
    return false;
  }
  if (!combined.includes("anima")) {
    return false;
  }
  return (
    combined.includes("gateway") ||
    combined.includes("anima-start") ||
    combined.includes("anima-gateway") ||
    combined.includes("run-node")
  );
}

async function tryAutoRecoverGatewayPortConflict(port: number): Promise<boolean> {
  const diagnostics = await inspectPortUsage(port);
  if (diagnostics.status !== "busy" || diagnostics.listeners.length === 0) {
    return false;
  }

  const safeToRecover = diagnostics.listeners.every((listener) =>
    isLikelyAnimaGatewayListener(listener),
  );
  if (!safeToRecover) {
    return false;
  }

  gatewayLog.warn(`auto-recover: stopping stale ANIMA listener(s) on port ${port}`);
  await forceFreePortAndWait(port, {
    timeoutMs: 3000,
    intervalMs: 100,
    sigtermTimeoutMs: 1000,
  });
  gatewayLog.info(`auto-recover: port ${port} is now free; retrying gateway start`);
  return true;
}

export async function runGatewayCommand(opts: GatewayRunOpts) {
  const isDevProfile = process.env.ANIMA_PROFILE?.trim().toLowerCase() === "dev";
  const devMode = Boolean(opts.dev) || isDevProfile;
  if (opts.reset && !devMode) {
    defaultRuntime.error("Use --reset with --dev.");
    defaultRuntime.exit(1);
    return;
  }

  if (opts.consoleSilent && !opts.verbose && !opts.claudeCliLogs) {
    const loggerSettings = getResolvedLoggerSettings();
    const consoleSettings = getResolvedConsoleSettings();
    setLoggerOverride({
      level: loggerSettings.level,
      file: loggerSettings.file,
      consoleLevel: "silent",
      consoleStyle: consoleSettings.style,
    });
  }

  setConsoleTimestampPrefix(true);
  setVerbose(Boolean(opts.verbose));
  if (opts.claudeCliLogs) {
    setConsoleSubsystemFilter(["agent/claude-cli"]);
    process.env.ANIMA_CLAUDE_CLI_LOG_OUTPUT = "1";
  }
  const wsLogRaw = (opts.compact ? "compact" : opts.wsLog) as string | undefined;
  const wsLogStyle: GatewayWsLogStyle =
    wsLogRaw === "compact" ? "compact" : wsLogRaw === "full" ? "full" : "auto";
  if (
    wsLogRaw !== undefined &&
    wsLogRaw !== "auto" &&
    wsLogRaw !== "compact" &&
    wsLogRaw !== "full"
  ) {
    defaultRuntime.error('Invalid --ws-log (use "auto", "full", "compact")');
    defaultRuntime.exit(1);
  }
  setGatewayWsLogStyle(wsLogStyle);

  if (opts.rawStream) {
    process.env.ANIMA_RAW_STREAM = "1";
  }
  const rawStreamPath = toOptionString(opts.rawStreamPath);
  if (rawStreamPath) {
    process.env.ANIMA_RAW_STREAM_PATH = rawStreamPath;
  }

  if (devMode) {
    await ensureDevGatewayConfig({ reset: Boolean(opts.reset) });
  }

  const cfg = loadConfig();
  const portOverride = parsePort(opts.port);
  if (opts.port !== undefined && portOverride === null) {
    defaultRuntime.error("Invalid port");
    defaultRuntime.exit(1);
  }
  const port = portOverride ?? resolveGatewayPort(cfg);
  if (!Number.isFinite(port) || port <= 0) {
    defaultRuntime.error("Invalid port");
    defaultRuntime.exit(1);
  }
  if (opts.force) {
    try {
      const { killed, waitedMs, escalatedToSigkill } = await forceFreePortAndWait(port, {
        timeoutMs: 2000,
        intervalMs: 100,
        sigtermTimeoutMs: 700,
      });
      if (killed.length === 0) {
        gatewayLog.info(`force: no listeners on port ${port}`);
      } else {
        for (const proc of killed) {
          gatewayLog.info(
            `force: killed pid ${proc.pid}${proc.command ? ` (${proc.command})` : ""} on port ${port}`,
          );
        }
        if (escalatedToSigkill) {
          gatewayLog.info(`force: escalated to SIGKILL while freeing port ${port}`);
        }
        if (waitedMs > 0) {
          gatewayLog.info(`force: waited ${waitedMs}ms for port ${port} to free`);
        }
      }
    } catch (err) {
      defaultRuntime.error(`Force: ${String(err)}`);
      defaultRuntime.exit(1);
      return;
    }
  }
  if (opts.token) {
    const token = toOptionString(opts.token);
    if (token) {
      process.env.ANIMA_GATEWAY_TOKEN = token;
    }
  }
  const authModeRaw = toOptionString(opts.auth);
  const authMode: GatewayAuthMode | null =
    authModeRaw === "token" || authModeRaw === "password" ? authModeRaw : null;
  if (authModeRaw && !authMode) {
    defaultRuntime.error('Invalid --auth (use "token" or "password")');
    defaultRuntime.exit(1);
    return;
  }
  const tailscaleRaw = toOptionString(opts.tailscale);
  const tailscaleMode =
    tailscaleRaw === "off" || tailscaleRaw === "serve" || tailscaleRaw === "funnel"
      ? tailscaleRaw
      : null;
  if (tailscaleRaw && !tailscaleMode) {
    defaultRuntime.error('Invalid --tailscale (use "off", "serve", or "funnel")');
    defaultRuntime.exit(1);
    return;
  }
  const passwordRaw = toOptionString(opts.password);
  const tokenRaw = toOptionString(opts.token);

  const snapshot = await readConfigFileSnapshot().catch(() => null);
  const configExists = snapshot?.exists ?? fs.existsSync(CONFIG_PATH);
  const configAuditPath = path.join(resolveStateDir(process.env), "logs", "config-audit.jsonl");
  const mode = cfg.gateway?.mode;
  if (!opts.allowUnconfigured && mode !== "local") {
    if (!configExists) {
      defaultRuntime.error(
        `Missing config. Run \`${formatCliCommand("anima setup")}\` or set gateway.mode=local (or pass --allow-unconfigured).`,
      );
    } else {
      defaultRuntime.error(
        `Gateway start blocked: set gateway.mode=local (current: ${mode ?? "unset"}) or pass --allow-unconfigured.`,
      );
      defaultRuntime.error(`Config write audit: ${configAuditPath}`);
    }
    defaultRuntime.exit(1);
    return;
  }
  const bindRaw = toOptionString(opts.bind) ?? cfg.gateway?.bind ?? "loopback";
  const bind =
    bindRaw === "loopback" ||
    bindRaw === "lan" ||
    bindRaw === "auto" ||
    bindRaw === "custom" ||
    bindRaw === "tailnet"
      ? bindRaw
      : null;
  if (!bind) {
    defaultRuntime.error('Invalid --bind (use "loopback", "lan", "tailnet", "auto", or "custom")');
    defaultRuntime.exit(1);
    return;
  }

  const miskeys = extractGatewayMiskeys(snapshot?.parsed);
  const authConfig = {
    ...cfg.gateway?.auth,
    ...(authMode ? { mode: authMode } : {}),
    ...(passwordRaw ? { password: passwordRaw } : {}),
    ...(tokenRaw ? { token: tokenRaw } : {}),
  };
  const resolvedAuth = resolveGatewayAuth({
    authConfig,
    env: process.env,
    tailscaleMode: tailscaleMode ?? cfg.gateway?.tailscale?.mode ?? "off",
  });
  const resolvedAuthMode = resolvedAuth.mode;
  const tokenValue = resolvedAuth.token;
  const passwordValue = resolvedAuth.password;
  const hasToken = typeof tokenValue === "string" && tokenValue.trim().length > 0;
  const hasPassword = typeof passwordValue === "string" && passwordValue.trim().length > 0;
  const hasSharedSecret =
    (resolvedAuthMode === "token" && hasToken) || (resolvedAuthMode === "password" && hasPassword);
  const authHints: string[] = [];
  if (miskeys.hasGatewayToken) {
    authHints.push('Found "gateway.token" in config. Use "gateway.auth.token" instead.');
  }
  if (miskeys.hasRemoteToken) {
    authHints.push(
      '"gateway.remote.token" is for remote CLI calls; it does not enable local gateway auth.',
    );
  }
  if (resolvedAuthMode === "token" && !hasToken && !resolvedAuth.allowTailscale) {
    defaultRuntime.error(
      [
        "Gateway auth is set to token, but no token is configured.",
        "Set gateway.auth.token (or ANIMA_GATEWAY_TOKEN), or pass --token.",
        ...authHints,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    defaultRuntime.exit(1);
    return;
  }
  if (resolvedAuthMode === "password" && !hasPassword) {
    defaultRuntime.error(
      [
        "Gateway auth is set to password, but no password is configured.",
        "Set gateway.auth.password (or ANIMA_GATEWAY_PASSWORD), or pass --password.",
        ...authHints,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    defaultRuntime.exit(1);
    return;
  }
  if (bind !== "loopback" && !hasSharedSecret && resolvedAuthMode !== "trusted-proxy") {
    defaultRuntime.error(
      [
        `Refusing to bind gateway to ${bind} without auth.`,
        "Set gateway.auth.token/password (or ANIMA_GATEWAY_TOKEN/ANIMA_GATEWAY_PASSWORD) or pass --token/--password.",
        ...authHints,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    defaultRuntime.exit(1);
    return;
  }

  const links = resolveControlUiLinks({
    port,
    bind,
    customBindHost: cfg.gateway?.customBindHost,
    basePath: cfg.gateway?.controlUi?.basePath,
  });
  const maybeToken = resolvedAuthMode === "token" && hasToken ? tokenValue : "";
  const appendToken = (url: string) =>
    maybeToken ? `${url}#token=${encodeURIComponent(maybeToken)}` : url;
  const dashboardUrl = appendToken(new URL("dashboard", links.httpUrl).toString());
  const portalUrl = appendToken(links.httpUrl);
  const gatewayReadyInfo: GatewayReadyInfo = {
    port,
    bind,
    gatewayWsUrl: links.wsUrl,
    portalUrl,
    dashboardUrl,
    logFile: getResolvedLoggerSettings().file,
  };
  let readyNotified = false;

  const maxAttempts = opts.force ? 1 : 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await runGatewayLoop({
        runtime: defaultRuntime,
        start: async () => {
          const server = await startGatewayServer(port, {
            bind,
            auth:
              authMode || passwordRaw || tokenRaw || authModeRaw
                ? {
                    mode: authMode ?? undefined,
                    token: tokenRaw,
                    password: passwordRaw,
                  }
                : undefined,
            tailscale:
              tailscaleMode || opts.tailscaleResetOnExit
                ? {
                    mode: tailscaleMode ?? undefined,
                    resetOnExit: Boolean(opts.tailscaleResetOnExit),
                  }
                : undefined,
          });
          if (!readyNotified) {
            readyNotified = true;
            await opts.onReady?.(gatewayReadyInfo);
          }
          return server;
        },
      });
      return;
    } catch (err) {
      const isLockError =
        err instanceof GatewayLockError ||
        (err && typeof err === "object" && (err as { name?: string }).name === "GatewayLockError");

      if (isLockError && attempt < maxAttempts) {
        let serviceLoaded = false;
        try {
          serviceLoaded = await resolveGatewayService().isLoaded({ env: process.env });
        } catch {
          serviceLoaded = false;
        }
        if (!serviceLoaded) {
          try {
            const recovered = await tryAutoRecoverGatewayPortConflict(port);
            if (recovered) {
              continue;
            }
          } catch (recoverErr) {
            gatewayLog.warn(`auto-recover failed: ${String(recoverErr)}`);
          }
        }
      }

      if (isLockError) {
        const errMessage = describeUnknownError(err);
        defaultRuntime.error(
          `Gateway failed to start: ${errMessage}\nIf the gateway is supervised, stop it with: ${formatCliCommand("anima gateway stop")}`,
        );
        try {
          const diagnostics = await inspectPortUsage(port);
          if (diagnostics.status === "busy") {
            for (const line of formatPortDiagnostics(diagnostics)) {
              defaultRuntime.error(line);
            }
          }
        } catch {
          // ignore diagnostics failures
        }
        await maybeExplainGatewayServiceStop();
        defaultRuntime.exit(1);
        return;
      }
      defaultRuntime.error(`Gateway failed to start: ${String(err)}`);
      defaultRuntime.exit(1);
      return;
    }
  }
}

export function addGatewayRunCommand(cmd: Command): Command {
  return cmd
    .option("--port <port>", "Port for the gateway WebSocket")
    .option(
      "--bind <mode>",
      'Bind mode ("loopback"|"lan"|"tailnet"|"auto"|"custom"). Defaults to config gateway.bind (or loopback).',
    )
    .option(
      "--token <token>",
      "Shared token required in connect.params.auth.token (default: ANIMA_GATEWAY_TOKEN env if set)",
    )
    .option("--auth <mode>", 'Gateway auth mode ("token"|"password")')
    .option("--password <password>", "Password for auth mode=password")
    .option("--tailscale <mode>", 'Tailscale exposure mode ("off"|"serve"|"funnel")')
    .option(
      "--tailscale-reset-on-exit",
      "Reset Tailscale serve/funnel configuration on shutdown",
      false,
    )
    .option(
      "--allow-unconfigured",
      "Allow gateway start without gateway.mode=local in config",
      false,
    )
    .option("--dev", "Create a dev config + workspace if missing (no BOOTSTRAP.md)", false)
    .option(
      "--reset",
      "Reset dev config + credentials + sessions + workspace (requires --dev)",
      false,
    )
    .option("--force", "Kill any existing listener on the target port before starting", false)
    .option("--verbose", "Verbose logging to stdout/stderr", false)
    .option(
      "--claude-cli-logs",
      "Only show claude-cli logs in the console (includes stdout/stderr)",
      false,
    )
    .option("--ws-log <style>", 'WebSocket log style ("auto"|"full"|"compact")', "auto")
    .option("--compact", 'Alias for "--ws-log compact"', false)
    .option("--raw-stream", "Log raw model stream events to jsonl", false)
    .option("--raw-stream-path <path>", "Raw stream jsonl path")
    .action(async (opts) => {
      await runGatewayCommand(opts);
    });
}
