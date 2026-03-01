import type { Command } from "commander";
import type { ProgramContext } from "./context.js";
import { buildParseArgv, getPrimaryCommand, hasHelpOrVersion } from "../argv.js";
import { resolveActionArgs } from "./helpers.js";
import { registerSubCliCommands } from "./register.subclis.js";

type CommandRegisterParams = {
  program: Command;
  ctx: ProgramContext;
  argv: string[];
};

export type CommandRegistration = {
  id: string;
  register: (params: CommandRegisterParams) => void;
};

type CoreCliEntry = {
  commands: Array<{ name: string; description: string }>;
  register: (params: CommandRegisterParams) => Promise<void> | void;
};

const shouldRegisterCorePrimaryOnly = (argv: string[]) => {
  if (hasHelpOrVersion(argv)) {
    return false;
  }
  return true;
};

const coreEntries: CoreCliEntry[] = [
  {
    commands: [{ name: "setup", description: "Initialize ANIMA config and the agent workspace" }],
    register: async ({ program }) => {
      const mod = await import("./register.setup.js");
      mod.registerSetupCommand(program);
    },
  },
  {
    commands: [
      {
        name: "onboard",
        description: "Interactive wizard for Gateway, workspace, and skills setup",
      },
    ],
    register: async ({ program }) => {
      const mod = await import("./register.onboard.js");
      mod.registerOnboardCommand(program);
    },
  },
  {
    commands: [
      {
        name: "configure",
        description: "Interactive configuration for credentials, devices, and agent defaults",
      },
    ],
    register: async ({ program }) => {
      const mod = await import("./register.configure.js");
      mod.registerConfigureCommand(program);
    },
  },
  {
    commands: [{ name: "config", description: "Read, write, and manage ANIMA configuration" }],
    register: async ({ program }) => {
      const mod = await import("../config-cli.js");
      mod.registerConfigCli(program);
    },
  },
  {
    commands: [
      { name: "doctor", description: "Diagnose and repair Gateway and channel issues" },
      { name: "dashboard", description: "Launch the ANIMA Control UI in your browser" },
      { name: "reset", description: "Reset local config and state while preserving the CLI" },
      {
        name: "uninstall",
        description: "Remove the Gateway service and local data",
      },
    ],
    register: async ({ program }) => {
      const mod = await import("./register.maintenance.js");
      mod.registerMaintenanceCommands(program);
    },
  },
  {
    commands: [{ name: "message", description: "Send messages and perform channel actions" }],
    register: async ({ program, ctx }) => {
      const mod = await import("./register.message.js");
      mod.registerMessageCommands(program, ctx);
    },
  },
  {
    commands: [{ name: "memory", description: "Persistent memory search, indexing, and status" }],
    register: async ({ program }) => {
      const mod = await import("../memory-cli.js");
      mod.registerMemoryCli(program);
    },
  },
  {
    commands: [
      { name: "agent", description: "Run an agent turn via the Gateway" },
      { name: "agents", description: "Manage isolated agent workspaces, auth, and routing" },
    ],
    register: async ({ program, ctx }) => {
      const mod = await import("./register.agent.js");
      mod.registerAgentCommands(program, { agentChannelOptions: ctx.agentChannelOptions });
    },
  },
  {
    commands: [
      { name: "status", description: "Channel health and session activity overview" },
      { name: "health", description: "Probe the running Gateway for live health" },
      { name: "sessions", description: "List and inspect conversation sessions" },
    ],
    register: async ({ program }) => {
      const mod = await import("./register.status-health-sessions.js");
      mod.registerStatusHealthSessionsCommands(program);
    },
  },
  {
    commands: [{ name: "browser", description: "Control ANIMA's dedicated browser instance" }],
    register: async ({ program }) => {
      const mod = await import("../browser-cli.js");
      mod.registerBrowserCli(program);
    },
  },
  {
    commands: [
      { name: "start", description: "Launch the ANIMA daemon with heartbeat and REPL" },
      { name: "init", description: "Scaffold the ~/.anima/ identity and workspace structure" },
      { name: "migrate", description: "Import identity from Claude Coherence Protocol" },
      { name: "ask", description: "Queue a task to the running ANIMA daemon" },
      { name: "pulse", description: "Show the daemon's last heartbeat and status" },
      { name: "soul", description: "View the current persistent identity summary" },
      { name: "wander", description: "Initiate an autonomous freedom exploration session" },
      { name: "journal", description: "Read and write persistent journal entries" },
    ],
    register: async ({ program }) => {
      const mod = await import("./register.anima.js");
      mod.registerAnimaCommands(program);
    },
  },
];

export function getCoreCliCommandNames(): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const entry of coreEntries) {
    for (const cmd of entry.commands) {
      if (seen.has(cmd.name)) {
        continue;
      }
      seen.add(cmd.name);
      names.push(cmd.name);
    }
  }
  return names;
}

function removeCommand(program: Command, command: Command) {
  const commands = program.commands as Command[];
  const index = commands.indexOf(command);
  if (index >= 0) {
    commands.splice(index, 1);
  }
}

function registerLazyCoreCommand(
  program: Command,
  ctx: ProgramContext,
  entry: CoreCliEntry,
  command: { name: string; description: string },
) {
  const placeholder = program.command(command.name).description(command.description);
  placeholder.allowUnknownOption(true);
  placeholder.allowExcessArguments(true);
  placeholder.action(async (...actionArgs) => {
    // Some registrars install multiple top-level commands (e.g. status/health/sessions).
    // Remove placeholders/old registrations for all names in the entry before re-registering.
    for (const cmd of entry.commands) {
      const existing = program.commands.find((c) => c.name() === cmd.name);
      if (existing) {
        removeCommand(program, existing);
      }
    }
    await entry.register({ program, ctx, argv: process.argv });
    const actionCommand = actionArgs.at(-1) as Command | undefined;
    const root = actionCommand?.parent ?? program;
    const rawArgs = (root as Command & { rawArgs?: string[] }).rawArgs;
    const actionArgsList = resolveActionArgs(actionCommand);
    const fallbackArgv = actionCommand?.name()
      ? [actionCommand.name(), ...actionArgsList]
      : actionArgsList;
    const parseArgv = buildParseArgv({
      programName: program.name(),
      rawArgs,
      fallbackArgv,
    });
    await program.parseAsync(parseArgv);
  });
}

export async function registerCoreCliByName(
  program: Command,
  ctx: ProgramContext,
  name: string,
  argv: string[] = process.argv,
): Promise<boolean> {
  const entry = coreEntries.find((candidate) =>
    candidate.commands.some((cmd) => cmd.name === name),
  );
  if (!entry) {
    return false;
  }

  // Some registrars install multiple top-level commands (e.g. status/health/sessions).
  // Remove placeholders/old registrations for all names in the entry before re-registering.
  for (const cmd of entry.commands) {
    const existing = program.commands.find((c) => c.name() === cmd.name);
    if (existing) {
      removeCommand(program, existing);
    }
  }
  await entry.register({ program, ctx, argv });
  return true;
}

export function registerCoreCliCommands(program: Command, ctx: ProgramContext, argv: string[]) {
  const primary = getPrimaryCommand(argv);
  if (primary && shouldRegisterCorePrimaryOnly(argv)) {
    const entry = coreEntries.find((candidate) =>
      candidate.commands.some((cmd) => cmd.name === primary),
    );
    if (entry) {
      const cmd = entry.commands.find((c) => c.name === primary);
      if (cmd) {
        registerLazyCoreCommand(program, ctx, entry, cmd);
      }
      return;
    }
  }

  for (const entry of coreEntries) {
    for (const cmd of entry.commands) {
      registerLazyCoreCommand(program, ctx, entry, cmd);
    }
  }
}

export function registerProgramCommands(
  program: Command,
  ctx: ProgramContext,
  argv: string[] = process.argv,
) {
  registerCoreCliCommands(program, ctx, argv);
  registerSubCliCommands(program, argv);
}
