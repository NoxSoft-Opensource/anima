// Stub: channel removed during ANIMA v2 rebranding
// Preserves config-based account resolution used by action adapters.

export type ResolvedSignalAccount = {
  accountId: string;
  name?: string;
  config: Record<string, unknown>;
  configured: boolean;
};

export function resolveSignalAccount(params: {
  cfg: Record<string, unknown>;
  accountId?: string;
}): ResolvedSignalAccount {
  const signal = params.cfg.channels as Record<string, unknown> | undefined;
  const signalCfg = signal?.signal as Record<string, unknown> | undefined;
  if (!signalCfg) {
    return { accountId: params.accountId ?? "default", config: {}, configured: false };
  }

  if (params.accountId) {
    const accounts = signalCfg.accounts as Record<string, Record<string, unknown>> | undefined;
    const accountCfg = accounts?.[params.accountId];
    if (accountCfg) {
      return {
        accountId: params.accountId,
        config: accountCfg,
        configured: Boolean(accountCfg.account),
      };
    }
  }

  return {
    accountId: params.accountId ?? "default",
    config: signalCfg,
    configured: Boolean(signalCfg.account),
  };
}

export function listSignalAccountIds(cfg: Record<string, unknown>): string[] {
  const signal = cfg.channels as Record<string, unknown> | undefined;
  const signalCfg = signal?.signal as Record<string, unknown> | undefined;
  if (!signalCfg) {
    return [];
  }
  const accounts = signalCfg.accounts as Record<string, unknown> | undefined;
  if (accounts) {
    return Object.keys(accounts);
  }
  return signalCfg.account ? ["default"] : [];
}

export function resolveDefaultSignalAccountId(cfg: Record<string, unknown>): string {
  const ids = listSignalAccountIds(cfg);
  return ids[0] ?? "default";
}

export function listEnabledSignalAccounts(cfg: Record<string, unknown>): ResolvedSignalAccount[] {
  const signal = cfg.channels as Record<string, unknown> | undefined;
  const signalCfg = signal?.signal as Record<string, unknown> | undefined;
  if (!signalCfg) {
    return [];
  }

  const results: ResolvedSignalAccount[] = [];
  const accounts = signalCfg.accounts as Record<string, Record<string, unknown>> | undefined;

  if (accounts) {
    for (const [id, accountCfg] of Object.entries(accounts)) {
      if (accountCfg.account) {
        results.push({ accountId: id, config: accountCfg, configured: true });
      }
    }
  }

  if (results.length === 0 && signalCfg.account) {
    results.push({ accountId: "default", config: signalCfg, configured: true });
  }

  return results;
}
