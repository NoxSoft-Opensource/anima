import type { RuntimeEnv } from "../../runtime.js";
import { defaultRuntime } from "../../runtime.js";

export type ChannelsCapabilitiesOptions = {
  channel?: string;
  account?: string;
  target?: string;
  timeout?: string;
  json?: boolean;
};

export async function channelsCapabilitiesCommand(
  _opts: ChannelsCapabilitiesOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  runtime.error("channels capabilities are temporarily unavailable in this build.");
  runtime.exit(1);
}
