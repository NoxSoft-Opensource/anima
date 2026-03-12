export type RunnerCapabilityMode = "cli-native" | "local-tools" | "disabled";

const CAPABILITY_HINTS: Record<RunnerCapabilityMode, string> = {
  "cli-native":
    "Use your native CLI capabilities when needed. Do not assume external MCP-style tools exist unless they are explicitly provided.",
  "local-tools":
    "Use only the tools explicitly provided in this session. Do not assume any other external MCP-style tools exist.",
  disabled: "Tools are disabled in this session. Do not call tools.",
};

export function appendRunnerCapabilityPrompt(
  prompt: string | undefined,
  mode: RunnerCapabilityMode,
): string {
  return [prompt?.trim(), CAPABILITY_HINTS[mode]].filter(Boolean).join("\n");
}
