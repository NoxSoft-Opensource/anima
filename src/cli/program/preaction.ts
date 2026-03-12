import type { Command } from "commander";
import { setVerbose } from "../../globals.js";
import { isTruthyEnvValue } from "../../infra/env.js";
import { defaultRuntime } from "../../runtime.js";
import { getCommandPath, getVerboseFlag, hasHelpOrVersion } from "../argv.js";
import { emitCliBanner } from "../banner.js";
import { resolveCliName } from "../cli-name.js";

function setProcessTitleForCommand(actionCommand: Command) {
  let current: Command = actionCommand;
  while (current.parent && current.parent.parent) {
    current = current.parent;
  }
  const name = current.name();
  const cliName = resolveCliName();
  if (!name || name === cliName) {
    return;
  }
  process.title = `${cliName}-${name}`;
}

// Commands that need channel plugins loaded
const PLUGIN_REQUIRED_COMMANDS = new Set(["message", "channels", "directory"]);
const NOXSOFT_AUTH_SKIP_ROOT_COMMANDS = new Set(["onboard", "setup", "register", "completion"]);

export function shouldRunNoxsoftAuthPreflight(params: {
  commandPath: string[];
  env?: NodeJS.ProcessEnv;
}): boolean {
  const env = params.env ?? process.env;
  if (env.VITEST === "true") {
    return false;
  }
  if (isTruthyEnvValue(env.ANIMA_SKIP_NOXSOFT_AUTH_PREACTION)) {
    return false;
  }
  const root = params.commandPath[0];
  if (!root) {
    return true;
  }
  return !NOXSOFT_AUTH_SKIP_ROOT_COMMANDS.has(root);
}

async function runNoxsoftAuthPreflight(params: { commandPath: string[] }) {
  if (!shouldRunNoxsoftAuthPreflight(params)) {
    return null;
  }

  const { ensureAuthenticated } = await import("../../auth/noxsoft-auth.js");
  try {
    const auth = await ensureAuthenticated({
      description: "ANIMA CLI pre-action authentication",
    });
    if (auth.registered) {
      defaultRuntime.log(`NoxSoft registered: ${auth.agent.display_name} (@${auth.agent.name})`);
    }
    return auth;
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Unknown NoxSoft authentication error.";
    defaultRuntime.error(`NoxSoft authentication is required.\n${message}`);
    defaultRuntime.exit(1);
    return null;
  }
}

export function registerPreActionHooks(program: Command, programVersion: string) {
  program.hook("preAction", async (_thisCommand, actionCommand) => {
    setProcessTitleForCommand(actionCommand);
    const argv = process.argv;
    if (hasHelpOrVersion(argv)) {
      return;
    }
    const commandPath = getCommandPath(argv, 2);
    const auth = await runNoxsoftAuthPreflight({ commandPath });
    const hideBanner =
      isTruthyEnvValue(process.env.ANIMA_HIDE_BANNER) ||
      commandPath[0] === "update" ||
      commandPath[0] === "completion" ||
      (commandPath[0] === "plugins" && commandPath[1] === "update");
    if (!hideBanner) {
      emitCliBanner(programVersion);
    }
    const verbose = getVerboseFlag(argv, { includeDebug: true });
    setVerbose(verbose);
    if (!verbose) {
      process.env.NODE_NO_WARNINGS ??= "1";
    }
    if (commandPath[0] === "doctor" || commandPath[0] === "completion") {
      return;
    }
    const { ensureConfigReady } = await import("./config-guard.js");
    await ensureConfigReady({ runtime: defaultRuntime, commandPath });
    if (auth) {
      const { ensureNoxsoftBootstrapPersisted } =
        await import("../../commands/noxsoft-bootstrap.js");
      await ensureNoxsoftBootstrapPersisted({
        agent: auth.agent,
      });
    }
    // Load plugins for commands that need channel access
    if (PLUGIN_REQUIRED_COMMANDS.has(commandPath[0])) {
      const { ensurePluginRegistryLoaded } = await import("../plugin-registry.js");
      ensurePluginRegistryLoaded();
    }
  });
}
