// Stub: channel removed during ANIMA v2 rebranding
export type ResolvedTelegramAccount = {
  accountId: string;
  name?: string;
  config: Record<string, any>;
};
export function resolveTelegramAccount(_p: any): ResolvedTelegramAccount {
  return { accountId: "default", config: {} };
}
export function listTelegramAccountIds(_cfg: any): string[] {
  return [];
}
export function resolveDefaultTelegramAccountId(_cfg: any): string {
  return "default";
}
export function listEnabledTelegramAccounts(_cfg: any): any[] {
  return [];
}
