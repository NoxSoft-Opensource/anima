import type { AnimaConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { formatCliCommand } from "../cli/command-format.js";
import { buildWorkspaceHookStatus } from "../hooks/hooks-status.js";

export async function setupInternalHooks(
  cfg: AnimaConfig,
  runtime: RuntimeEnv,
  prompter: WizardPrompter,
): Promise<AnimaConfig> {
  await prompter.note(
    [
      "ANIMA hooks automate actions in response to agent commands.",
      "Example: persist session context to memory on /new.",
      "",
      "Documentation: https://docs.noxsoft.net/anima/automation/hooks",
    ].join("\n"),
    "Hooks",
  );

  // Discover available hooks using the hook discovery system
  const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
  const report = buildWorkspaceHookStatus(workspaceDir, { config: cfg });

  // Show every eligible hook so users can opt in during onboarding.
  const eligibleHooks = report.hooks.filter((h) => h.eligible);

  if (eligibleHooks.length === 0) {
    await prompter.note(
      "No eligible hooks detected. You can configure hooks later via your ANIMA config.",
      "No hooks available",
    );
    return cfg;
  }

  const toEnable = await prompter.multiselect({
    message: "Select hooks to enable",
    options: [
      { value: "__skip__", label: "Skip — configure later" },
      ...eligibleHooks.map((hook) => ({
        value: hook.name,
        label: `${hook.emoji ?? "🔗"} ${hook.name}`,
        hint: hook.description,
      })),
    ],
  });

  const selected = toEnable.filter((name) => name !== "__skip__");
  if (selected.length === 0) {
    return cfg;
  }

  // Enable selected hooks using the new entries config format
  const entries = { ...cfg.hooks?.internal?.entries };
  for (const name of selected) {
    entries[name] = { enabled: true };
  }

  const next: AnimaConfig = {
    ...cfg,
    hooks: {
      ...cfg.hooks,
      internal: {
        enabled: true,
        entries,
      },
    },
  };

  await prompter.note(
    [
      `Enabled ${selected.length} hook${selected.length > 1 ? "s" : ""}: ${selected.join(", ")}`,
      "",
      "Manage hooks anytime:",
      `  ${formatCliCommand("anima hooks list")}`,
      `  ${formatCliCommand("anima hooks enable <name>")}`,
      `  ${formatCliCommand("anima hooks disable <name>")}`,
    ].join("\n"),
    "Hooks configured",
  );

  return next;
}
