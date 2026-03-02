import { VERSION } from "../../version.js";
import { resolveCliChannelOptions } from "../channel-options.js";

export type ProgramContext = {
  programVersion: string;
  channelOptions: string[];
  agentChannelOptions: string;
};

export function createProgramContext(): ProgramContext {
  const channelOptions = resolveCliChannelOptions();
  return {
    programVersion: VERSION,
    channelOptions,
    agentChannelOptions: ["last", ...channelOptions].join("|"),
  };
}
