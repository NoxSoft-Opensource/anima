import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { ActionGate } from "./common.js";

type DiscordActionConfig = Record<string, boolean | undefined>;

export async function handleDiscordMessagingAction(
  action: string,
  _params: Record<string, unknown>,
  _isActionEnabled: ActionGate<DiscordActionConfig>,
): Promise<AgentToolResult<unknown>> {
  throw new Error(`Discord messaging action "${action}" is unavailable in this build.`);
}
