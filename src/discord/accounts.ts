// Stub: channel removed during ANIMA v2 rebranding
export type ResolvedDiscordAccount = {
  accountId: string;
  name?: string;
  config: Record<string, any>;
};
export function resolveDiscordAccount(_p: any): ResolvedDiscordAccount {
  return { accountId: "default", config: {} };
}
export function listDiscordAccountIds(_cfg: any): string[] {
  return [];
}
export function resolveDefaultDiscordAccountId(_cfg: any): string {
  return "default";
}
export function listEnabledDiscordAccounts(_cfg: any): any[] {
  return [];
}
