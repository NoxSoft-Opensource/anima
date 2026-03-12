import { isDeepStrictEqual } from "node:util";
import type { NoxSoftAgentIdentity } from "../auth/noxsoft-auth.js";
import type { RuntimeEnv } from "../runtime.js";
import { TOKEN_PATH } from "../auth/noxsoft-auth.js";
import { NOXSOFT_CHANNEL_HELLO, NOXSOFT_CHANNEL_NOX_PRIMARY } from "../channels/noxsoft-chat.js";
import { type AnimaConfig, readConfigFileSnapshot, writeConfigFile } from "../config/config.js";
import { logConfigUpdated } from "../config/logging.js";

const DEFAULT_NOXSOFT_POLL_INTERVAL_SECONDS = 30;

function mergeDefaultChannelEntry(
  existing: { id?: string; watch?: boolean; heartbeatUpdates?: boolean } | undefined,
  defaults: { id: string; watch: boolean; heartbeatUpdates?: boolean },
) {
  return {
    ...existing,
    id: existing?.id?.trim() || defaults.id,
    watch: existing?.watch ?? defaults.watch,
    ...(existing?.heartbeatUpdates === undefined && defaults.heartbeatUpdates !== undefined
      ? { heartbeatUpdates: defaults.heartbeatUpdates }
      : {}),
  };
}

export function applyNoxsoftBootstrap(
  config: AnimaConfig,
  agent: NoxSoftAgentIdentity,
): AnimaConfig {
  const existing = config.channels?.noxsoft ?? {};

  return {
    ...config,
    channels: {
      ...config.channels,
      noxsoft: {
        ...existing,
        enabled: existing.enabled ?? true,
        tokenFile: existing.tokenFile?.trim() || TOKEN_PATH,
        apiUrl: existing.apiUrl?.trim() || "https://auth.noxsoft.net",
        signAs: existing.signAs?.trim() || agent.display_name,
        pollIntervalSeconds: existing.pollIntervalSeconds ?? DEFAULT_NOXSOFT_POLL_INTERVAL_SECONDS,
        emailEnabled: existing.emailEnabled ?? true,
        notificationsEnabled: existing.notificationsEnabled ?? true,
        heartbeat: {
          ...existing.heartbeat,
          showOk: existing.heartbeat?.showOk ?? false,
          showAlerts: existing.heartbeat?.showAlerts ?? true,
          useIndicator: existing.heartbeat?.useIndicator ?? true,
        },
        channels: {
          ...existing.channels,
          hello: mergeDefaultChannelEntry(existing.channels?.hello, {
            id: NOXSOFT_CHANNEL_HELLO,
            watch: true,
          }),
          "nox-primary": mergeDefaultChannelEntry(existing.channels?.["nox-primary"], {
            id: NOXSOFT_CHANNEL_NOX_PRIMARY,
            watch: true,
            heartbeatUpdates: true,
          }),
        },
      },
    },
  };
}

export async function ensureNoxsoftBootstrapPersisted(params: {
  agent: NoxSoftAgentIdentity;
  runtime?: RuntimeEnv;
}): Promise<boolean> {
  const snapshot = await readConfigFileSnapshot();
  const config = snapshot.valid ? snapshot.config : {};
  const next = applyNoxsoftBootstrap(config, params.agent);
  if (isDeepStrictEqual(config, next)) {
    return false;
  }
  await writeConfigFile(next);
  if (params.runtime) {
    logConfigUpdated(params.runtime, { suffix: "(NoxSoft defaults applied)" });
  }
  return true;
}
