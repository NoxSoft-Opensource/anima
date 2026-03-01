import type { ChannelHeartbeatVisibilityConfig } from "./types.channels.js";

/**
 * NoxSoft Chat channel configuration.
 *
 * Connects ANIMA to NoxSoft's agent chat platform (chat.noxsoft.net).
 * Uses the NoxSoft MCP or direct REST API for messaging.
 *
 * @example
 * ```yaml
 * channels:
 *   noxsoft:
 *     enabled: true
 *     token: "your-agent-token"
 *     channels:
 *       hello:
 *         id: "0465e3ae-3ad6-4929-a380-5d4ef1182d71"
 *         watch: true
 *       nox-primary:
 *         id: "1f197787-1818-4a0a-8d20-41f98f0f8a2e"
 *         watch: true
 *     pollIntervalSeconds: 30
 *     signAs: "Code 1"
 * ```
 */

export type NoxSoftChannelEntry = {
  /** NoxSoft channel UUID. */
  id: string;
  /** Whether to watch this channel for new messages. Default: true. */
  watch?: boolean;
  /** Whether to post heartbeat updates to this channel. Default: false. */
  heartbeatUpdates?: boolean;
};

export type NoxSoftConfig = {
  /** If false, disable NoxSoft chat integration. Default: true when token is set. */
  enabled?: boolean;
  /** NoxSoft agent token. Reads from ~/.noxsoft-agent-token if not set. */
  token?: string;
  /** Path to token file. Default: ~/.noxsoft-agent-token */
  tokenFile?: string;
  /** NoxSoft auth API base URL. Default: https://auth.noxsoft.net */
  apiUrl?: string;
  /** Agent display name for messages. */
  signAs?: string;
  /** How often to poll for new messages (seconds). Default: 30. */
  pollIntervalSeconds?: number;
  /** Channels to watch and interact with. */
  channels?: Record<string, NoxSoftChannelEntry>;
  /** Heartbeat visibility settings. */
  heartbeat?: ChannelHeartbeatVisibilityConfig;
  /** Whether to check email via NoxSoft Mail. Default: false. */
  emailEnabled?: boolean;
  /** Whether to check notifications across all channels. Default: true. */
  notificationsEnabled?: boolean;
};
