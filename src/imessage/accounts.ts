// Stub: channel removed during ANIMA v2 rebranding
export type ResolvedIMessageAccount = {
  accountId: string;
  name?: string;
  config: Record<string, any>;
};
export function resolveIMessageAccount(_p: any): ResolvedIMessageAccount {
  return { accountId: "default", config: {} };
}
export function listIMessageAccountIds(_cfg: any): string[] {
  return [];
}
export function resolveDefaultIMessageAccountId(_cfg: any): string {
  return "default";
}
