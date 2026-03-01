// Stub: channel removed during ANIMA v2 rebranding
export type ResolvedSlackAccount = {
  accountId: string;
  name?: string;
  config: Record<string, any>;
  dm?: Record<string, any>;
};
export function resolveSlackAccount(_p: any): ResolvedSlackAccount {
  return { accountId: "default", config: {} };
}
export function resolveSlackReplyToMode(..._args: any[]): string {
  return "off";
}
export function listSlackAccountIds(_cfg: any): string[] {
  return [];
}
export function resolveDefaultSlackAccountId(_cfg: any): string {
  return "default";
}
export function listEnabledSlackAccounts(_cfg: any): any[] {
  return [];
}
