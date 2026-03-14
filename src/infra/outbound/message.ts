import fs from "node:fs";
import type { AnimaConfig } from "../../config/config.js";
import type { PollInput } from "../../polls.js";
import { TOKEN_PATH } from "../../auth/noxsoft-auth.js";
import { getChannelPlugin } from "../../channels/plugins/index.js";
import { loadConfig } from "../../config/config.js";
import { callGateway, randomIdempotencyKey } from "../../gateway/call.js";
import { normalizePollInput } from "../../polls.js";
import {
  GATEWAY_CLIENT_MODES,
  GATEWAY_CLIENT_NAMES,
  type GatewayClientMode,
  type GatewayClientName,
  normalizeMessageChannel,
} from "../../utils/message-channel.js";
import { resolveMessageChannelSelection } from "./channel-selection.js";
import {
  deliverOutboundPayloads,
  type OutboundDeliveryResult,
  type OutboundSendDeps,
} from "./deliver.js";
import { normalizeReplyPayloadsForDelivery } from "./payloads.js";
import { resolveOutboundTarget } from "./targets.js";

export type MessageGatewayOptions = {
  url?: string;
  token?: string;
  timeoutMs?: number;
  clientName?: GatewayClientName;
  clientDisplayName?: string;
  mode?: GatewayClientMode;
};

type MessageSendParams = {
  to: string;
  content: string;
  channel?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  gifPlayback?: boolean;
  accountId?: string;
  replyToId?: string;
  threadId?: string | number;
  dryRun?: boolean;
  bestEffort?: boolean;
  deps?: OutboundSendDeps;
  cfg?: AnimaConfig;
  gateway?: MessageGatewayOptions;
  idempotencyKey?: string;
  mirror?: {
    sessionKey: string;
    agentId?: string;
    text?: string;
    mediaUrls?: string[];
  };
  abortSignal?: AbortSignal;
  silent?: boolean;
};

export type MessageSendResult = {
  channel: string;
  to: string;
  via: "direct" | "gateway";
  mediaUrl: string | null;
  mediaUrls?: string[];
  result?: OutboundDeliveryResult | { messageId: string };
  dryRun?: boolean;
};

type MessagePollParams = {
  to: string;
  question: string;
  options: string[];
  maxSelections?: number;
  durationSeconds?: number;
  durationHours?: number;
  channel?: string;
  accountId?: string;
  threadId?: string;
  silent?: boolean;
  isAnonymous?: boolean;
  dryRun?: boolean;
  cfg?: AnimaConfig;
  gateway?: MessageGatewayOptions;
  idempotencyKey?: string;
};

export type MessagePollResult = {
  channel: string;
  to: string;
  question: string;
  options: string[];
  maxSelections: number;
  durationSeconds: number | null;
  durationHours: number | null;
  via: "gateway";
  result?: {
    messageId: string;
    toJid?: string;
    channelId?: string;
    conversationId?: string;
    pollId?: string;
  };
  dryRun?: boolean;
};

function resolveGatewayOptions(opts?: MessageGatewayOptions) {
  // Security: backend callers (tools/agents) must not accept user-controlled gateway URLs.
  // Use config-derived gateway target only.
  const url =
    opts?.mode === GATEWAY_CLIENT_MODES.BACKEND ||
    opts?.clientName === GATEWAY_CLIENT_NAMES.GATEWAY_CLIENT
      ? undefined
      : opts?.url;
  return {
    url,
    token: opts?.token,
    timeoutMs:
      typeof opts?.timeoutMs === "number" && Number.isFinite(opts.timeoutMs)
        ? Math.max(1, Math.floor(opts.timeoutMs))
        : 10_000,
    clientName: opts?.clientName ?? GATEWAY_CLIENT_NAMES.CLI,
    clientDisplayName: opts?.clientDisplayName,
    mode: opts?.mode ?? GATEWAY_CLIENT_MODES.CLI,
  };
}

function resolveNoxsoftApiBase(cfg: AnimaConfig): string {
  return cfg.channels?.noxsoft?.apiUrl?.trim() || "https://auth.noxsoft.net";
}

function resolveNoxsoftToken(cfg: AnimaConfig): string {
  const inlineToken = cfg.channels?.noxsoft?.token?.trim();
  if (inlineToken) {
    return inlineToken;
  }

  const tokenFile = cfg.channels?.noxsoft?.tokenFile?.trim() || TOKEN_PATH;
  try {
    const token = fs.readFileSync(tokenFile, "utf-8").trim();
    if (token) {
      return token;
    }
  } catch {
    // Fall through to the error below.
  }

  throw new Error(`NoxSoft token not configured. Expected token in ${tokenFile}`);
}

async function sendNoxsoftMessageDirect(params: {
  cfg: AnimaConfig;
  to: string;
  content: string;
  mediaUrl: string | null;
  mediaUrls?: string[];
  dryRun?: boolean;
  abortSignal?: AbortSignal;
}): Promise<MessageSendResult> {
  if (params.dryRun) {
    return {
      channel: "noxsoft",
      to: params.to,
      via: "direct",
      mediaUrl: params.mediaUrl,
      mediaUrls: params.mediaUrls,
      dryRun: true,
    };
  }

  const token = resolveNoxsoftToken(params.cfg);
  const apiBase = resolveNoxsoftApiBase(params.cfg).replace(/\/+$/, "");
  const response = await fetch(`${apiBase}/api/agents/chat/channels/${params.to}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: params.content,
      mediaUrl: params.mediaUrl ?? undefined,
      mediaUrls: params.mediaUrls?.length ? params.mediaUrls : undefined,
    }),
    signal: params.abortSignal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`NoxSoft send failed (${response.status}): ${text}`);
  }

  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    messageId?: string;
  };
  const messageId = payload.messageId ?? payload.id ?? `noxsoft:${Date.now()}`;
  return {
    channel: "noxsoft",
    to: params.to,
    via: "direct",
    mediaUrl: params.mediaUrl,
    mediaUrls: params.mediaUrls,
    result: { messageId },
  };
}

export async function sendMessage(params: MessageSendParams): Promise<MessageSendResult> {
  const cfg = params.cfg ?? loadConfig();
  const channel = params.channel?.trim()
    ? normalizeMessageChannel(params.channel)
    : (await resolveMessageChannelSelection({ cfg })).channel;
  if (!channel) {
    throw new Error(`Unknown channel: ${params.channel}`);
  }
  const normalizedPayloads = normalizeReplyPayloadsForDelivery([
    {
      text: params.content,
      mediaUrl: params.mediaUrl,
      mediaUrls: params.mediaUrls,
    },
  ]);
  const mirrorText = normalizedPayloads
    .map((payload) => payload.text)
    .filter(Boolean)
    .join("\n");
  const mirrorMediaUrls = normalizedPayloads.flatMap(
    (payload) => payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : []),
  );
  const primaryMediaUrl = mirrorMediaUrls[0] ?? params.mediaUrl ?? null;

  if (channel === "noxsoft") {
    return sendNoxsoftMessageDirect({
      cfg,
      to: params.to,
      content: params.content,
      mediaUrl: primaryMediaUrl,
      mediaUrls: mirrorMediaUrls.length ? mirrorMediaUrls : undefined,
      dryRun: params.dryRun,
      abortSignal: params.abortSignal,
    });
  }

  const plugin = getChannelPlugin(channel);
  if (!plugin) {
    throw new Error(`Unknown channel: ${channel}`);
  }
  const deliveryMode = plugin.outbound?.deliveryMode ?? "direct";

  if (params.dryRun) {
    return {
      channel,
      to: params.to,
      via: deliveryMode === "gateway" ? "gateway" : "direct",
      mediaUrl: primaryMediaUrl,
      mediaUrls: mirrorMediaUrls.length ? mirrorMediaUrls : undefined,
      dryRun: true,
    };
  }

  if (deliveryMode !== "gateway") {
    const outboundChannel = channel;
    const resolvedTarget = resolveOutboundTarget({
      channel: outboundChannel,
      to: params.to,
      cfg,
      accountId: params.accountId,
      mode: "explicit",
    });
    if (!resolvedTarget.ok) {
      throw resolvedTarget.error;
    }

    const results = await deliverOutboundPayloads({
      cfg,
      channel: outboundChannel,
      to: resolvedTarget.to,
      accountId: params.accountId,
      payloads: normalizedPayloads,
      replyToId: params.replyToId,
      threadId: params.threadId,
      gifPlayback: params.gifPlayback,
      deps: params.deps,
      bestEffort: params.bestEffort,
      abortSignal: params.abortSignal,
      silent: params.silent,
      mirror: params.mirror
        ? {
            ...params.mirror,
            text: mirrorText || params.content,
            mediaUrls: mirrorMediaUrls.length ? mirrorMediaUrls : undefined,
          }
        : undefined,
    });

    return {
      channel,
      to: params.to,
      via: "direct",
      mediaUrl: primaryMediaUrl,
      mediaUrls: mirrorMediaUrls.length ? mirrorMediaUrls : undefined,
      result: results.at(-1),
    };
  }

  const gateway = resolveGatewayOptions(params.gateway);
  const result = await callGateway<{ messageId: string }>({
    url: gateway.url,
    token: gateway.token,
    method: "send",
    params: {
      to: params.to,
      message: params.content,
      mediaUrl: params.mediaUrl,
      mediaUrls: mirrorMediaUrls.length ? mirrorMediaUrls : params.mediaUrls,
      gifPlayback: params.gifPlayback,
      accountId: params.accountId,
      channel,
      sessionKey: params.mirror?.sessionKey,
      idempotencyKey: params.idempotencyKey ?? randomIdempotencyKey(),
    },
    timeoutMs: gateway.timeoutMs,
    clientName: gateway.clientName,
    clientDisplayName: gateway.clientDisplayName,
    mode: gateway.mode,
  });

  return {
    channel,
    to: params.to,
    via: "gateway",
    mediaUrl: primaryMediaUrl,
    mediaUrls: mirrorMediaUrls.length ? mirrorMediaUrls : undefined,
    result,
  };
}

export async function sendPoll(params: MessagePollParams): Promise<MessagePollResult> {
  const cfg = params.cfg ?? loadConfig();
  const channel = params.channel?.trim()
    ? normalizeMessageChannel(params.channel)
    : (await resolveMessageChannelSelection({ cfg })).channel;
  if (!channel) {
    throw new Error(`Unknown channel: ${params.channel}`);
  }

  const pollInput: PollInput = {
    question: params.question,
    options: params.options,
    maxSelections: params.maxSelections,
    durationSeconds: params.durationSeconds,
    durationHours: params.durationHours,
  };
  const plugin = getChannelPlugin(channel);
  const outbound = plugin?.outbound;
  if (!outbound?.sendPoll) {
    throw new Error(`Unsupported poll channel: ${channel}`);
  }
  const normalized = outbound.pollMaxOptions
    ? normalizePollInput(pollInput, { maxOptions: outbound.pollMaxOptions })
    : normalizePollInput(pollInput);

  if (params.dryRun) {
    return {
      channel,
      to: params.to,
      question: normalized.question,
      options: normalized.options,
      maxSelections: normalized.maxSelections,
      durationSeconds: normalized.durationSeconds ?? null,
      durationHours: normalized.durationHours ?? null,
      via: "gateway",
      dryRun: true,
    };
  }

  const gateway = resolveGatewayOptions(params.gateway);
  const result = await callGateway<{
    messageId: string;
    toJid?: string;
    channelId?: string;
    conversationId?: string;
    pollId?: string;
  }>({
    url: gateway.url,
    token: gateway.token,
    method: "poll",
    params: {
      to: params.to,
      question: normalized.question,
      options: normalized.options,
      maxSelections: normalized.maxSelections,
      durationSeconds: normalized.durationSeconds,
      durationHours: normalized.durationHours,
      threadId: params.threadId,
      silent: params.silent,
      isAnonymous: params.isAnonymous,
      channel,
      accountId: params.accountId,
      idempotencyKey: params.idempotencyKey ?? randomIdempotencyKey(),
    },
    timeoutMs: gateway.timeoutMs,
    clientName: gateway.clientName,
    clientDisplayName: gateway.clientDisplayName,
    mode: gateway.mode,
  });

  return {
    channel,
    to: params.to,
    question: normalized.question,
    options: normalized.options,
    maxSelections: normalized.maxSelections,
    durationSeconds: normalized.durationSeconds ?? null,
    durationHours: normalized.durationHours ?? null,
    via: "gateway",
    result,
  };
}
