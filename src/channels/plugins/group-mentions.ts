import type { AnimaConfig } from "../../config/config.js";
import type { GroupToolPolicyConfig } from "../../config/types.tools.js";
import {
  resolveChannelGroupRequireMention,
  resolveChannelGroupToolsPolicy,
} from "../../config/group-policy.js";

type GroupMentionParams = {
  cfg: AnimaConfig;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  accountId?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  senderUsername?: string | null;
  senderE164?: string | null;
};

export type { GroupMentionParams };

export function resolveBlueBubblesGroupRequireMention(params: GroupMentionParams): boolean {
  return resolveChannelGroupRequireMention({
    cfg: params.cfg,
    channel: "bluebubbles",
    groupId: params.groupId,
    accountId: params.accountId,
  });
}

export function resolveBlueBubblesGroupToolPolicy(
  params: GroupMentionParams,
): GroupToolPolicyConfig | undefined {
  return resolveChannelGroupToolsPolicy({
    cfg: params.cfg,
    channel: "bluebubbles",
    groupId: params.groupId,
    accountId: params.accountId,
    senderId: params.senderId,
    senderName: params.senderName,
    senderUsername: params.senderUsername,
    senderE164: params.senderE164,
  });
}
