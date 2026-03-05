import { Type } from "@sinclair/typebox";
import crypto from "node:crypto";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import type { AnyAgentTool } from "./common.js";
import { optionalStringEnum } from "../schema/typebox.js";
import { jsonResult, readStringParam } from "./common.js";
import { createSessionsSpawnTool } from "./sessions-spawn-tool.js";

const TEAM_MODES = ["parallel", "sequential"] as const;
const TEAM_CLEANUP_MODES = ["keep", "delete"] as const;
const MAX_TEAM_MEMBERS = 12;

const TeamMemberIdentitySchema = Type.Object({
  name: Type.Optional(Type.String()),
  mission: Type.Optional(Type.String()),
  style: Type.Optional(Type.String()),
  directives: Type.Optional(Type.Array(Type.String())),
});

const TeamMemberSchema = Type.Object({
  id: Type.Optional(Type.String()),
  label: Type.Optional(Type.String()),
  role: Type.String(),
  task: Type.Optional(Type.String()),
  agentId: Type.Optional(Type.String()),
  model: Type.Optional(Type.String()),
  thinking: Type.Optional(Type.String()),
  runTimeoutSeconds: Type.Optional(Type.Number({ minimum: 0 })),
  cleanup: optionalStringEnum(TEAM_CLEANUP_MODES),
  identity: Type.Optional(TeamMemberIdentitySchema),
});

const SubagentsTeamToolSchema = Type.Object({
  objective: Type.String(),
  teamId: Type.Optional(Type.String()),
  teamName: Type.Optional(Type.String()),
  orchestrator: Type.Optional(Type.String()),
  mode: optionalStringEnum(TEAM_MODES),
  members: Type.Array(TeamMemberSchema, { minItems: 1 }),
});

type TeamMemberSpec = {
  id?: string;
  label?: string;
  role: string;
  task?: string;
  agentId?: string;
  model?: string;
  thinking?: string;
  runTimeoutSeconds?: number;
  cleanup?: "keep" | "delete";
  identity?: {
    name?: string;
    mission?: string;
    style?: string;
    directives?: string[];
  };
};

function normalizeInlineText(value: unknown, maxChars = 220): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(0, maxChars);
}

function normalizeInlineList(value: unknown, maxItems = 8): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((entry) => normalizeInlineText(entry, 220))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, maxItems);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeMember(
  member: unknown,
  index: number,
): { value?: TeamMemberSpec; error?: string } {
  if (!member || typeof member !== "object") {
    return { error: `members[${index + 1}] must be an object` };
  }
  const candidate = member as Record<string, unknown>;
  const role = normalizeInlineText(candidate.role, 120);
  if (!role) {
    return { error: `members[${index + 1}] missing role` };
  }

  const timeoutRaw = candidate.runTimeoutSeconds;
  const runTimeoutSeconds =
    typeof timeoutRaw === "number" && Number.isFinite(timeoutRaw)
      ? Math.max(0, Math.floor(timeoutRaw))
      : undefined;

  const cleanup =
    candidate.cleanup === "keep" || candidate.cleanup === "delete" ? candidate.cleanup : undefined;
  const identityRaw = candidate.identity;
  const identity =
    identityRaw && typeof identityRaw === "object"
      ? {
          name: normalizeInlineText((identityRaw as Record<string, unknown>).name, 80),
          mission: normalizeInlineText((identityRaw as Record<string, unknown>).mission, 220),
          style: normalizeInlineText((identityRaw as Record<string, unknown>).style, 180),
          directives: normalizeInlineList((identityRaw as Record<string, unknown>).directives, 8),
        }
      : undefined;

  return {
    value: {
      id: normalizeInlineText(candidate.id, 80),
      label: normalizeInlineText(candidate.label, 120),
      role,
      task: normalizeInlineText(candidate.task, 360),
      agentId: normalizeInlineText(candidate.agentId, 80),
      model: normalizeInlineText(candidate.model, 180),
      thinking: normalizeInlineText(candidate.thinking, 24),
      runTimeoutSeconds,
      cleanup,
      identity:
        identity &&
        (identity.name || identity.mission || identity.style || identity.directives?.length)
          ? identity
          : undefined,
    },
  };
}

export function createSubagentsTeamTool(opts?: {
  agentSessionKey?: string;
  agentChannel?: GatewayMessageChannel;
  agentAccountId?: string;
  agentTo?: string;
  agentThreadId?: string | number;
  agentGroupId?: string | null;
  agentGroupChannel?: string | null;
  agentGroupSpace?: string | null;
  sandboxed?: boolean;
  requesterAgentIdOverride?: string;
}): AnyAgentTool {
  return {
    label: "Subagents",
    name: "subagents_team",
    description:
      "Create a custom sub-agent team with per-member identities and tasks. The caller remains the orchestrator.",
    parameters: SubagentsTeamToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const objective = readStringParam(params, "objective", { required: true });
      const teamName = normalizeInlineText(params.teamName, 100);
      const teamId =
        normalizeInlineText(params.teamId, 80) || `team-${crypto.randomUUID().slice(0, 8)}`;
      const mode = params.mode === "sequential" ? "sequential" : "parallel";
      const orchestrator = normalizeInlineText(params.orchestrator, 120) || "requester-session";

      const membersRaw = Array.isArray(params.members) ? params.members : [];
      if (membersRaw.length === 0) {
        return jsonResult({
          status: "error",
          error: "members required",
        });
      }
      if (membersRaw.length > MAX_TEAM_MEMBERS) {
        return jsonResult({
          status: "error",
          error: `too many members (${membersRaw.length}/${MAX_TEAM_MEMBERS})`,
        });
      }

      const members: TeamMemberSpec[] = [];
      for (const [index, member] of membersRaw.entries()) {
        const parsed = normalizeMember(member, index);
        if (!parsed.value) {
          return jsonResult({
            status: "error",
            error: parsed.error ?? `invalid members[${index + 1}]`,
          });
        }
        members.push(parsed.value);
      }

      const spawnTool = createSessionsSpawnTool({
        agentSessionKey: opts?.agentSessionKey,
        agentChannel: opts?.agentChannel,
        agentAccountId: opts?.agentAccountId,
        agentTo: opts?.agentTo,
        agentThreadId: opts?.agentThreadId,
        agentGroupId: opts?.agentGroupId,
        agentGroupChannel: opts?.agentGroupChannel,
        agentGroupSpace: opts?.agentGroupSpace,
        sandboxed: opts?.sandboxed,
        requesterAgentIdOverride: opts?.requesterAgentIdOverride,
      });

      const results: Array<{
        index: number;
        id?: string;
        role: string;
        label: string;
        status?: string;
        runId?: string;
        childSessionKey?: string;
        error?: string;
      }> = [];
      for (const [index, member] of members.entries()) {
        const label = member.label || member.id || member.role;
        const roleTask =
          member.task ||
          `Team objective: ${objective}
Role: ${member.role}
Deliver a concise role-specific contribution for the orchestrator.`;
        const spawnResult = await spawnTool.execute(`subagents_team_${index + 1}`, {
          task: roleTask,
          label,
          agentId: member.agentId,
          model: member.model,
          thinking: member.thinking,
          runTimeoutSeconds: member.runTimeoutSeconds,
          cleanup: member.cleanup ?? "keep",
          identity: {
            name: member.identity?.name || member.label || member.id,
            role: member.role,
            mission:
              member.identity?.mission ||
              `Advance team objective "${objective}" from role "${member.role}".`,
            style: member.identity?.style,
            directives: member.identity?.directives,
          },
          team: {
            id: teamId,
            name: teamName,
            objective,
            orchestrator,
            memberId: member.id,
          },
        });
        const details = (spawnResult.details ?? {}) as Record<string, unknown>;
        const status = typeof details.status === "string" ? details.status : undefined;
        const runId = typeof details.runId === "string" ? details.runId : undefined;
        const childSessionKey =
          typeof details.childSessionKey === "string" ? details.childSessionKey : undefined;
        const error = typeof details.error === "string" ? details.error : undefined;
        results.push({
          index: index + 1,
          id: member.id,
          role: member.role,
          label,
          status,
          runId,
          childSessionKey,
          error,
        });
        if (mode === "sequential" && status !== "accepted") {
          break;
        }
      }

      const accepted = results.filter((entry) => entry.status === "accepted");
      const failed = results.filter((entry) => entry.status !== "accepted");
      const status =
        accepted.length === results.length ? "accepted" : accepted.length > 0 ? "partial" : "error";

      return jsonResult({
        status,
        team: {
          id: teamId,
          name: teamName,
          objective,
          orchestrator,
          requestedMembers: members.length,
          launchedMembers: results.length,
          acceptedMembers: accepted.length,
          failedMembers: failed.length,
          mode,
        },
        members: results,
        text:
          status === "accepted"
            ? `team ${teamName ?? teamId} launched (${accepted.length}/${members.length} members).`
            : status === "partial"
              ? `team ${teamName ?? teamId} partially launched (${accepted.length}/${members.length} members).`
              : `team ${teamName ?? teamId} failed to launch.`,
      });
    },
  };
}
