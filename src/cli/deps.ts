import type { sendMessageWhatsApp } from "../channels/web/index.js";
import type { OutboundSendDeps } from "../infra/outbound/deliver.js";
import type { CliDeps as OutboundCliDeps } from "./outbound-send-deps.js";

export type CliDeps = OutboundCliDeps & {
  sendMessageWhatsApp: typeof sendMessageWhatsApp;
};

async function unsupportedChannelSender(channel: string): Promise<never> {
  throw new Error(
    `${channel} sending is not available via createDefaultDeps(); pass explicit deps instead.`,
  );
}

export function createDefaultDeps(): CliDeps {
  return {
    sendMessageWhatsApp: async (...args) => {
      const { sendMessageWhatsApp } = await import("../channels/web/index.js");
      return await sendMessageWhatsApp(...args);
    },
    sendMessageTelegram: async () => await unsupportedChannelSender("Telegram"),
    sendMessageDiscord: async () => await unsupportedChannelSender("Discord"),
    sendMessageSlack: async () => await unsupportedChannelSender("Slack"),
    sendMessageSignal: async () => await unsupportedChannelSender("Signal"),
    sendMessageIMessage: async () => await unsupportedChannelSender("iMessage"),
  };
}

// Provider docking: extend this mapping when adding new outbound send deps.
export function createOutboundSendDeps(deps: CliDeps): OutboundSendDeps {
  return {
    sendWhatsApp: deps.sendMessageWhatsApp,
  };
}

export { logWebSelfId } from "../web/auth-store.js";
