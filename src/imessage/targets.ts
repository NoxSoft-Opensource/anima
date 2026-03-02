// Stub: channel removed during ANIMA v2 rebranding
// Preserves basic phone/chat normalization used by other modules.

const CHAT_TARGET_PREFIX_RE =
  /^(chat_id:|chatid:|chat:|chat_guid:|chatguid:|guid:|chat_identifier:|chatidentifier:|chatident:)/i;

export function normalizeIMessageHandle(handle: string): string {
  const trimmed = handle.trim();
  if (!trimmed) {
    return trimmed;
  }
  // Preserve chat target prefixes (lowercase them)
  const chatMatch = CHAT_TARGET_PREFIX_RE.exec(trimmed);
  if (chatMatch) {
    const prefix = chatMatch[1].toLowerCase();
    const rest = trimmed.slice(chatMatch[1].length).trim();
    // Normalize variant prefixes to canonical underscore forms
    const canonicalPrefix = prefix
      .replace(/^chatid:$/, "chat_id:")
      .replace(/^chatguid:$/, "chat_guid:")
      .replace(/^chatidentifier:$/, "chat_identifier:")
      .replace(/^chatident:$/, "chat_identifier:");
    return `${canonicalPrefix}${rest}`;
  }
  // Strip formatting from phone numbers
  if (/[+\d]/.test(trimmed)) {
    return trimmed.replace(/[\s()\-–—.]/g, "");
  }
  return trimmed;
}

export function parseIMessageTarget(target: string): { type: string; id: string } {
  return { type: "unknown", id: target };
}
