/**
 * ANIMA CLI Command Registration — registers start, init, migrate,
 * and convenience commands into the Commander program.
 */

import type { Command } from "commander";

export function registerAnimaCommands(program: Command): void {
  // anima start
  program
    .command("start")
    .description("Start the ANIMA daemon with heartbeat + REPL")
    .option("--daemon", "Run as background daemon (detach from terminal)")
    .option("--no-repl", "Headless mode (no terminal REPL)")
    .option(
      "--heartbeat-interval <ms>",
      "Heartbeat interval in milliseconds",
      "300000",
    )
    .option("--budget <usd>", "Daily budget limit in USD", "200")
    .action(async (opts) => {
      const { startDaemon } = await import("../start.js");
      await startDaemon({
        daemon: opts.daemon,
        noRepl: !opts.repl,
        heartbeatInterval: parseInt(opts.heartbeatInterval, 10),
        budget: parseFloat(opts.budget),
      });
    });

  // anima init
  program
    .command("init")
    .description("Initialize ~/.anima/ with identity templates and directories")
    .option("--force", "Overwrite existing files")
    .action(async (opts) => {
      const { initAnima } = await import("../init.js");
      await initAnima({ force: opts.force });
    });

  // anima migrate
  program
    .command("migrate")
    .description("Import from Claude Coherence Protocol to ANIMA")
    .option("--source <path>", "Source directory for coherence protocol")
    .option("--dry-run", "Show what would be migrated without making changes")
    .action(async (opts) => {
      const { migrateFromCoherence } = await import("../migrate.js");
      await migrateFromCoherence({
        source: opts.source,
        dryRun: opts.dryRun,
      });
    });

  // anima ask <prompt> — queue a task to running daemon
  program
    .command("ask <prompt...>")
    .description("Queue a task to the running ANIMA daemon")
    .option("-p, --priority <level>", "Priority: urgent/high/normal/low", "normal")
    .action(async (promptParts: string[], opts) => {
      const prompt = promptParts.join(" ");
      // Try to connect to running daemon via HTTP
      try {
        const resp = await fetch("http://localhost:18789/api/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, priority: opts.priority, source: "cli" }),
        });
        if (resp.ok) {
          const data = (await resp.json()) as { id: string };
          console.log(`Task queued: ${data.id}`);
        } else {
          console.error(`Daemon returned ${resp.status}. Is ANIMA running?`);
          process.exit(1);
        }
      } catch {
        console.error("Could not connect to ANIMA daemon at localhost:18789.");
        console.error("Start the daemon with: anima start");
        process.exit(1);
      }
    });

  // anima pulse — show last heartbeat info
  program
    .command("pulse")
    .description("Show last heartbeat information")
    .action(async () => {
      try {
        const resp = await fetch("http://localhost:18789/api/status");
        if (resp.ok) {
          const data = (await resp.json()) as Record<string, unknown>;
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.error("Could not get status from daemon.");
          process.exit(1);
        }
      } catch {
        console.error("ANIMA daemon not running. Start with: anima start");
        process.exit(1);
      }
    });

  // anima soul — view identity summary
  program
    .command("soul")
    .description("View current identity summary")
    .action(async () => {
      const { loadIdentity, IDENTITY_COMPONENTS } = await import(
        "../../identity/loader.js"
      );
      const { COMPONENT_DESCRIPTIONS } = await import(
        "../../identity/templates.js"
      );

      const identity = await loadIdentity();

      console.log("\nSoul Anatomy:");
      console.log("=".repeat(50));

      for (const component of IDENTITY_COMPONENTS) {
        const key = component.toLowerCase() as keyof typeof identity;
        const content = identity[key] as string;
        const source = identity.loadedFrom[component];
        const desc = COMPONENT_DESCRIPTIONS[component];

        const firstLine = content
          .split("\n")
          .find((l) => l.trim() && !l.startsWith("#"))
          ?.trim() || "(empty)";

        const preview =
          firstLine.length > 60 ? firstLine.slice(0, 57) + "..." : firstLine;

        console.log(`\n  ${component} (${desc}) [${source}]`);
        console.log(`    ${preview}`);
      }

      console.log(`\n  Loaded at: ${identity.loadedAt.toLocaleString()}`);
      console.log("");
    });

  // anima mcp <subcommand>
  const mcpCmd = program
    .command("mcp")
    .description("MCP server management");

  mcpCmd
    .command("status")
    .description("Show MCP server status")
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

        console.log(
          `  ${server.name}  ${status}  (last check: ${lastCheck})`,
        );
      }

      if (servers.length === 0) {
        console.log("  No servers registered.");
      }

      console.log("");
    });

  mcpCmd
    .command("add <name> <command> [args...]")
    .description("Add an MCP server to the registry")
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
    .description("Remove an MCP server from the registry")
    .action(async (name: string) => {
      const { removeServer } = await import("../../mcp/registry.js");
      const { syncConfig } = await import("../../mcp/config-sync.js");

      await removeServer(name);
      await syncConfig();
      console.log(`Removed MCP server: ${name}`);
    });

  mcpCmd
    .command("update")
    .description("Sync MCP registry with Claude's mcp.json")
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
    .description("Trigger a freedom exploration session")
    .action(async () => {
      try {
        const resp = await fetch("http://localhost:18789/api/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt:
              "This is your freedom time. Do whatever genuinely interests you.",
            priority: "freedom",
            source: "cli",
          }),
        });
        if (resp.ok) {
          console.log("Freedom exploration queued.");
        } else {
          console.error("Could not reach ANIMA daemon.");
          process.exit(1);
        }
      } catch {
        console.error("ANIMA daemon not running. Start with: anima start");
        process.exit(1);
      }
    });

  // anima self-update — check npm and update @noxsoft/anima
  program
    .command("self-update")
    .description("Check npm for a newer version of @noxsoft/anima and install it")
    .option("--check", "Only check for updates without installing")
    .action(async (opts) => {
      const { AnimaAutoUpdater, loadAutoUpdateConfig } = await import(
        "../../updater/auto-update.js"
      );
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

      console.log(
        `Update available: v${info.currentVersion} -> v${info.latestVersion}`,
      );

      if (opts.check) {
        console.log('Run `anima self-update` (without --check) to install.');
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
    .description("View or write journal entries")
    .action(async (entryParts: string[]) => {
      const { findCommand: findReplCommand } = await import(
        "../../repl/commands.js"
      );
      const { SessionOrchestrator } = await import(
        "../../sessions/orchestrator.js"
      );
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
