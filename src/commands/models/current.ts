import type { RuntimeEnv } from "../../runtime.js";
import { loadConfig } from "../../config/config.js";
import { resolveAgentIdFromSessionKey } from "../../config/sessions.js";
import { resolveAgentModelSelection } from "../agent/model-resolution.js";
import { resolveSession } from "../agent/session.js";
import { ensureFlagCompatibility, resolveKnownAgentId } from "./shared.js";

export async function modelsCurrentCommand(
  opts: {
    agent?: string;
    to?: string;
    sessionId?: string;
    sessionKey?: string;
    json?: boolean;
    plain?: boolean;
  },
  runtime: RuntimeEnv,
) {
  ensureFlagCompatibility(opts);
  const cfg = loadConfig();
  const agentId =
    resolveKnownAgentId({ cfg, rawAgentId: opts.agent }) ??
    resolveAgentIdFromSessionKey(opts.sessionKey?.trim());
  const session = resolveSession({
    cfg,
    to: opts.to,
    sessionId: opts.sessionId,
    sessionKey: opts.sessionKey,
    agentId,
  });
  const resolved = await resolveAgentModelSelection({
    cfg,
    agentId,
    sessionEntry: session.sessionEntry,
  });
  const current = `${resolved.provider}/${resolved.model}`;
  const lastUsed =
    session.sessionEntry?.modelProvider && session.sessionEntry?.model
      ? `${session.sessionEntry.modelProvider}/${session.sessionEntry.model}`
      : undefined;

  if (opts.json) {
    runtime.log(
      JSON.stringify(
        {
          agentId: agentId ?? resolveAgentIdFromSessionKey(session.sessionKey),
          sessionId: session.sessionId,
          sessionKey: session.sessionKey,
          current,
          provider: resolved.provider,
          model: resolved.model,
          source: resolved.source,
          default: `${resolved.defaultProvider}/${resolved.defaultModel}`,
          lastUsed,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (opts.plain) {
    runtime.log(current);
    return;
  }

  runtime.log(`Current model: ${current}`);
  runtime.log(`Source: ${resolved.source}`);
  runtime.log(`Default: ${resolved.defaultProvider}/${resolved.defaultModel}`);
  if (lastUsed) {
    runtime.log(`Last used: ${lastUsed}`);
  }
  if (session.sessionKey) {
    runtime.log(`Session: ${session.sessionKey}`);
  }
}
