import type {
  AnyAgentTool,
  AnimaPluginApi,
  AnimaPluginToolFactory,
} from "../../src/plugins/types.js";
import { createLobsterTool } from "./src/lobster-tool.js";

export default function register(api: AnimaPluginApi) {
  api.registerTool(
    ((ctx) => {
      if (ctx.sandboxed) {
        return null;
      }
      return createLobsterTool(api) as AnyAgentTool;
    }) as AnimaPluginToolFactory,
    { optional: true },
  );
}
