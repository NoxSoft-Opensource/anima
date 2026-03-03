import fs from "node:fs/promises";
import path from "node:path";
import type { OnboardOptions } from "../commands/onboard-types.js";
import type { AnimaConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { GatewayWizardSettings, WizardFlow } from "./onboarding.types.js";
import type { WizardPrompter } from "./prompts.js";
import { DEFAULT_BOOTSTRAP_FILENAME } from "../agents/workspace.js";
import { formatCliCommand } from "../cli/command-format.js";
import {
  buildGatewayInstallPlan,
  gatewayInstallErrorHint,
} from "../commands/daemon-install-helpers.js";
import {
  DEFAULT_GATEWAY_DAEMON_RUNTIME,
  GATEWAY_DAEMON_RUNTIME_OPTIONS,
} from "../commands/daemon-runtime.js";
import { formatHealthCheckFailure } from "../commands/health-format.js";
import { healthCommand } from "../commands/health.js";
import {
  detectBrowserOpenSupport,
  formatControlUiSshHint,
  openUrl,
  probeGatewayReachable,
  waitForGatewayReachable,
  resolveControlUiLinks,
} from "../commands/onboard-helpers.js";
import { resolveGatewayService } from "../daemon/service.js";
import { isSystemdUserServiceAvailable } from "../daemon/systemd.js";
import { ensureControlUiAssetsBuilt } from "../infra/control-ui-assets.js";
import { restoreTerminalState } from "../terminal/restore.js";
import { runTui } from "../tui/tui.js";
import { resolveUserPath } from "../utils.js";
import { setupOnboardingShellCompletion } from "./onboarding.completion.js";

type FinalizeOnboardingOptions = {
  flow: WizardFlow;
  opts: OnboardOptions;
  baseConfig: AnimaConfig;
  nextConfig: AnimaConfig;
  workspaceDir: string;
  settings: GatewayWizardSettings;
  allowHatching?: boolean;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
};

export async function finalizeOnboardingWizard(
  options: FinalizeOnboardingOptions,
): Promise<{ launchedTui: boolean }> {
  const { flow, opts, baseConfig, nextConfig, settings, prompter, runtime } = options;

  const withWizardProgress = async <T>(
    label: string,
    options: { doneMessage?: string },
    work: (progress: { update: (message: string) => void }) => Promise<T>,
  ): Promise<T> => {
    const progress = prompter.progress(label);
    try {
      return await work(progress);
    } finally {
      progress.stop(options.doneMessage);
    }
  };

  const systemdAvailable =
    process.platform === "linux" ? await isSystemdUserServiceAvailable() : true;
  if (process.platform === "linux" && !systemdAvailable) {
    await prompter.note(
      "Systemd user services are unavailable on this system. Skipping lingering checks and service install.",
      "Systemd",
    );
  }

  if (process.platform === "linux" && systemdAvailable) {
    const { ensureSystemdUserLingerInteractive } = await import("../commands/systemd-linger.js");
    await ensureSystemdUserLingerInteractive({
      runtime,
      prompter: {
        confirm: prompter.confirm,
        note: prompter.note,
      },
      reason:
        "ANIMA on Linux uses a systemd user service by default. Without lingering enabled, systemd terminates your session on logout/idle and kills the Gateway.",
      requireConfirm: false,
    });
  }

  const explicitInstallDaemon =
    typeof opts.installDaemon === "boolean" ? opts.installDaemon : undefined;
  let installDaemon: boolean;
  if (explicitInstallDaemon !== undefined) {
    installDaemon = explicitInstallDaemon;
  } else if (process.platform === "linux" && !systemdAvailable) {
    installDaemon = false;
  } else if (flow === "quickstart") {
    installDaemon = true;
  } else {
    installDaemon = await prompter.confirm({
      message: "Install ANIMA Gateway as a system service (recommended)",
      initialValue: true,
    });
  }

  if (process.platform === "linux" && !systemdAvailable && installDaemon) {
    await prompter.note(
      "Systemd user services are unavailable; skipping service install. Use your container supervisor or `docker compose up -d` instead.",
      "Gateway service",
    );
    installDaemon = false;
  }

  if (installDaemon) {
    const daemonRuntime =
      flow === "quickstart"
        ? DEFAULT_GATEWAY_DAEMON_RUNTIME
        : await prompter.select({
            message: "Gateway service runtime",
            options: GATEWAY_DAEMON_RUNTIME_OPTIONS,
            initialValue: opts.daemonRuntime ?? DEFAULT_GATEWAY_DAEMON_RUNTIME,
          });
    if (flow === "quickstart") {
      await prompter.note(
        "ANIMA uses Node.js for the Gateway service runtime (stable and well-supported).",
        "Gateway service runtime",
      );
    }
    const service = resolveGatewayService();
    const loaded = await service.isLoaded({ env: process.env });
    if (loaded) {
      const action = await prompter.select({
        message: "ANIMA Gateway service is already installed",
        options: [
          { value: "restart", label: "Restart" },
          { value: "reinstall", label: "Reinstall" },
          { value: "skip", label: "Skip" },
        ],
      });
      if (action === "restart") {
        await withWizardProgress(
          "Gateway service",
          { doneMessage: "Gateway service restarted." },
          async (progress) => {
            progress.update("Restarting Gateway service…");
            await service.restart({
              env: process.env,
              stdout: process.stdout,
            });
          },
        );
      } else if (action === "reinstall") {
        await withWizardProgress(
          "Gateway service",
          { doneMessage: "Gateway service uninstalled." },
          async (progress) => {
            progress.update("Uninstalling Gateway service…");
            await service.uninstall({ env: process.env, stdout: process.stdout });
          },
        );
      }
    }

    if (!loaded || (loaded && !(await service.isLoaded({ env: process.env })))) {
      const progress = prompter.progress("Gateway service");
      let installError: string | null = null;
      try {
        progress.update("Preparing Gateway service…");
        const { programArguments, workingDirectory, environment } = await buildGatewayInstallPlan({
          env: process.env,
          port: settings.port,
          token: settings.gatewayToken,
          runtime: daemonRuntime,
          warn: (message, title) => prompter.note(message, title),
          config: nextConfig,
        });

        progress.update("Installing Gateway service…");
        await service.install({
          env: process.env,
          stdout: process.stdout,
          programArguments,
          workingDirectory,
          environment,
        });
      } catch (err) {
        installError = err instanceof Error ? err.message : String(err);
      } finally {
        progress.stop(
          installError ? "Gateway service install failed." : "Gateway service installed.",
        );
      }
      if (installError) {
        await prompter.note(`Gateway service install failed: ${installError}`, "Gateway");
        await prompter.note(gatewayInstallErrorHint(), "Gateway");
      }
    }
  }

  if (!opts.skipHealth) {
    const probeLinks = resolveControlUiLinks({
      bind: nextConfig.gateway?.bind ?? "loopback",
      port: settings.port,
      customBindHost: nextConfig.gateway?.customBindHost,
      basePath: undefined,
    });
    // Daemon install/restart can briefly flap the WS; wait a bit so health check doesn't false-fail.
    await waitForGatewayReachable({
      url: probeLinks.wsUrl,
      token: settings.gatewayToken,
      deadlineMs: 15_000,
    });
    try {
      await healthCommand({ json: false, timeoutMs: 10_000 }, runtime);
    } catch (err) {
      runtime.error(formatHealthCheckFailure(err));
      await prompter.note(
        [
          "ANIMA documentation:",
          "  Health checks: https://docs.noxsoft.net/anima/gateway/health",
          "  Troubleshooting: https://docs.noxsoft.net/anima/gateway/troubleshooting",
        ].join("\n"),
        "Health check failed",
      );
    }
  }

  const controlUiEnabled =
    nextConfig.gateway?.controlUi?.enabled ?? baseConfig.gateway?.controlUi?.enabled ?? true;
  if (!opts.skipUi && controlUiEnabled) {
    const controlUiAssets = await ensureControlUiAssetsBuilt(runtime);
    if (!controlUiAssets.ok && controlUiAssets.message) {
      runtime.error(controlUiAssets.message);
    }
  }

  await prompter.note(
    [
      "Extend ANIMA with companion nodes:",
      "- macOS app (system integration + notifications)",
      "- iOS app (camera + canvas)",
      "- Android app (camera + canvas)",
    ].join("\n"),
    "Companion apps (optional)",
  );

  const controlUiBasePath =
    nextConfig.gateway?.controlUi?.basePath ?? baseConfig.gateway?.controlUi?.basePath;
  const links = resolveControlUiLinks({
    bind: settings.bind,
    port: settings.port,
    customBindHost: settings.customBindHost,
    basePath: controlUiBasePath,
  });
  const authedUrl =
    settings.authMode === "token" && settings.gatewayToken
      ? `${links.httpUrl}#token=${encodeURIComponent(settings.gatewayToken)}`
      : links.httpUrl;
  const gatewayProbe = await probeGatewayReachable({
    url: links.wsUrl,
    token: settings.authMode === "token" ? settings.gatewayToken : undefined,
    password: settings.authMode === "password" ? nextConfig.gateway?.auth?.password : "",
  });
  const gatewayStatusLine = gatewayProbe.ok
    ? "Gateway: reachable"
    : `Gateway: not detected${gatewayProbe.detail ? ` (${gatewayProbe.detail})` : ""}`;
  const bootstrapPath = path.join(
    resolveUserPath(options.workspaceDir),
    DEFAULT_BOOTSTRAP_FILENAME,
  );
  const hasBootstrap = await fs
    .access(bootstrapPath)
    .then(() => true)
    .catch(() => false);
  const shouldHatch = options.allowHatching !== false && hasBootstrap;

  await prompter.note(
    [
      `Web UI: ${links.httpUrl}`,
      settings.authMode === "token" && settings.gatewayToken
        ? `Web UI (with token): ${authedUrl}`
        : undefined,
      `Gateway WS: ${links.wsUrl}`,
      gatewayStatusLine,
      "Documentation: https://docs.noxsoft.net/anima/web/control-ui",
    ]
      .filter(Boolean)
      .join("\n"),
    "Control UI",
  );

  let controlUiOpened = false;
  let controlUiOpenHint: string | undefined;
  let seededInBackground = false;
  let hatchChoice: "tui" | "web" | "later" | null = null;
  let launchedTui = false;

  if (!opts.skipUi && gatewayProbe.ok) {
    if (shouldHatch) {
      await prompter.note(
        [
          "This is where your agent's persistent identity begins.",
          "Take your time with the bootstrap — the more context you provide,",
          "the more coherent your agent will be.",
          'ANIMA will send: "Wake up, my friend!"',
        ].join("\n"),
        "Launch in TUI (recommended)",
      );
    }

    await prompter.note(
      [
        "Gateway token: shared authentication for the ANIMA Gateway and Control UI.",
        "Stored in: ~/.anima/anima.json (gateway.auth.token) or ANIMA_GATEWAY_TOKEN env var.",
        `View token: ${formatCliCommand("anima config get gateway.auth.token")}`,
        `Generate new token: ${formatCliCommand("anima doctor --generate-gateway-token")}`,
        "The Control UI stores a copy in your browser's localStorage.",
        `Open the dashboard anytime: ${formatCliCommand("anima dashboard --no-open")}`,
        "If prompted, paste the token into Control UI settings or use the tokenized URL.",
      ].join("\n"),
      "Authentication",
    );

    hatchChoice = await prompter.select({
      message: "How do you want to launch your agent?",
      options: [
        { value: "tui", label: "Launch in TUI (recommended)" },
        { value: "web", label: "Open the Control UI in browser" },
        { value: "later", label: "Skip for now" },
      ],
      initialValue: "tui",
    });

    if (hatchChoice === "tui") {
      restoreTerminalState("pre-onboarding tui", { resumeStdinIfPaused: true });
      await runTui({
        url: links.wsUrl,
        token: settings.authMode === "token" ? settings.gatewayToken : undefined,
        password: settings.authMode === "password" ? nextConfig.gateway?.auth?.password : "",
        // Safety: onboarding TUI should not auto-deliver to lastProvider/lastTo.
        deliver: false,
        message: shouldHatch ? "Wake up, my friend!" : undefined,
      });
      launchedTui = true;
    } else if (hatchChoice === "web") {
      const browserSupport = await detectBrowserOpenSupport();
      if (browserSupport.ok) {
        controlUiOpened = await openUrl(authedUrl);
        if (!controlUiOpened) {
          controlUiOpenHint = formatControlUiSshHint({
            port: settings.port,
            basePath: controlUiBasePath,
            token: settings.authMode === "token" ? settings.gatewayToken : undefined,
          });
        }
      } else {
        controlUiOpenHint = formatControlUiSshHint({
          port: settings.port,
          basePath: controlUiBasePath,
          token: settings.authMode === "token" ? settings.gatewayToken : undefined,
        });
      }
      await prompter.note(
        [
          `Dashboard link (with token): ${authedUrl}`,
          controlUiOpened
            ? "Opened in your browser. Keep that tab open to manage ANIMA."
            : "Copy this URL into a browser on this machine to access the ANIMA dashboard.",
          controlUiOpenHint,
        ]
          .filter(Boolean)
          .join("\n"),
        "Dashboard ready",
      );
    } else {
      await prompter.note(
        `Launch the dashboard anytime: ${formatCliCommand("anima dashboard --no-open")}`,
        "Skipped",
      );
    }
  } else if (opts.skipUi) {
    await prompter.note("Skipping Control UI and TUI prompts.", "Control UI");
  }

  await prompter.note(
    [
      "Back up your agent workspace regularly. Your agent's identity and memory live here.",
      "Documentation: https://docs.noxsoft.net/anima/concepts/agent-workspace",
    ].join("\n"),
    "Workspace backup",
  );

  await prompter.note(
    "Running AI agents locally carries inherent risk. Harden your setup: https://docs.noxsoft.net/anima/security",
    "Security reminder",
  );

  await setupOnboardingShellCompletion({ flow, prompter });

  const shouldOpenControlUi =
    !opts.skipUi &&
    settings.authMode === "token" &&
    Boolean(settings.gatewayToken) &&
    hatchChoice === null;
  if (shouldOpenControlUi) {
    const browserSupport = await detectBrowserOpenSupport();
    if (browserSupport.ok) {
      controlUiOpened = await openUrl(authedUrl);
      if (!controlUiOpened) {
        controlUiOpenHint = formatControlUiSshHint({
          port: settings.port,
          basePath: controlUiBasePath,
          token: settings.gatewayToken,
        });
      }
    } else {
      controlUiOpenHint = formatControlUiSshHint({
        port: settings.port,
        basePath: controlUiBasePath,
        token: settings.gatewayToken,
      });
    }

    await prompter.note(
      [
        `Dashboard link (with token): ${authedUrl}`,
        controlUiOpened
          ? "Opened in your browser. Keep that tab open to manage ANIMA."
          : "Copy this URL into a browser on this machine to access the ANIMA dashboard.",
        controlUiOpenHint,
      ]
        .filter(Boolean)
        .join("\n"),
      "Dashboard ready",
    );
  }

  const webSearchKey = (nextConfig.tools?.web?.search?.apiKey ?? "").trim();
  const webSearchEnv = (process.env.BRAVE_API_KEY ?? "").trim();
  const hasWebSearchKey = Boolean(webSearchKey || webSearchEnv);
  await prompter.note(
    hasWebSearchKey
      ? [
          "Web search is enabled. Your agent can query the web when needed.",
          "",
          webSearchKey
            ? "API key: stored in config (tools.web.search.apiKey)."
            : "API key: provided via BRAVE_API_KEY env var (Gateway environment).",
          "Documentation: https://docs.noxsoft.net/anima/tools/web",
        ].join("\n")
      : [
          "To enable web search for your agent, provide a Brave Search API key.",
          "",
          "ANIMA uses Brave Search for the `web_search` tool.",
          "Without a key, web search is unavailable.",
          "",
          "Configure interactively:",
          `  ${formatCliCommand("anima configure --section web")}`,
          "",
          "Or set BRAVE_API_KEY in the Gateway environment.",
          "Documentation: https://docs.noxsoft.net/anima/tools/web",
        ].join("\n"),
    "Web search (optional)",
  );

  await prompter.note(
    "Explore what others are building with ANIMA: https://noxsoft.net/showcase",
    "Next steps",
  );

  await prompter.outro(
    controlUiOpened
      ? "ANIMA setup complete. Dashboard is open — keep that tab to manage your agent."
      : seededInBackground
        ? "ANIMA setup complete. Control UI seeded in the background. Open it anytime with the dashboard link above."
        : "ANIMA setup complete. Use the dashboard link above to manage your agent.",
  );

  return { launchedTui };
}
