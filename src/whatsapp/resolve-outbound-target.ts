// Stub: channel removed during ANIMA v2 rebranding
// Preserves the resolveTarget contract used by the outbound adapter.

type ResolveResult = { ok: true; to: string } | { ok: false; error: Error };

export function resolveWhatsAppOutboundTarget(params: {
  to?: string;
  allowFrom?: string[];
  mode?: string;
}): ResolveResult {
  const { to, allowFrom, mode } = params;
  if (!to) {
    return { ok: false, error: new Error("No WhatsApp target specified.") };
  }
  // Group JIDs always pass through
  if (to.endsWith("@g.us")) {
    return { ok: true, to };
  }
  // In implicit mode, validate against allowFrom
  if (mode === "implicit" && allowFrom && allowFrom.length > 0) {
    if (!allowFrom.includes(to)) {
      return { ok: false, error: new Error(`Target ${to} not in allowFrom.`) };
    }
  }
  return { ok: true, to };
}
