// Stub: pi-embedded runner model resolution (removed during ANIMA v2 rebranding)

import type { Model, Api } from "@mariozechner/pi-ai";

export function resolveModel(..._args: unknown[]): { model?: Model<Api>; error?: string } {
  return { error: "pi-embedded removed — use Claude Code CLI spawner" };
}
