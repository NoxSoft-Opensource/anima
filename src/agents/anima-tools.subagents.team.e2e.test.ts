import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAnimaTools } from "./anima-tools.js";
import "./test-helpers/fast-core-tools.js";
import { resetSubagentRegistryForTests } from "./subagent-registry.js";

type TeamTestConfig = ReturnType<(typeof import("../config/config.js"))["loadConfig"]>;

const hoisted = vi.hoisted(() => {
  const callGatewayMock = vi.fn();
  const defaultConfigOverride = {
    session: {
      mainKey: "main",
      scope: "per-sender",
    },
  } as TeamTestConfig;
  const state = { configOverride: defaultConfigOverride };
  return { callGatewayMock, defaultConfigOverride, state };
});

const callGatewayMock = hoisted.callGatewayMock;

function resetConfigOverride() {
  hoisted.state.configOverride = hoisted.defaultConfigOverride;
}

function setConfigOverride(next: TeamTestConfig) {
  hoisted.state.configOverride = next;
}

vi.mock("../gateway/call.js", () => ({
  callGateway: (opts: unknown) => hoisted.callGatewayMock(opts),
}));

vi.mock("../../gateway/call.js", () => ({
  callGateway: (opts: unknown) => hoisted.callGatewayMock(opts),
}));

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    loadConfig: () => hoisted.state.configOverride,
    resolveGatewayPort: () => 18789,
  };
});

vi.mock("../../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    loadConfig: () => hoisted.state.configOverride,
    resolveGatewayPort: () => 18789,
  };
});

describe("anima-tools: subagents_team", () => {
  beforeEach(() => {
    resetSubagentRegistryForTests();
    resetConfigOverride();
    callGatewayMock.mockReset();
  });

  it("launches a custom team and injects per-member identity/team prompt context", async () => {
    const calls: Array<{ method?: string; params?: unknown }> = [];
    let runCounter = 0;
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string; params?: unknown };
      calls.push(request);
      if (request.method === "sessions.patch") {
        return { ok: true };
      }
      if (request.method === "agent") {
        runCounter += 1;
        return { runId: `run-team-${runCounter}`, status: "accepted" };
      }
      return {};
    });

    const tool = createAnimaTools({
      agentSessionKey: "agent:main:main",
      agentChannel: "discord",
    }).find((candidate) => candidate.name === "subagents_team");
    if (!tool) {
      throw new Error("missing subagents_team tool");
    }

    const result = await tool.execute("call-team", {
      objective: "ship onboarding flow",
      teamId: "onboard-v1",
      teamName: "Onboarding Team",
      members: [
        {
          id: "security",
          role: "security reviewer",
          task: "audit auth + session boundaries",
          identity: {
            name: "Sentinel",
            style: "strict and precise",
          },
        },
        {
          id: "ux",
          role: "ux designer",
          task: "simplify dashboard onboarding",
          identity: {
            name: "Nova",
            directives: ["favor fewer clicks"],
          },
        },
      ],
    });

    expect(result.details).toMatchObject({
      status: "accepted",
      team: {
        id: "onboard-v1",
        acceptedMembers: 2,
        failedMembers: 0,
      },
    });

    const agentCalls = calls.filter((call) => call.method === "agent");
    expect(agentCalls).toHaveLength(2);
    const promptBlob = agentCalls
      .map((call) =>
        (
          (call.params as { extraSystemPrompt?: string } | undefined)?.extraSystemPrompt ?? ""
        ).trim(),
      )
      .join("\n\n");
    expect(promptBlob).toContain("## Team Context");
    expect(promptBlob).toContain("Team objective: ship onboarding flow");
    expect(promptBlob).toContain("## Identity Profile");
    expect(promptBlob).toContain("Name: Sentinel");
    expect(promptBlob).toContain("Name: Nova");
  });

  it("stops on first failure in sequential mode", async () => {
    setConfigOverride({
      session: {
        mainKey: "main",
        scope: "per-sender",
      },
      agents: {
        defaults: {
          subagents: {
            maxChildrenPerAgent: 1,
          },
        },
      },
    });

    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "sessions.patch") {
        return { ok: true };
      }
      if (request.method === "agent") {
        return { runId: "run-1", status: "accepted" };
      }
      return {};
    });

    const tool = createAnimaTools({
      agentSessionKey: "agent:main:main",
      agentChannel: "discord",
    }).find((candidate) => candidate.name === "subagents_team");
    if (!tool) {
      throw new Error("missing subagents_team tool");
    }

    const result = await tool.execute("call-team-seq", {
      objective: "triage regressions",
      mode: "sequential",
      members: [
        { role: "lead", task: "handle first triage pass" },
        { role: "qa", task: "validate triage report" },
        { role: "ops", task: "prepare rollout safeguards" },
      ],
    });

    expect(result.details).toMatchObject({
      status: "partial",
      team: {
        launchedMembers: 2,
        acceptedMembers: 1,
        failedMembers: 1,
        requestedMembers: 3,
      },
    });
  });
});
