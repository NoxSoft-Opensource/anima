import type { GatewayRequestHandlers } from "./types.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

export const mcpHandlers: GatewayRequestHandlers = {
  "mcp.list": async ({ respond }) => {
    try {
      const { listServers } = await import("../../mcp/registry.js");
      const servers = await listServers();
      respond(true, { servers });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "mcp.add": async ({ params, respond }) => {
    const p = params as
      | {
          name?: string;
          command?: string;
          args?: string[];
          env?: Record<string, string>;
        }
      | undefined;
    if (!p?.name || !p?.command) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "name and command are required"),
      );
      return;
    }
    try {
      const { addServer } = await import("../../mcp/registry.js");
      const { syncConfig } = await import("../../mcp/config-sync.js");
      const registry = await addServer({
        name: p.name,
        command: p.command,
        args: p.args ?? [],
        env: p.env ?? {},
        gitSource: "",
        localPath: "",
        autoUpdate: false,
        status: "unknown",
        consecutiveFailures: 0,
      });
      await syncConfig();
      respond(true, { servers: registry.servers });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "mcp.remove": async ({ params, respond }) => {
    const p = params as { name?: string } | undefined;
    if (!p?.name) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name is required"));
      return;
    }
    try {
      const { removeServer } = await import("../../mcp/registry.js");
      const { syncConfig } = await import("../../mcp/config-sync.js");
      const registry = await removeServer(p.name);
      await syncConfig();
      respond(true, { servers: registry.servers });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "mcp.sync": async ({ respond }) => {
    try {
      const { syncConfig } = await import("../../mcp/config-sync.js");
      const result = await syncConfig();
      respond(true, result);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
