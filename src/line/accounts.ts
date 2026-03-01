// Stub: channel removed during ANIMA v2 rebranding
export type ResolvedLineAccount = { accountId: string; name?: string; config: Record<string, any> };
export function resolveLineAccount(_p: any): ResolvedLineAccount {
  return { accountId: "default", config: {} };
}
export function listLineAccountIds(_cfg: any): string[] {
  return [];
}
export function resolveDefaultLineAccountId(_cfg: any): string {
  return "default";
}
export { normalizeAccountId } from "../routing/session-key.js";
