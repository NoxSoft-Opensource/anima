// Stub: channel removed during ANIMA v2 rebranding
export type ProcessedLineMessage = { text: string };
export function processLineMessage(text: string, ..._args: any[]): ProcessedLineMessage {
  return { text };
}
export function hasMarkdownToConvert(text: string): boolean {
  return /[*_~`#[\]()]/.test(text);
}
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/```[^`]*```/gs, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "");
}
