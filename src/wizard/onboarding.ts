import type {
  AuthChoice,
  GatewayAuthChoice,
  OnboardMode,
  OnboardOptions,
} from "../commands/onboard-types.js";
import type { AnimaConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { QuickstartGatewayDefaults, WizardFlow } from "./onboarding.types.js";
import { ensureAuthProfileStore } from "../agents/auth-profiles.js";
import { readClaudeCliCredentials } from "../agents/cli-credentials.js";
import { ensureAuthenticated } from "../auth/noxsoft-auth.js";
import { formatCliCommand } from "../cli/command-format.js";
import { promptAuthChoiceGrouped } from "../commands/auth-choice-prompt.js";
import {
  applyAuthChoice,
  resolvePreferredProviderForAuthChoice,
  warnIfModelConfigLooksOff,
} from "../commands/auth-choice.js";
import { applyPrimaryModel, promptDefaultModel } from "../commands/model-picker.js";
import { applyNoxsoftBootstrap } from "../commands/noxsoft-bootstrap.js";
// promptCustomApiConfig removed — NoxSoft auth only
import {
  applyWizardMetadata,
  DEFAULT_WORKSPACE,
  ensureWorkspaceAndSessions,
  printWizardHeader,
  summarizeExistingConfig,
} from "../commands/onboard-helpers.js";
import { setupInternalHooks } from "../commands/onboard-hooks.js";
import { readConfigFileSnapshot, resolveGatewayPort, writeConfigFile } from "../config/config.js";
import { logConfigUpdated } from "../config/logging.js";
import { defaultRuntime } from "../runtime.js";
import { resolveUserPath } from "../utils.js";
import { finalizeOnboardingWizard } from "./onboarding.finalize.js";
import { configureGatewayForOnboarding } from "./onboarding.gateway-config.js";
import { WizardCancelledError, type WizardPrompter } from "./prompts.js";

async function requireRiskAcknowledgement(params: {
  opts: OnboardOptions;
  prompter: WizardPrompter;
}) {
  if (params.opts.acceptRisk === true) {
    return;
  }

  await params.prompter.note(
    [
      "ANIMA grants AI agents direct tool access on your machine.",
      "NoxSoft builds with consent-based architecture and ethical guardrails,",
      "but you are responsible for your own security posture.",
      "Use allowlists, sandboxing, and least-privilege tool configurations.",
    ].join("\n"),
    "Security",
  );

  const ok = await params.prompter.confirm({
    message: "I acknowledge the risks and accept responsibility. Continue?",
    initialValue: false,
  });
  if (!ok) {
    throw new WizardCancelledError("risk not accepted");
  }
}

export async function runOnboardingWizard(
  opts: OnboardOptions,
  runtime: RuntimeEnv = defaultRuntime,
  prompter: WizardPrompter,
) {
  printWizardHeader(runtime);
  await prompter.intro("Welcome to ANIMA — NoxSoft's AI life system.");
  await requireRiskAcknowledgement({ opts, prompter });

  // --- Step 1: Load existing config (merge, never prompt) ---
  const snapshot = await readConfigFileSnapshot();
  const baseConfig: AnimaConfig = snapshot.valid ? snapshot.config : {};
  const isFreshInstance = !snapshot.exists;

  if (snapshot.exists && !snapshot.valid) {
    await prompter.note(summarizeExistingConfig(baseConfig), "Invalid configuration detected");
    if (snapshot.issues.length > 0) {
      await prompter.note(
        snapshot.issues.map((iss) => `- ${iss.path}: ${iss.message}`).join("\n"),
        "Config issues",
      );
    }
    await prompter.outro(
      `Configuration is invalid. Run \`${formatCliCommand("anima doctor")}\` to diagnose and repair, then re-run setup.`,
    );
    runtime.exit(1);
    return;
  }

  // Always quickstart, always local
  const flow: WizardFlow = "quickstart";
  const mode: OnboardMode = "local";

  // Use default workspace (or existing config value)
  const workspaceDir = resolveUserPath(
    opts.workspace?.trim() || baseConfig.agents?.defaults?.workspace || DEFAULT_WORKSPACE,
  );

  let nextConfig: AnimaConfig = {
    ...baseConfig,
    agents: {
      ...baseConfig.agents,
      defaults: {
        ...baseConfig.agents?.defaults,
        workspace: workspaceDir,
      },
    },
    gateway: {
      ...baseConfig.gateway,
      mode: "local",
    },
  };

  // --- Step 2: Required NoxSoft auth ---
  try {
    const auth = await ensureAuthenticated({
      name: opts.noxsoftAgentName,
      displayName: opts.noxsoftDisplayName,
      description: "ANIMA onboarding wizard",
    });
    nextConfig = applyNoxsoftBootstrap(nextConfig, auth.agent);
    await prompter.note(
      `${auth.registered ? "Registered" : "Authenticated"} as ${auth.agent.display_name} (@${auth.agent.name}).`,
      "NoxSoft authentication",
    );
  } catch {
    // Self-registration failed — prompt the user for an invite code
    await prompter.note(
      "Automatic agent registration is unavailable.\nIf you have a NoxSoft agent registration code, enter it below.",
      "NoxSoft authentication",
    );
    const inviteCode = await prompter.text({
      message: "Agent registration code (e.g. NX-XXXXXX):",
      placeholder: "NX-",
      validate: (v: string) => {
        const trimmed = v.trim();
        if (!trimmed) {
          return "A registration code is required.";
        }
        return undefined;
      },
    });
    try {
      const auth = await ensureAuthenticated({
        name: opts.noxsoftAgentName,
        displayName: opts.noxsoftDisplayName,
        description: "ANIMA onboarding wizard",
        inviteCode: typeof inviteCode === "string" ? inviteCode.trim() : undefined,
      });
      nextConfig = applyNoxsoftBootstrap(nextConfig, auth.agent);
      await prompter.note(
        `${auth.registered ? "Registered" : "Authenticated"} as ${auth.agent.display_name} (@${auth.agent.name}).`,
        "NoxSoft authentication",
      );
    } catch (retryError) {
      const message =
        retryError instanceof Error && retryError.message
          ? retryError.message
          : "Unknown NoxSoft authentication error.";
      await prompter.note(message, "NoxSoft authentication failed");
      runtime.exit(1);
      return;
    }
  }

  // --- Step 2.5: Auto-detect Claude Code credentials ---
  // Try to read Claude Code OAuth credentials from the system automatically.
  // Sources (in priority order):
  //   1. macOS Keychain (darwin)
  //   2. Windows Credential Manager (win32)
  //   3. ~/.claude/.credentials.json (cross-platform)
  //   4. OpenClaw auth-profiles.json (same infrastructure, best Windows fallback)
  //
  // If found, we skip the auth prompt entirely and configure ANIMA silently.
  // The user can always re-run `anima configure` to change the provider.
  let autoDetectedAuth: { profileId: string; token: string } | null = null;
  {
    const detected = readClaudeCliCredentials({ allowKeychainPrompt: false });
    if (detected) {
      const token =
        detected.type === "token"
          ? detected.token
          : detected.type === "oauth"
            ? detected.access
            : null;
      if (token) {
        autoDetectedAuth = { profileId: "anthropic:default", token };
        await prompter.note(
          `Found Claude Code sign-in credentials on this machine.\nANIMA will use these automatically — no separate login needed.\n\nTo use a different provider, run \`anima configure\` after setup.`,
          "Claude Code detected ✓",
        );
      }
    }
  }

  // --- Step 3: Model/auth provider selection ---
  const authStore = ensureAuthProfileStore(undefined, {
    allowKeychainPrompt: false,
  });

  // If we auto-detected Claude Code credentials, pre-populate the auth store
  // and skip the interactive prompt.
  if (autoDetectedAuth) {
    authStore.profiles[autoDetectedAuth.profileId] = {
      type: "token",
      provider: "anthropic",
      token: autoDetectedAuth.token,
    } as never;
    authStore.lastGood ??= {};
    authStore.lastGood.anthropic = autoDetectedAuth.profileId;
  }

  const authChoiceFromPrompt = opts.authChoice === undefined && !autoDetectedAuth;
  const authChoice: AuthChoice =
    opts.authChoice ??
    (autoDetectedAuth
      ? "apiKey"
      : await promptAuthChoiceGrouped({
          prompter,
          store: authStore,
          includeSkip: false,
        }));

  {
    const authResult = await applyAuthChoice({
      authChoice,
      config: nextConfig,
      prompter,
      runtime,
      setDefaultModel: true,
    });
    nextConfig = authResult.config;
  }

  // --- Step 4: Model selection ---
  if (authChoiceFromPrompt) {
    const modelSelection = await promptDefaultModel({
      config: nextConfig,
      prompter,
      allowKeep: true,
      ignoreAllowlist: true,
      includeVllm: true,
      preferredProvider: resolvePreferredProviderForAuthChoice(authChoice),
    });
    if (modelSelection.config) {
      nextConfig = modelSelection.config;
    }
    if (modelSelection.model) {
      nextConfig = applyPrimaryModel(nextConfig, modelSelection.model);
    }
  }

  await warnIfModelConfigLooksOff(nextConfig, prompter);

  // --- Step 5: Auto-configure gateway with quickstart defaults ---
  const localPort = resolveGatewayPort(baseConfig);

  const quickstartGateway: QuickstartGatewayDefaults = (() => {
    const hasExisting =
      typeof baseConfig.gateway?.port === "number" ||
      baseConfig.gateway?.bind !== undefined ||
      baseConfig.gateway?.auth?.mode !== undefined ||
      baseConfig.gateway?.auth?.token !== undefined ||
      baseConfig.gateway?.auth?.password !== undefined ||
      baseConfig.gateway?.customBindHost !== undefined ||
      baseConfig.gateway?.tailscale?.mode !== undefined;

    const bindRaw = baseConfig.gateway?.bind;
    const bind =
      bindRaw === "loopback" ||
      bindRaw === "lan" ||
      bindRaw === "auto" ||
      bindRaw === "custom" ||
      bindRaw === "tailnet"
        ? bindRaw
        : "loopback";

    let authMode: GatewayAuthChoice = "token";
    if (
      baseConfig.gateway?.auth?.mode === "token" ||
      baseConfig.gateway?.auth?.mode === "password"
    ) {
      authMode = baseConfig.gateway.auth.mode;
    } else if (baseConfig.gateway?.auth?.token) {
      authMode = "token";
    } else if (baseConfig.gateway?.auth?.password) {
      authMode = "password";
    }

    const tailscaleRaw = baseConfig.gateway?.tailscale?.mode;
    const tailscaleMode =
      tailscaleRaw === "off" || tailscaleRaw === "serve" || tailscaleRaw === "funnel"
        ? tailscaleRaw
        : "off";

    return {
      hasExisting,
      port: resolveGatewayPort(baseConfig),
      bind,
      authMode,
      tailscaleMode,
      token: baseConfig.gateway?.auth?.token,
      password: baseConfig.gateway?.auth?.password,
      customBindHost: baseConfig.gateway?.customBindHost,
      tailscaleResetOnExit: baseConfig.gateway?.tailscale?.resetOnExit ?? false,
    };
  })();

  const gateway = await configureGatewayForOnboarding({
    flow,
    baseConfig,
    nextConfig,
    localPort,
    quickstartGateway,
    prompter,
    runtime,
  });
  nextConfig = gateway.nextConfig;
  const settings = gateway.settings;

  // --- Step 6: Write config, setup workspace, hooks, finalize ---
  await writeConfigFile(nextConfig);
  logConfigUpdated(runtime);
  await ensureWorkspaceAndSessions(workspaceDir, runtime, {
    skipBootstrap: Boolean(nextConfig.agents?.defaults?.skipBootstrap),
    seedBootstrapOnFirstRun: isFreshInstance,
  });

  // Setup hooks (session memory on /new)
  nextConfig = await setupInternalHooks(nextConfig, runtime, prompter);

  nextConfig = applyWizardMetadata(nextConfig, { command: "onboard", mode });
  await writeConfigFile(nextConfig);

  const { launchedTui } = await finalizeOnboardingWizard({
    flow,
    opts,
    baseConfig,
    nextConfig,
    workspaceDir,
    settings,
    allowHatching: isFreshInstance,
    prompter,
    runtime,
  });
  if (launchedTui) {
    return;
  }
}
