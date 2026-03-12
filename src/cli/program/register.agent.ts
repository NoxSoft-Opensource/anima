import type { Command } from "commander";
import { DEFAULT_CHAT_CHANNEL } from "../../channels/registry.js";
import { agentCliCommand } from "../../commands/agent-via-gateway.js";
import {
  agentsAddCommand,
  agentsDeleteCommand,
  agentsListCommand,
  agentsReadinessCommand,
  agentsSetIdentityCommand,
} from "../../commands/agents.js";
import { setVerbose } from "../../globals.js";
import { defaultRuntime } from "../../runtime.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { hasExplicitOptions } from "../command-options.js";
import { createDefaultDeps } from "../deps.js";
import { formatHelpExamples } from "../help-format.js";
import { collectOption } from "./helpers.js";

export function registerAgentCommands(program: Command, args: { agentChannelOptions: string }) {
  program
    .command("agent")
    .description("Execute an agent turn via the Gateway (use --local for embedded)")
    .requiredOption("-m, --message <text>", "Message body for the agent")
    .option("-t, --to <number>", "Recipient number in E.164 used to derive the session key")
    .option("--session-id <id>", "Use an explicit session id")
    .option("--agent <id>", "Agent id (overrides routing bindings)")
    .option("--model <id>", "Model override for this session/run (provider/model or alias)")
    .option("--thinking <level>", "Thinking level: off | minimal | low | medium | high")
    .option("--verbose <on|off>", "Persist agent verbose level for the session")
    .option(
      "--channel <channel>",
      `Delivery channel: ${args.agentChannelOptions} (default: ${DEFAULT_CHAT_CHANNEL})`,
    )
    .option("--reply-to <target>", "Delivery target override (separate from session routing)")
    .option("--reply-channel <channel>", "Delivery channel override (separate from routing)")
    .option("--reply-account <id>", "Delivery account id override")
    .option(
      "--local",
      "Run the embedded agent locally (requires model provider API keys in your shell)",
      false,
    )
    .option("--deliver", "Send the agent's reply back to the selected channel", false)
    .option("--json", "Output result as JSON", false)
    .option(
      "--timeout <seconds>",
      "Override agent command timeout (seconds, default 600 or config value)",
    )
    .addHelpText(
      "after",
      () =>
        `
${theme.heading("Examples:")}
${formatHelpExamples([
  ['anima agent --to +15555550123 --message "status update"', "Start a new session."],
  ['anima agent --agent ops --message "Summarize logs"', "Use a specific agent."],
  [
    'anima agent --session-id 1234 --message "Summarize inbox" --thinking medium',
    "Target a session with explicit thinking level.",
  ],
  [
    'anima agent --to +15555550123 --message "Trace logs" --verbose on --json',
    "Enable verbose logging and JSON output.",
  ],
  ['anima agent --to +15555550123 --message "Summon reply" --deliver', "Deliver reply."],
  [
    'anima agent --agent ops --message "Generate report" --deliver --reply-channel slack --reply-to "#reports"',
    "Send reply to a different channel/target.",
  ],
])}

${theme.muted("Docs:")} ${formatDocsLink("/cli/agent", "docs.noxsoft.net/anima/cli/agent")}`,
    )
    .action(async (opts) => {
      const verboseLevel = typeof opts.verbose === "string" ? opts.verbose.toLowerCase() : "";
      setVerbose(verboseLevel === "on");
      // Build default deps (keeps parity with other commands; future-proofing).
      const deps = createDefaultDeps();
      await runCommandWithRuntime(defaultRuntime, async () => {
        await agentCliCommand(opts, defaultRuntime, deps);
      });
    });

  const agents = program
    .command("agents")
    .description("Manage isolated agent workspaces, auth, and routing")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/agents", "docs.noxsoft.net/anima/cli/agents")}\n`,
    );

  agents
    .command("list")
    .description("List all configured agents and their bindings")
    .option("--json", "Output JSON instead of text", false)
    .option("--bindings", "Include routing bindings", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await agentsListCommand(
          { json: Boolean(opts.json), bindings: Boolean(opts.bindings) },
          defaultRuntime,
        );
      });
    });

  agents
    .command("add [name]")
    .description("Create a new isolated agent with its own workspace")
    .option("--workspace <dir>", "Workspace directory for the new agent")
    .option("--model <id>", "Model id for this agent")
    .option("--agent-dir <dir>", "Agent state directory for this agent")
    .option("--bind <channel[:accountId]>", "Route channel binding (repeatable)", collectOption, [])
    .option("--non-interactive", "Disable prompts; requires --workspace", false)
    .option("--json", "Output JSON summary", false)
    .action(async (name, opts, command) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const hasFlags = hasExplicitOptions(command, [
          "workspace",
          "model",
          "agentDir",
          "bind",
          "nonInteractive",
        ]);
        await agentsAddCommand(
          {
            name: typeof name === "string" ? name : undefined,
            workspace: opts.workspace as string | undefined,
            model: opts.model as string | undefined,
            agentDir: opts.agentDir as string | undefined,
            bind: Array.isArray(opts.bind) ? (opts.bind as string[]) : undefined,
            nonInteractive: Boolean(opts.nonInteractive),
            json: Boolean(opts.json),
          },
          defaultRuntime,
          { hasFlags },
        );
      });
    });

  agents
    .command("set-identity")
    .description("Update an agent's persistent identity (name, theme, emoji, avatar)")
    .option("--agent <id>", "Agent id to update")
    .option("--workspace <dir>", "Workspace directory used to locate the agent + IDENTITY.md")
    .option("--identity-file <path>", "Explicit IDENTITY.md path to read")
    .option("--from-identity", "Read values from IDENTITY.md", false)
    .option("--name <name>", "Identity name")
    .option("--theme <theme>", "Identity theme")
    .option("--emoji <emoji>", "Identity emoji")
    .option("--avatar <value>", "Identity avatar (workspace path, http(s) URL, or data URI)")
    .option("--json", "Output JSON summary", false)
    .addHelpText(
      "after",
      () =>
        `
${theme.heading("Examples:")}
${formatHelpExamples([
  ['anima agents set-identity --agent main --name "ANIMA" --emoji "✦"', "Set name + emoji."],
  ["anima agents set-identity --agent main --avatar avatars/anima.png", "Set avatar path."],
  [
    "anima agents set-identity --workspace ~/.anima/workspace --from-identity",
    "Load from IDENTITY.md.",
  ],
  [
    "anima agents set-identity --identity-file ~/.anima/workspace/IDENTITY.md --agent main",
    "Use a specific IDENTITY.md.",
  ],
])}
`,
    )
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await agentsSetIdentityCommand(
          {
            agent: opts.agent as string | undefined,
            workspace: opts.workspace as string | undefined,
            identityFile: opts.identityFile as string | undefined,
            fromIdentity: Boolean(opts.fromIdentity),
            name: opts.name as string | undefined,
            theme: opts.theme as string | undefined,
            emoji: opts.emoji as string | undefined,
            avatar: opts.avatar as string | undefined,
            json: Boolean(opts.json),
          },
          defaultRuntime,
        );
      });
    });

  agents
    .command("ready")
    .description("Deploy a readiness swarm of specialized subagents")
    .option("--agent <id>", "Agent id to run the readiness orchestrator")
    .option("-t, --to <number>", "Recipient number in E.164 used to derive the session key")
    .option("--session-id <id>", "Use an explicit session id")
    .option(
      "--tracks <list>",
      "Comma-separated tracks: architecture,security,reliability,ux,testing,release",
    )
    .option("--objective <text>", "Override the default readiness objective")
    .option("--thinking <level>", "Thinking level: off | minimal | low | medium | high")
    .option(
      "--channel <channel>",
      `Delivery channel: ${args.agentChannelOptions} (default: ${DEFAULT_CHAT_CHANNEL})`,
    )
    .option("--reply-to <target>", "Delivery target override (separate from session routing)")
    .option("--reply-channel <channel>", "Delivery channel override (separate from routing)")
    .option("--reply-account <id>", "Delivery account id override")
    .option("--deliver", "Send the orchestrator reply back to the selected channel", false)
    .option("--local", "Run embedded locally instead of the Gateway", false)
    .option("--timeout <seconds>", "Override agent timeout (seconds)")
    .option("--dry-run", "Print the readiness orchestration prompt without running", false)
    .option("--json", "Output JSON instead of text where supported", false)
    .addHelpText(
      "after",
      () =>
        `
${theme.heading("Examples:")}
${formatHelpExamples([
  ["anima agents ready", "Launch full readiness swarm on main agent."],
  [
    'anima agents ready --tracks security,testing,reliability --objective "Stabilize gateway + daemon handoff"',
    "Focus on selected tracks.",
  ],
  [
    'anima agents ready --agent ops --deliver --reply-channel slack --reply-to "#release-war-room"',
    "Run on a specific agent and deliver summary.",
  ],
  ["anima agents ready --dry-run", "Preview orchestration prompt only."],
])}
`,
    )
    .action(async (opts) => {
      const deps = createDefaultDeps();
      await runCommandWithRuntime(defaultRuntime, async () => {
        await agentsReadinessCommand(
          {
            agent: opts.agent as string | undefined,
            to: opts.to as string | undefined,
            sessionId: opts.sessionId as string | undefined,
            tracks: opts.tracks as string | undefined,
            objective: opts.objective as string | undefined,
            thinking: opts.thinking as string | undefined,
            channel: opts.channel as string | undefined,
            replyTo: opts.replyTo as string | undefined,
            replyChannel: opts.replyChannel as string | undefined,
            replyAccount: opts.replyAccount as string | undefined,
            deliver: Boolean(opts.deliver),
            local: Boolean(opts.local),
            timeout: opts.timeout as string | undefined,
            dryRun: Boolean(opts.dryRun),
            json: Boolean(opts.json),
          },
          defaultRuntime,
          deps,
        );
      });
    });

  agents
    .command("delete <id>")
    .description("Destroy an agent and clean up its workspace and state")
    .option("--force", "Skip confirmation", false)
    .option("--json", "Output JSON summary", false)
    .action(async (id, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await agentsDeleteCommand(
          {
            id: String(id),
            force: Boolean(opts.force),
            json: Boolean(opts.json),
          },
          defaultRuntime,
        );
      });
    });

  agents.action(async () => {
    await runCommandWithRuntime(defaultRuntime, async () => {
      await agentsListCommand({}, defaultRuntime);
    });
  });
}
