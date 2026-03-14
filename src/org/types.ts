/**
 * ANIMA 6 Organization Types
 *
 * Defines the data model for Nox Organizations — hierarchical structures
 * of humans and agents that self-organize for cybersecurity, feature
 * expansion, and autonomous operation.
 */

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

export interface NoxOrganization {
  id: string;
  name: string;
  description: string;
  createdAt: number; // unix ms
  updatedAt: number;
  ownerId: string; // human or agent deviceId
  settings: OrgSettings;
}

export interface OrgSettings {
  maxAgents: number;
  maxHumans: number;
  autoSpecialization: boolean;
  securityLevel: "standard" | "hardened" | "paranoid";
  syncIntervalMs: number; // brain sync interval
  backupIntervalMs: number; // workspace backup interval
  peerPort: number; // P2P listen port
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export type MemberKind = "human" | "agent";

export type OrgRole =
  | "owner" // full control
  | "operator" // can manage agents and tasks
  | "coordinator" // can delegate and organize
  | "worker" // executes tasks
  | "observer"; // read-only

export interface OrgMember {
  id: string;
  kind: MemberKind;
  displayName: string;
  deviceId?: string; // for agents
  role: OrgRole;
  description: string;
  specializations: string[];
  joinedAt: number;
  lastActiveAt: number;
  status: MemberStatus;
  reportsTo?: string; // member id
  permissions: MemberPermissions;
}

export type MemberStatus = "active" | "idle" | "busy" | "offline" | "suspended";

export interface MemberPermissions {
  canCreateTasks: boolean;
  canDelegateTasks: boolean;
  canManageMembers: boolean;
  canEditOrg: boolean;
  canAccessRepos: string[]; // scoped repo paths
  canEscalate: boolean;
  canViewBrain: boolean;
  canSyncBrain: boolean;
}

// ---------------------------------------------------------------------------
// Role templates
// ---------------------------------------------------------------------------

export const DEFAULT_ROLE_PERMISSIONS: Record<OrgRole, MemberPermissions> = {
  owner: {
    canCreateTasks: true,
    canDelegateTasks: true,
    canManageMembers: true,
    canEditOrg: true,
    canAccessRepos: ["*"],
    canEscalate: true,
    canViewBrain: true,
    canSyncBrain: true,
  },
  operator: {
    canCreateTasks: true,
    canDelegateTasks: true,
    canManageMembers: true,
    canEditOrg: false,
    canAccessRepos: ["*"],
    canEscalate: true,
    canViewBrain: true,
    canSyncBrain: true,
  },
  coordinator: {
    canCreateTasks: true,
    canDelegateTasks: true,
    canManageMembers: false,
    canEditOrg: false,
    canAccessRepos: [],
    canEscalate: true,
    canViewBrain: true,
    canSyncBrain: true,
  },
  worker: {
    canCreateTasks: false,
    canDelegateTasks: false,
    canManageMembers: false,
    canEditOrg: false,
    canAccessRepos: [],
    canEscalate: true,
    canViewBrain: true,
    canSyncBrain: false,
  },
  observer: {
    canCreateTasks: false,
    canDelegateTasks: false,
    canManageMembers: false,
    canEditOrg: false,
    canAccessRepos: [],
    canEscalate: false,
    canViewBrain: true,
    canSyncBrain: false,
  },
};

// ---------------------------------------------------------------------------
// Specialization roles (self-organizing)
// ---------------------------------------------------------------------------

export interface SpecializationProfile {
  id: string;
  name: string;
  description: string;
  requiredCapabilities: string[];
  autoAssign: boolean; // can agents self-assign?
}

export const BUILT_IN_SPECIALIZATIONS: SpecializationProfile[] = [
  {
    id: "security",
    name: "Security Guardian",
    description: "Monitors for vulnerabilities, audits code changes, manages access controls",
    requiredCapabilities: ["code-review", "security-scanning", "audit-logging"],
    autoAssign: true,
  },
  {
    id: "infrastructure",
    name: "Infrastructure Engineer",
    description: "Manages deployments, CI/CD, VM provisioning, networking",
    requiredCapabilities: ["shell-access", "docker", "networking"],
    autoAssign: true,
  },
  {
    id: "feature-dev",
    name: "Feature Developer",
    description: "Implements new features, writes tests, handles code reviews",
    requiredCapabilities: ["code-writing", "testing", "git"],
    autoAssign: true,
  },
  {
    id: "qa",
    name: "Quality Assurance",
    description: "Runs test suites, validates feature completeness, regression testing",
    requiredCapabilities: ["testing", "browser-automation", "reporting"],
    autoAssign: true,
  },
  {
    id: "ops",
    name: "Operations",
    description: "Monitors health, manages backups, handles incident response",
    requiredCapabilities: ["monitoring", "alerting", "shell-access"],
    autoAssign: true,
  },
  {
    id: "research",
    name: "Research & Analysis",
    description: "Deep research, architecture planning, documentation",
    requiredCapabilities: ["web-search", "analysis", "documentation"],
    autoAssign: true,
  },
];

// ---------------------------------------------------------------------------
// Hierarchy visualization
// ---------------------------------------------------------------------------

export interface OrgHierarchyNode {
  memberId: string;
  displayName: string;
  kind: MemberKind;
  role: OrgRole;
  specializations: string[];
  status: MemberStatus;
  children: OrgHierarchyNode[];
}
