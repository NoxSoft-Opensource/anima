import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEnv } from "../runtime.js";

vi.mock("./agent-via-gateway.js", () => ({
  agentCliCommand: vi.fn(),
}));

import { agentCliCommand } from "./agent-via-gateway.js";
import {
  agentsReadinessCommand,
  buildReadinessSwarmPrompt,
  parseReadinessTracks,
} from "./agents.commands.readiness.js";

const runtime: RuntimeEnv = {
  log: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(),
};

describe("agentsReadinessCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses and deduplicates track values", () => {
    const tracks = parseReadinessTracks("security,testing,security,ux");
    expect(tracks).toEqual(["security", "testing", "ux"]);
  });

  it("throws for unknown tracks", () => {
    expect(() => parseReadinessTracks("security,dragon")).toThrowError(
      /Unknown readiness track\(s\): dragon/,
    );
  });

  it("builds a systems-thinking prompt with explicit tracks", () => {
    const prompt = buildReadinessSwarmPrompt({
      tracks: ["security", "testing"],
      objective: "Lock down security and test integrity.",
    });

    expect(prompt).toContain("Systems-thinking operating model");
    expect(prompt).toContain("Build loop map");
    expect(prompt).toContain("- security (Security auditor)");
    expect(prompt).toContain("- testing (Test integrity reviewer)");
  });

  it("supports dry-run mode without dispatching agent execution", async () => {
    await agentsReadinessCommand(
      {
        tracks: "security,reliability",
        dryRun: true,
      },
      runtime,
    );

    expect(agentCliCommand).not.toHaveBeenCalled();
    expect(runtime.log).toHaveBeenCalledTimes(1);
    const logged = vi.mocked(runtime.log).mock.calls[0]?.[0];
    expect(String(logged)).toContain("security (Security auditor)");
    expect(String(logged)).toContain("reliability (Reliability engineer)");
  });

  it("defaults to main agent with high thinking when no route is provided", async () => {
    vi.mocked(agentCliCommand).mockResolvedValueOnce({});

    await agentsReadinessCommand({}, runtime);

    expect(agentCliCommand).toHaveBeenCalledTimes(1);
    const firstCall = vi.mocked(agentCliCommand).mock.calls[0]?.[0];
    expect(firstCall).toMatchObject({
      agent: "main",
      thinking: "high",
      deliver: false,
      json: false,
      local: false,
    });
    expect(firstCall?.message).toContain("Deploy a subagent team now using `sessions_spawn`");
  });

  it("does not force main agent when routing by recipient", async () => {
    vi.mocked(agentCliCommand).mockResolvedValueOnce({});

    await agentsReadinessCommand({ to: "+15555550123" }, runtime);

    expect(agentCliCommand).toHaveBeenCalledTimes(1);
    const firstCall = vi.mocked(agentCliCommand).mock.calls[0]?.[0];
    expect(firstCall?.to).toBe("+15555550123");
    expect(firstCall?.agent).toBeUndefined();
  });
});
