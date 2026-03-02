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
            },
            defaultRuntime,
          );
          return;
        }
        await setupCommand({ workspace: opts.workspace as string | undefined }, defaultRuntime);
      });
    });
}
