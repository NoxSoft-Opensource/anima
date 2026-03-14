export type AnimaNodeKind =
  | "goal"
  | "feature"
  | "person"
  | "chronos"
  | "affect"
  | "agent"
  | "role"
  | "task";

export type AnimaRelation =
  | "owns"
  | "supports"
  | "focuses_on"
  | "tracks"
  | "influences"
  | "reports_to"
  | "specializes_in"
  | "delegates"
  | "executes"
  | "escalates_to";

export const ANIMA_NODE_KINDS = [
  "goal",
  "feature",
  "person",
  "chronos",
  "affect",
  "agent",
  "role",
  "task",
] as const satisfies readonly AnimaNodeKind[];

export const ANIMA_RELATIONS = [
  "owns",
  "supports",
  "focuses_on",
  "tracks",
  "influences",
  "reports_to",
  "specializes_in",
  "delegates",
  "executes",
  "escalates_to",
] as const satisfies readonly AnimaRelation[];

export function isAnimaNodeKind(value: string): value is AnimaNodeKind {
  return (ANIMA_NODE_KINDS as readonly string[]).includes(value);
}

export function isAnimaRelation(value: string): value is AnimaRelation {
  return (ANIMA_RELATIONS as readonly string[]).includes(value);
}

export function missionGoalNodeId(goalId: string): string {
  return `goal:${goalId}`;
}

export function missionFeatureNodeId(featureId: string): string {
  return `feature:${featureId}`;
}

export function missionPersonNodeId(personId: string): string {
  return `person:${personId}`;
}

export const ANIMA_CHRONOS_NODE_ID = "chronos:state";
export const ANIMA_AFFECT_NODE_ID = "affect:state";

// ---------------------------------------------------------------------------
// Org node ID helpers
// ---------------------------------------------------------------------------

export function orgAgentNodeId(agentId: string): string {
  return `agent:${agentId}`;
}

export function orgRoleNodeId(roleId: string): string {
  return `role:${roleId}`;
}

export function orgTaskNodeId(taskId: string): string {
  return `task:${taskId}`;
}
