import type { AnimaConfig } from "../../config/config.js";
import type { RuntimeEnv } from "../../runtime.js";
import type { OnboardOptions } from "../onboard-types.js";
import { ensureAuthenticated, type NoxSoftAuthResult } from "../../auth/noxsoft-auth.js";
import { formatCliCommand } from "../../cli/command-format.js";
import { writeConfigFile } from "../../config/config.js";
import { logConfigUpdated } from "../../config/logging.js";
import { applyNoxsoftBootstrap } from "../noxsoft-bootstrap.js";
import { applyWizardMetadata } from "../onboard-helpers.js";

export async function runNonInteractiveOnboardingRemote(params: {
  opts: OnboardOptions;
  runtime: RuntimeEnv;
  baseConfig: AnimaConfig;
}) {
  const { opts, runtime, baseConfig } = params;
  const mode = "remote" as const;

  const remoteUrl = opts.remoteUrl?.trim();
  if (!remoteUrl) {
    runtime.error("Missing --remote-url for remote mode.");
    runtime.exit(1);
    return;
  }

  let auth: NoxSoftAuthResult;
  try {
    auth = await ensureAuthenticated({
      name: opts.noxsoftAgentName,
      displayName: opts.noxsoftDisplayName,
      description: "ANIMA non-interactive remote onboarding",
    });
    if (!opts.json) {
      runtime.log(
        `NoxSoft ${auth.registered ? "registered" : "authenticated"}: ${auth.agent.display_name} (@${auth.agent.name})`,
      );
    }
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Unknown NoxSoft authentication error.";
    runtime.error(`NoxSoft authentication is required.\n${message}`);
    runtime.exit(1);
    return;
  }

  let nextConfig: AnimaConfig = {
    ...baseConfig,
    gateway: {
      ...baseConfig.gateway,
      mode: "remote",
      remote: {
        url: remoteUrl,
        token: opts.remoteToken?.trim() || undefined,
      },
    },
  };
  nextConfig = applyNoxsoftBootstrap(nextConfig, auth.agent);
  nextConfig = applyWizardMetadata(nextConfig, { command: "onboard", mode });
  await writeConfigFile(nextConfig);
  logConfigUpdated(runtime);

  const payload = {
    mode,
    remoteUrl,
    auth: opts.remoteToken ? "token" : "none",
  };
  if (opts.json) {
    runtime.log(JSON.stringify(payload, null, 2));
  } else {
    runtime.log(`Remote gateway: ${remoteUrl}`);
    runtime.log(`Auth: ${payload.auth}`);
    runtime.log(
      `Tip: run \`${formatCliCommand("anima configure --section web")}\` to store your Brave API key for web_search. Docs: https://docs.noxsoft.net/anima/tools/web`,
    );
  }
}
