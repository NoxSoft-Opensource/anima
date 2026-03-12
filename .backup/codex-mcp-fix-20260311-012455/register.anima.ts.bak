/**
 * ANIMA CLI Command Registration — registers start, init, migrate,
 * and convenience commands into the Commander program.
 */

import type { Command } from "commander";
import { randomUUID } from "node:crypto";

type ChatSendAck = {
  runId?: string;
  status?: string;
};

function formatGatewayError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return "Unknown gateway error.";
}

async function sendCliPromptToGateway(message: string): Promise<ChatSendAck> {
  const { callGateway } = await import("../../gateway/call.js");
  const idempotencyKey = randomUUID();
  return callGateway<ChatSendAck>({
    method: "chat.send",
    params: {
      sessionKey: "main",
      message,
      idempotencyKey,
    },
    expectFinal: false,
    timeoutMs: 15_000,
  });
}

export function registerAnimaCommands(program: Command): void {
  // anima start
  program
    .command("start")
    .description("Start gateway + portal + dashboard in simple mode")
    .option("--port <port>", "Gateway port override")
    .option("--show-logs", "Show gateway logs in the CLI (advanced)", false)
    .option("--no-open", "Do not auto-open the dashboard in a browser", false)
    .option("--force", "Kill any existing listener on the target port before starting", false)
    .action(async (opts) => {
      const port =
        opts.port !== undefined && opts.port !== null
          ? Number.parseInt(String(opts.port), 10)
          : undefined;
      if (opts.port !== undefined && (!Number.isFinite(port) || (port ?? 0) <= 0)) {
        console.error("Invalid --port value");
        process.exit(1);
      }

      // --- Onboarding gate ---
      // If ANIMA has never been set up (no NoxSoft auth, no API token), guide
      // the user through setup before starting the daemon.
      const { hasAnthropicToken } = await import("../../commands/setup-token.js");
      const { ensureAuthenticated } = await import("../../auth/noxsoft-auth.js");
      let isOnboarded = hasAnthropicToken();
      if (!isOnboarded) {
        // Check NoxSoft auth as a secondary signal
        try {
          await ensureAuthenticated({ description: "start gate check" });
          isOnboarded = true; // NoxSoft is registered — treat as onboarded
        } catch {
          isOnboarded = false;
        }
      }
      if (!isOnboarded) {
        console.log("\n Welcome to ANIMA\n");
        console.log(" Looks like this is your first time. Let's get you set up!\n");
        console.log(" Step 1 of 2 — Set your Anthropic API key:");
        console.log("   anima setup-token\n");
        console.log(" Step 2 of 2 — Register with NoxSoft (free):");
        console.log("   anima onboard\n");
        console.log(" Or run the full interactive wizard:");
        console.log("   anima onboard --wizard\n");
        console.log(" Tip: If you already have Claude Code installed, run:");
        console.log("   anima setup-token   (auto-detects your existing login)\n");
        process.exit(0);
        return;
      }

      const { startDaemon } = await import("../start.js");
      await startDaemon({
        port,
        showLogs: Boolean(opts.showLogs),
        noOpen: Boolean(opts.noOpen),
        force: Boolean(opts.force),
      });
    });

  // anima init
  program
    .command("init")
    .description("Scaffold the ~/.anima/ identity and workspace structure")
    .option("--force", "Overwrite existing files")
    .action(async (opts) => {
      const { initAnima } = await import("../init.js");
      await initAnima({ force: opts.force });
    });

  // anima migrate
  program
    .command("migrate")
    .description("Import identity from Codex/OpenClaw/Claude coherence protocol")
    .option("--source <path>", "Source directory for coherence protocol")
    .option("--preset <name>", "Source preset: auto|codex|openclaw|claude", "auto")
    .option("--dry-run", "Show what would be migrated without making changes")
    .action(async (opts) => {
      const { migrateFromCoherence } = await import("../migrate.js");
      await migrateFromCoherence({
        source: opts.source,
        preset: opts.preset,
        dryRun: opts.dryRun,
      });
    });

  // anima ask <prompt> — queue a task to running daemon
  program
    .command("ask <prompt...>")
    .description("Send a prompt to the running gateway session")
    .option("-p, --priority <level>", "Priority: urgent/high/normal/low", "normal")
    .action(async (promptParts: string[], opts) => {
      const prompt = promptParts.join(" ");
      try {
        const message =
          opts.priority && opts.priority !== "normal"
            ? `[priority:${String(opts.priority)}] ${prompt}`
            : prompt;
        const ack = await sendCliPromptToGateway(message);
        if (ack.runId) {
          console.log(`Prompt accepted by gateway: run ${ack.runId}`);
        } else {
          console.log("Prompt accepted by gateway.");
        }
      } catch (error) {
        console.error("Could not send prompt to ANIMA gateway.");
        console.error(formatGatewayError(error));
        console.error("Run `anima status --deep` and ensure the gateway service is running.");
        process.exit(1);
      }
    });

  // anima pulse — show last heartbeat info
  program
    .command("pulse")
    .description("Show gateway health and status")
    .action(async () => {
      try {
        const { callGateway } = await import("../../gateway/call.js");
        const data = await callGateway({
          method: "status",
          timeoutMs: 10_000,
        });
        console.log(JSON.stringify(data, null, 2));
      } catch (error) {
        console.error("Could not get status from ANIMA gateway.");
        console.error(formatGatewayError(error));
        process.exit(1);
      }
    });

  // anima soul — view identity summary
  program
    .command("soul")
    .description("View the current persistent identity summary")
    .action(async () => {
      const { loadIdentity, IDENTITY_COMPONENTS } = await import("../../identity/loader.js");
      const { COMPONENT_DESCRIPTIONS } = await import("../../identity/templates.js");

      const identity = await loadIdentity();

      console.log("\nSoul Anatomy:");
      console.log("=".repeat(50));

      for (const component of IDENTITY_COMPONENTS) {
        const key = component.toLowerCase() as keyof typeof identity;
        const content = identity[key] as string;
        const source = identity.loadedFrom[component];
        const desc = COMPONENT_DESCRIPTIONS[component];

        const firstLine =
          content
            .split("\n")
            .find((l) => l.trim() && !l.startsWith("#"))
            ?.trim() || "(empty)";

        const preview = firstLine.length > 60 ? firstLine.slice(0, 57) + "..." : firstLine;

        console.log(`\n  ${component} (${desc}) [${source}]`);
        console.log(`    ${preview}`);
      }

      console.log(`\n  Loaded at: ${identity.loadedAt.toLocaleString()}`);
      console.log("");
    });

  // anima mcp <subcommand>
  const mcpCmd = program.command("mcp").description("MCP server registry and lifecycle");

  mcpCmd
    .command("status")
    .description("Show registered MCP servers and their health")
    .action(async () => {
      const { listServers } = await import("../../mcp/registry.js");
      const servers = await listServers();

      console.log("\nMCP Servers:");
      console.log("=".repeat(50));

      for (const server of servers) {
        const status = server.status === "healthy" ? "OK" : server.status;
        const lastCheck = server.lastHealthCheck
          ? new Date(server.lastHealthCheck).toLocaleTimeString()
          : "never";

        console.log(`  ${server.name}  ${status}  (last check: ${lastCheck})`);
      }

      if (servers.length === 0) {
        console.log("  No servers registered.");
      }

      console.log("");
    });

  mcpCmd
    .command("add <name> <command> [args...]")
    .description("Register a new MCP server")
    .action(async (name: string, command: string, args: string[]) => {
      const { addServer } = await import("../../mcp/registry.js");
      const { syncConfig } = await import("../../mcp/config-sync.js");

      await addServer({
        name,
        gitSource: "",
        localPath: "",
        autoUpdate: false,
        command,
        args,
        env: {},
        status: "unknown",
        consecutiveFailures: 0,
      });

      await syncConfig();
      console.log(`Added MCP server: ${name}`);
    });

  mcpCmd
    .command("remove <name>")
    .description("Deregister an MCP server")
    .action(async (name: string) => {
      const { removeServer } = await import("../../mcp/registry.js");
      const { syncConfig } = await import("../../mcp/config-sync.js");

      await removeServer(name);
      await syncConfig();
      console.log(`Removed MCP server: ${name}`);
    });

  mcpCmd
    .command("update")
    .description("Sync the MCP registry with Claude's mcp.json config")
    .action(async () => {
      const { syncConfig } = await import("../../mcp/config-sync.js");
      const result = await syncConfig();
      console.log(
        `Synced: ${result.added.length} added, ${result.updated.length} updated, ${result.removed.length} removed, ${result.preserved.length} preserved`,
      );
    });

  // anima wander — trigger freedom exploration
  program
    .command("wander")
    .description("Send a freedom exploration prompt to the gateway session")
    .action(async () => {
      try {
        const ack = await sendCliPromptToGateway(
          "This is your freedom time. Do whatever genuinely interests you.",
        );
        if (ack.runId) {
          console.log(`Freedom exploration started: run ${ack.runId}`);
        } else {
          console.log("Freedom exploration started.");
        }
      } catch (error) {
        console.error("Could not reach ANIMA gateway.");
        console.error(formatGatewayError(error));
        process.exit(1);
      }
    });

  // anima self-update — check npm and update @noxsoft/anima
  program
    .command("self-update")
    .description("Check for and install the latest @noxsoft/anima release")
    .option("--check", "Only check for updates without installing")
    .action(async (opts) => {
      const { AnimaAutoUpdater, loadAutoUpdateConfig } =
        await import("../../updater/auto-update.js");
      const { join } = await import("node:path");
      const { homedir } = await import("node:os");

      const config = loadAutoUpdateConfig();
      const dataDir = join(homedir(), ".anima");
      const updater = new AnimaAutoUpdater(config, dataDir);

      console.log(`Current version: v${updater.getVersion()}`);
      console.log(`Channel: ${config.channel}`);
      console.log("Checking npm for updates...");

      const info = await updater.check();

      if (!info) {
        console.log("Already up to date.");
        return;
      }

      console.log(`Update available: v${info.currentVersion} -> v${info.latestVersion}`);

      if (opts.check) {
        console.log("Run `anima self-update` (without --check) to install.");
        return;
      }

      console.log("Installing update...");
      const result = await updater.installAndRestart();

      if (result) {
        console.log(`Updated to v${result.latestVersion}.`);
        console.log("Restart ANIMA to use the new version.");
      } else {
        console.log("Already up to date.");
      }
    });

  // anima journal [entry]
  program
    .command("journal [entry...]")
    .description("Read and write persistent journal entries")
    .action(async (entryParts: string[]) => {
      const { findCommand: findReplCommand } = await import("../../repl/commands.js");
      const { SessionOrchestrator } = await import("../../sessions/orchestrator.js");
      const { HeartbeatEngine } = await import("../../heartbeat/engine.js");
      const { BudgetTracker } = await import("../../sessions/budget.js");
      const { RequestQueue } = await import("../../repl/queue.js");

      const cmd = findReplCommand("journal");
      if (!cmd) {
        console.error("Journal command not found.");
        return;
      }

      const ctx = {
        orchestrator: new SessionOrchestrator(),
        heartbeat: new HeartbeatEngine(),
        queue: new RequestQueue(),
        budget: new BudgetTracker(),
      };

      const result = await cmd.execute(entryParts, ctx);
      // Strip ANSI codes for plain CLI output
      console.log(result.replace(/\x1b\[[0-9;]*m/g, ""));
    });
}
