/**
 * STUBBED — the original pi-embedded provider removed.
 * ANIMA uses Claude Code CLI as its sole interface to Claude.
 * These stubs prevent import breakage; full replacement comes in Phase 2.
 */

export function stripMinimaxToolCallXml(text: string): string {
  return text;
}

export function stripDowngradedToolCallText(text: string): string {
  return text;
}

export function stripThinkingTagsFromText(text: string): string {
  return text;
}

export function isAssistantMessage(msg: unknown): boolean {
  return (
    typeof msg === "object" && msg !== null && (msg as Record<string, unknown>).role === "assistant"
  );
}

export function extractAssistantText(msg: Record<string, unknown>): string {
  const content = msg.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter(
        (block: unknown): block is { type: "text"; text: string } =>
          typeof block === "object" &&
          block !== null &&
          (block as Record<string, unknown>).type === "text",
      )
      .map((block) => block.text)
      .join("");
  }
  return "";
}

export function extractAssistantThinking(): string {
  return "";
}

export function formatReasoningMessage(text: string): string {
  return text;
}

export function splitThinkingTaggedText(): null {
  return null;
}

export function promoteThinkingTagsToBlocks(): void {}

export function extractThinkingFromTaggedText(): string {
  return "";
}

export function extractThinkingFromTaggedStream(): string {
  return "";
}

export function inferToolMetaFromArgs(): string | undefined {
  return undefined;
}
