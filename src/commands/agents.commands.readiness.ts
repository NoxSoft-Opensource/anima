import type { CliDeps } from "../cli/deps.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { agentCliCommand } from "./agent-via-gateway.js";

const READINESS_TRACKS = [
  "architecture",
  "security",
  "reliability",
  "ux",
  "testing",
  "release",
] as const;

export type ReadinessTrack = (typeof READINESS_TRACKS)[number];

const READINESS_TRACK_SET = new Set<ReadinessTrack>(READINESS_TRACKS);
const DEFAULT_READINESS_TRACKS: ReadinessTrack[] = [...READINESS_TRACKS];
const DEFAULT_OBJECTIVE =
  "Make ANIMA fully production-ready across architecture, security, UX, reliability, testing, and release operations.";

const TRACK_BRIEFS: Record<ReadinessTrack, { title: string; focus: string; checks: string[] }> = {
  architecture: {
    title: "Architecture steward",
    focus: "Remove fragility, dead paths, and coupling that slow execution or break orchestration.",
    checks: [
      "Find bottlenecks in gateway, daemon, and dashboard coordination.",
      "Reduce redundant flows and document the target architecture.",
      "Propose minimal-risk refactors with explicit rollback points.",
    ],
  },
  security: {
    title: "Security auditor",
    focus: "Harden auth, tool access, and runtime boundaries without blocking core workflows.",
    checks: [
      "Audit auth/session surfaces and default permission scope.",
      "Review command execution and browser/tool exposure for abuse paths.",
      "Patch highest-risk issues first with tests that lock behavior.",
    ],
  },
  reliability: {
    title: "Reliability engineer",
    focus: "Eliminate stuck states and make daemon/gateway/message delivery recover predictably.",
    checks: [
      "Trace gateway/daemon startup and reconnect loops.",
      "Fix high-frequency failure modes and retry logic gaps.",
      "Add health and readiness checks with clear remediation output.",
    ],
  },
  ux: {
    title: "UX and product finisher",
    focus: "Ensure ANIMA starts cleanly, surfaces status clearly, and minimizes user friction.",
    checks: [
      "Validate first-run, login, and dashboard handoff experience.",
      "Remove confusing CLI output where GUI should be primary.",
      "Propose copy and flow changes that reduce setup errors.",
    ],
  },
  testing: {
    title: "Test integrity reviewer",
    focus: "Guarantee new behavior is covered and prevent false-positive tests.",
    checks: [
      "Add or update tests for every functional change.",
      "Detect brittle assertions, skipped cases, and flaky paths.",
      "Run targeted and broad suites; report exact pass/fail coverage impact.",
    ],
  },
  release: {
    title: "Release operator",
    focus: "Prepare ship-ready outputs, docs, and runbooks for publish/deploy handoff.",
    checks: [
      "Validate versioning, release notes, and publish prerequisites.",
      "Confirm docs align with actual CLI/UI behavior.",
      "Produce final readiness report with blockers and go/no-go call.",
    ],
  },
};

export type AgentsReadinessCommandOptions = {
  agent?: string;
  to?: string;
  sessionId?: string;
  channel?: string;
  replyTo?: string;
  replyChannel?: string;
  replyAccount?: string;
  thinking?: string;
  timeout?: string;
  tracks?: string;
  objective?: string;
  deliver?: boolean;
  local?: boolean;
  json?: boolean;
  dryRun?: boolean;
};

function parseTrackTokens(input?: string): string[] {
  if (!input?.trim()) {
    return [];
  }
  return input
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export function parseReadinessTracks(input?: string): ReadinessTrack[] {
  const tokens = parseTrackTokens(input);
  if (tokens.length === 0) {
    return DEFAULT_READINESS_TRACKS;
  }

  const unknown = tokens.filter((token) => !READINESS_TRACK_SET.has(token as ReadinessTrack));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown readiness track(s): ${unknown.join(", ")}. Valid tracks: ${READINESS_TRACKS.join(", ")}`,
    );
  }

  const unique: ReadinessTrack[] = [];
  const seen = new Set<ReadinessTrack>();
  for (const token of tokens) {
    const track = token as ReadinessTrack;
    if (seen.has(track)) {
      continue;
    }
    seen.add(track);
    unique.push(track);
  }
  return unique;
}

function formatTrackPlan(track: ReadinessTrack): string {
  const brief = TRACK_BRIEFS[track];
  const checks = brief.checks.map((check) => `  - ${check}`).join("\n");
  return `- ${track} (${brief.title})\n  Focus: ${brief.focus}\n${checks}`;
}

export function buildReadinessSwarmPrompt(params: {
  tracks: ReadinessTrack[];
  objective?: string;
}): string {
  const objective = params.objective?.trim() || DEFAULT_OBJECTIVE;
  const trackPlan = params.tracks.map((track) => formatTrackPlan(track)).join("\n\n");

  return [
    "You are the ANIMA readiness orchestrator.",
    `Objective: ${objective}`,
    "",
    "Deploy a subagent team now using `sessions_spawn` and coordinate end-to-end delivery.",
    "",
    "Systems-thinking operating model (mandatory):",
    "1. Define system boundary: ANIMA CLI, gateway, daemon, dashboard, docs, publish flow.",
    "2. Build loop map: identify reinforcing/balancing loops, delays, constraints.",
    "3. Diagnose behavior: explain why failures repeat and where local fixes backfire.",
    "4. Choose leverage points: prioritize info-flow, incentives, and defaults changes.",
    "5. Model second-order effects: risk, trigger, and rollback for each major change.",
    "6. Instrument learning: metrics, checks, owner, and review cadence.",
    "",
    "Spawn one subagent per readiness track with explicit ownership:",
    trackPlan,
    "",
    "Execution protocol:",
    "- Each subagent inspects relevant files, applies minimal safe changes, and runs targeted tests.",
    "- After each result, integrate only verified improvements; reject speculative edits.",
    "- Keep a live list of blockers, dependencies, and unresolved risks.",
    "- If two tracks conflict, resolve by preserving safety and user experience first.",
    "",
    "Before final response, run readiness gates:",
    "- pnpm check",
    "- pnpm build",
    "- pnpm test",
    "",
    "Final response format:",
    "1. Readiness score (0-100) with rationale",
    "2. Completed changes by track",
    "3. Remaining blockers and exact owner",
    "4. Risk register (severity, trigger, mitigation)",
    "5. Go/No-go recommendation and next 3 actions",
  ].join("\n");
}

export async function agentsReadinessCommand(
  opts: AgentsReadinessCommandOptions,
  runtime: RuntimeEnv = defaultRuntime,
  deps?: CliDeps,
) {
  const tracks = parseReadinessTracks(opts.tracks);
  const prompt = buildReadinessSwarmPrompt({
    tracks,
    objective: opts.objective,
  });

  if (opts.dryRun) {
    if (opts.json) {
      runtime.log(
        JSON.stringify(
          {
            objective: opts.objective?.trim() || DEFAULT_OBJECTIVE,
            tracks,
            message: prompt,
          },
          null,
          2,
        ),
      );
      return;
    }

    runtime.log(prompt);
    return;
  }

  const routeAgent =
    opts.agent?.trim() || (opts.to?.trim() || opts.sessionId?.trim() ? undefined : "main");
  const thinking = opts.thinking?.trim() || "high";

  return await agentCliCommand(
    {
      message: prompt,
      agent: routeAgent,
      to: opts.to,
      sessionId: opts.sessionId,
      channel: opts.channel,
      replyTo: opts.replyTo,
      replyChannel: opts.replyChannel,
      replyAccount: opts.replyAccount,
      thinking,
      timeout: opts.timeout,
      deliver: Boolean(opts.deliver),
      local: Boolean(opts.local),
      json: Boolean(opts.json),
    },
    runtime,
    deps,
  );
}
