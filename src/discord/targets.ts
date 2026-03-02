// Stub: channel removed during ANIMA v2 rebranding
// Preserves basic target parsing used by action adapters.

export function parseDiscordTarget(target: string): { type: string; id: string } {
  const trimmed = target.trim();
  if (trimmed.startsWith("channel:")) {
    return { type: "channel", id: trimmed.slice("channel:".length) };
  }
  return { type: "unknown", id: trimmed };
}

export function resolveDiscordChannelId(raw: string): string | undefined {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith("channel:")) {
    return trimmed.slice("channel:".length).trim() || undefined;
  }
  // Bare numeric IDs
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
}
