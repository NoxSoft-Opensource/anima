// Stub: channel removed during ANIMA v2 rebranding
export type ResolvedSignalAccount = {
  accountId: string;
  name?: string;
  config: Record<string, any>;
};
export function resolveSignalAccount(_p: any): ResolvedSignalAccount {
  return { accountId: "default", config: {} };
}
export function listSignalAccountIds(_cfg: any): string[] {
  return [];
}
export function resolveDefaultSignalAccountId(_cfg: any): string {
  return "default";
}
export function listEnabledSignalAccounts(_cfg: any): any[] {
  return [];
}
