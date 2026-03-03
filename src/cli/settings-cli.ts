import type { Command } from "commander";
import {
  CONFIGURE_WIZARD_SECTIONS,
  configureCommandWithSections,
  parseConfigureWizardSections,
} from "../commands/configure.js";
import { CONFIG_PATH, readConfigFileSnapshot } from "../config/config.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import { runConfigGet, runConfigSet, runConfigUnset } from "./config-cli.js";

const GATEWAY_SETTINGS_SECTIONS = ["gateway", "daemon", "health"] as const;
const CLI_SETTINGS_SECTIONS = ["workspace", "identity", "memory", "heartbeat"] as const;

type ConfigureSection = (typeof CONFIGURE_WIZARD_SECTIONS)[number];

type SettingsView = "raw" | "resolved" | "runtime";

function dedupeSections(sections: ConfigureSection[]): ConfigureSection[] {
  const seen = new Set<ConfigureSection>();
  const ordered: ConfigureSection[] = [];
  for (const section of sections) {
    if (seen.has(section)) {
      continue;
    }
    seen.add(section);
    ordered.push(section);
  }
  return ordered;
}

async function runSettingsWizard(params: {
  sections?: ConfigureSection[];
  includeGateway?: boolean;
  includeCli?: boolean;
}) {
  const selected: ConfigureSection[] = [];
  if (params.sections && params.sections.length > 0) {
    selected.push(...params.sections);
  }
  if (params.includeGateway) {
    selected.push(...GATEWAY_SETTINGS_SECTIONS);
  }
  if (params.includeCli) {
    selected.push(...CLI_SETTINGS_SECTIONS);
  }

  const sections = selected.length > 0 ? dedupeSections(selected) : [...CONFIGURE_WIZARD_SECTIONS];
  await configureCommandWithSections(sections as never, defaultRuntime);
}

async function runSettingsShow(opts: {
  view: SettingsView;
  json?: boolean;
  includeStatus?: boolean;
}) {
  const snapshot = await readConfigFileSnapshot();
  if (opts.includeStatus) {
    defaultRuntime.log(`Config path: ${CONFIG_PATH}`);
    defaultRuntime.log(`Config valid: ${snapshot.valid ? "yes" : "no"}`);
    defaultRuntime.log(`Snapshot hash: ${snapshot.hash ?? "<none>"}`);
    if (snapshot.issues.length > 0) {
      defaultRuntime.log("Issues:");
      for (const issue of snapshot.issues) {
        defaultRuntime.log(`- ${issue.path || "<root>"}: ${issue.message}`);
      }
    }
    defaultRuntime.log("");
  }

  if (opts.view === "raw") {
    defaultRuntime.log(snapshot.raw || "{}\n");
    return;
  }

  const payload = opts.view === "resolved" ? snapshot.resolved : snapshot.config;
  if (opts.json === false && typeof payload === "string") {
    defaultRuntime.log(payload);
    return;
  }
  defaultRuntime.log(JSON.stringify(payload ?? {}, null, 2));
}

export function registerSettingsCli(program: Command) {
  const cmd = program
    .command("settings")
    .description("Advanced and complete settings for Gateway and CLI")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/config", "docs.noxsoft.net/anima/cli/config")}\n`,
    )
    .option(
      "--section <section>",
      `Configure section (repeatable). Options: ${CONFIGURE_WIZARD_SECTIONS.join(", ")}`,
      (value: string, previous: string[]) => [...previous, value],
      [] as string[],
    )
    .option("--gateway", "Run Gateway-focused advanced settings sections", false)
    .option("--cli", "Run CLI/identity-focused advanced settings sections", false)
    .action(async (opts) => {
      const { sections, invalid } = parseConfigureWizardSections(opts.section);
      if (invalid.length > 0) {
        defaultRuntime.error(
          `Invalid --section: ${invalid.join(", ")}. Expected one of: ${CONFIGURE_WIZARD_SECTIONS.join(", ")}.`,
        );
        defaultRuntime.exit(1);
        return;
      }

      await runSettingsWizard({
        sections: sections,
        includeGateway: Boolean(opts.gateway),
        includeCli: Boolean(opts.cli),
      });
    });

  cmd
    .command("wizard")
    .description("Run advanced settings wizard sections")
    .option(
      "--section <section>",
      `Configure section (repeatable). Options: ${CONFIGURE_WIZARD_SECTIONS.join(", ")}`,
      (value: string, previous: string[]) => [...previous, value],
      [] as string[],
    )
    .option("--gateway", "Run Gateway-focused advanced settings sections", false)
    .option("--cli", "Run CLI/identity-focused advanced settings sections", false)
    .action(async (opts) => {
      const { sections, invalid } = parseConfigureWizardSections(opts.section);
      if (invalid.length > 0) {
        defaultRuntime.error(
          `Invalid --section: ${invalid.join(", ")}. Expected one of: ${CONFIGURE_WIZARD_SECTIONS.join(", ")}.`,
        );
        defaultRuntime.exit(1);
        return;
      }

      await runSettingsWizard({
        sections: sections,
        includeGateway: Boolean(opts.gateway),
        includeCli: Boolean(opts.cli),
      });
    });

  cmd
    .command("gateway")
    .description("Run complete Gateway settings flow (gateway + daemon + health)")
    .action(async () => {
      await runSettingsWizard({
        sections: [...GATEWAY_SETTINGS_SECTIONS],
      });
    });

  cmd
    .command("cli")
    .description("Run complete CLI settings flow (workspace + identity + memory + heartbeat)")
    .action(async () => {
      await runSettingsWizard({
        sections: [...CLI_SETTINGS_SECTIONS],
      });
    });

  cmd
    .command("show")
    .description("Print complete settings snapshot")
    .option("--view <view>", "View: raw|resolved|runtime", "runtime")
    .option("--status", "Include config validity/hash summary", false)
    .action(async (opts: { view?: string; status?: boolean }) => {
      const rawView = (opts.view ?? "runtime").trim().toLowerCase();
      if (rawView !== "raw" && rawView !== "resolved" && rawView !== "runtime") {
        defaultRuntime.error("Invalid --view. Expected one of: raw, resolved, runtime.");
        defaultRuntime.exit(1);
        return;
      }
      await runSettingsShow({ view: rawView as SettingsView, includeStatus: Boolean(opts.status) });
    });

  cmd
    .command("path")
    .description("Print the active settings file path")
    .action(async () => {
      defaultRuntime.log(CONFIG_PATH);
    });

  cmd
    .command("get")
    .description("Read a settings value by path")
    .argument("<path>", "Settings path (dot or bracket notation)")
    .option("--json", "Output JSON", false)
    .action(async (path: string, opts: { json?: boolean }) => {
      await runConfigGet({ path, json: Boolean(opts.json), runtime: defaultRuntime });
    });

  cmd
    .command("set")
    .description("Write a settings value by path")
    .argument("<path>", "Settings path (dot or bracket notation)")
    .argument("<value>", "Value (JSON5 or raw string)")
    .option("--json", "Parse value as JSON5 (required)", false)
    .action(async (path: string, value: string, opts: { json?: boolean }) => {
      await runConfigSet({ path, value, json: Boolean(opts.json), runtime: defaultRuntime });
    });

  cmd
    .command("unset")
    .description("Remove a settings value by path")
    .argument("<path>", "Settings path (dot or bracket notation)")
    .action(async (path: string) => {
      await runConfigUnset({ path, runtime: defaultRuntime });
    });
}
