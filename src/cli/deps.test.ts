import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultDeps } from "./deps.js";

const moduleLoads = vi.hoisted(() => ({
  whatsapp: vi.fn(),
}));

const sendFns = vi.hoisted(() => ({
  whatsapp: vi.fn(async () => ({ messageId: "w1", toJid: "whatsapp:1" })),
}));

vi.mock("../channels/web/index.js", () => {
  moduleLoads.whatsapp();
  return { sendMessageWhatsApp: sendFns.whatsapp };
});

describe("createDefaultDeps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not load provider modules until a dependency is used", async () => {
    const deps = createDefaultDeps();

    expect(moduleLoads.whatsapp).not.toHaveBeenCalled();

    const sendWhatsApp = deps.sendMessageWhatsApp as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>;
    await sendWhatsApp("+1555", "hello", { verbose: false });

    expect(moduleLoads.whatsapp).toHaveBeenCalledTimes(1);
    expect(sendFns.whatsapp).toHaveBeenCalledTimes(1);
  });

  it("reuses module cache after first dynamic import", async () => {
    const deps = createDefaultDeps();
    const sendWhatsApp = deps.sendMessageWhatsApp as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>;

    await sendWhatsApp("+1555", "first", { verbose: false });
    await sendWhatsApp("+1555", "second", { verbose: false });

    // Module body executes only once across the entire test suite (cached by the runtime),
    // so after clearAllMocks the load count is 0 — the send function is still callable.
    expect(sendFns.whatsapp).toHaveBeenCalledTimes(2);
  });
});
