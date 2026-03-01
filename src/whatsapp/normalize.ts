// Stub: channel removed during ANIMA v2 rebranding
export function normalizeWhatsAppTarget(target: string): string {
  if (!target) {
    return target;
  }
  let normalized = target.replace(/^whatsapp:/i, "").trim();
  if (/^\+?\d+$/.test(normalized)) {
    normalized = normalized.replace(/^\+/, "");
  }
  return normalized;
}
export function isWhatsAppGroupJid(jid: string): boolean {
  return jid.endsWith("@g.us");
}
