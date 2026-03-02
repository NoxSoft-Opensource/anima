import type { ReplyPayload } from "../types.js";

// LINE channel removed — directives are no-ops.
export function parseLineDirectives(payload: ReplyPayload): ReplyPayload {
  return payload;
}

export function hasLineDirectives(_text: string): boolean {
  return false;
}
