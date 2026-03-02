// Stub: channel removed during ANIMA v2 rebranding
// Preserves reaction level resolution used by action adapters.

export function resolveSignalReactionLevel(params: {
  cfg: Record<string, unknown>;
  accountId?: string;
}): { level: string | undefined; agentReactionsEnabled: boolean } {
  const signal = params.cfg.channels as Record<string, unknown> | undefined;
  const signalCfg = signal?.signal as Record<string, unknown> | undefined;
  if (!signalCfg) {
    return { level: undefined, agentReactionsEnabled: false };
  }

  let level: string | undefined;

  // Check account-level config first
  if (params.accountId) {
    const accounts = signalCfg.accounts as Record<string, Record<string, unknown>> | undefined;
    const accountCfg = accounts?.[params.accountId];
    if (accountCfg?.reactionLevel !== undefined) {
      level = String(accountCfg.reactionLevel);
    }
  }

  // Fall back to top-level
  if (level === undefined && signalCfg.reactionLevel !== undefined) {
    level = String(signalCfg.reactionLevel);
  }

  const agentReactionsEnabled = level === "minimal" || level === "extensive";
  return { level, agentReactionsEnabled };
}
