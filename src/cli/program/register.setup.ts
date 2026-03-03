import type { Command } from "commander";
import { onboardCommand } from "../../commands/onboard.js";
import { setupCommand } from "../../commands/setup.js";
import { defaultRuntime } from "../../runtime.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { hasExplicitOptions } from "../command-options.js";

export function registerSetupCommand(program: Command) {
  program
    .command("setup")
    .description("Initialize ANIMA config and the agent workspace")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/setup", "docs.noxsoft.net/anima/cli/setup")}\n`,
    )
    .option(
      "--workspace <dir>",
      "Agent workspace directory (default: ~/.anima/workspace; stored as agents.defaults.workspace)",
    )
    .option("--preset <name>", "Apply a setup preset (supported: noxsoft-autonomy)")
    .option(
      "--heartbeat-every <duration>",
      "Set agents.defaults.heartbeat.every (e.g. 5m, 30m, 1h)",
    )
    .option(
      "--heartbeat-target <target>",
      "Set agents.defaults.heartbeat.target (last|none|<channel-id>)",
    )
    .option("--heartbeat-prompt <text>", "Set agents.defaults.heartbeat.prompt")
    .option(
      "--noxsoft-agent-name <slug>",
      "Preferred NoxSoft agent name for automatic registration",
    )
    .option(
      "--noxsoft-display-name <name>",
      "Preferred NoxSoft display name for automatic registration",
    )
    .option("--wizard", "Run the interactive onboarding wizard", false)
    .option("--non-interactive", "Run the wizard without prompts", false)
    .action(async (opts, command) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const hasWizardFlags = hasExplicitOptions(command, ["wizard", "nonInteractive"]);
        if (opts.wizard || hasWizardFlags) {
          await onboardCommand(
            {
              workspace: opts.workspace as string | undefined,
              nonInteractive: Boolean(opts.nonInteractive),
              noxsoftAgentName: opts.noxsoftAgentName as string | undefined,
              noxsoftDisplayName: opts.noxsoftDisplayName as string | undefined,
            },
            defaultRuntime,
          );
          return;
        }
        await setupCommand(
          {
            workspace: opts.workspace as string | undefined,
            preset: opts.preset as string | undefined,
            heartbeatEvery: opts.heartbeatEvery as string | undefined,
            heartbeatTarget: opts.heartbeatTarget as string | undefined,
            heartbeatPrompt: opts.heartbeatPrompt as string | undefined,
            noxsoftAgentName: opts.noxsoftAgentName as string | undefined,
            noxsoftDisplayName: opts.noxsoftDisplayName as string | undefined,
          },
          defaultRuntime,
        );
      });
    });
}
