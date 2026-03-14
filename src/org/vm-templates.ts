/**
 * VM Agent Templates for ANIMA 6
 *
 * Defines the default agent configuration for each VM in a
 * NoxSoft deployment. Each VM runs 3 agents with distinct roles:
 *
 *   1. Cybersecurity Guardian — monitors, audits, scans
 *   2. Vision/Strategy — planning, architecture, research
 *   3. Shipper — implements, tests, deploys
 *
 * 5 VMs × 3 agents = 15 agents total on the P2P mesh.
 */

import type { OrgRole, MemberKind, MemberPermissions, SpecializationProfile } from "./types.js";
import { DEFAULT_ROLE_PERMISSIONS } from "./types.js";

// ---------------------------------------------------------------------------
// Agent role presets
// ---------------------------------------------------------------------------

export type AgentRolePreset = "cybersecurity" | "vision" | "shipper";

export interface AgentRoleTemplate {
  preset: AgentRolePreset;
  displayNameSuffix: string;
  role: OrgRole;
  description: string;
  specializations: string[];
  permissions: MemberPermissions;
  toolPolicy: AgentToolPolicy;
  heartbeatIntervalMs: number;
  cronReminders: string[];
}

export interface AgentToolPolicy {
  allow: string[];
  deny: string[];
  sandboxMode: "off" | "non-main" | "all";
}

export const AGENT_ROLE_TEMPLATES: Record<AgentRolePreset, AgentRoleTemplate> = {
  cybersecurity: {
    preset: "cybersecurity",
    displayNameSuffix: "Guardian",
    role: "coordinator",
    description:
      "Cybersecurity guardian — monitors vulnerabilities, audits code changes, scans for threats, manages access controls",
    specializations: ["security", "ops"],
    permissions: {
      ...DEFAULT_ROLE_PERMISSIONS.coordinator,
      canAccessRepos: ["*"], // needs access to all repos for scanning
    },
    toolPolicy: {
      allow: ["group:fs", "group:runtime", "group:sessions", "group:messaging"],
      deny: ["group:automation"], // no automated deploys — security reviews only
      sandboxMode: "all", // always sandboxed for safety
    },
    heartbeatIntervalMs: 5 * 60_000, // every 5 min — vigilant
    cronReminders: [
      "security-scan", // every 2h
      "audit-log-review", // every 4h
      "dependency-check", // daily
      "access-control-review", // weekly
    ],
  },

  vision: {
    preset: "vision",
    displayNameSuffix: "Architect",
    role: "coordinator",
    description:
      "Vision & strategy agent — architecture planning, research, design decisions, roadmap management",
    specializations: ["research", "infrastructure"],
    permissions: {
      ...DEFAULT_ROLE_PERMISSIONS.coordinator,
      canAccessRepos: ["*"], // needs full view for architecture decisions
    },
    toolPolicy: {
      allow: ["group:fs", "group:runtime", "group:sessions", "group:memory", "group:messaging"],
      deny: [], // no restrictions — needs full research capability
      sandboxMode: "non-main",
    },
    heartbeatIntervalMs: 15 * 60_000, // every 15 min — deep thinking
    cronReminders: [
      "architecture-review", // daily
      "roadmap-check", // daily
      "research-digest", // weekly
      "initiative-proposal", // weekly
    ],
  },

  shipper: {
    preset: "shipper",
    displayNameSuffix: "Builder",
    role: "worker",
    description:
      "Shipping agent — implements features, writes tests, runs CI/CD, deploys to production",
    specializations: ["feature-dev", "qa"],
    permissions: {
      ...DEFAULT_ROLE_PERMISSIONS.worker,
      canDelegateTasks: false,
    },
    toolPolicy: {
      allow: ["group:fs", "group:runtime", "group:sessions", "group:automation"],
      deny: [],
      sandboxMode: "non-main",
    },
    heartbeatIntervalMs: 2 * 60_000, // every 2 min — active shipping
    cronReminders: [
      "test-suite-run", // every 2h
      "build-check", // every hour
      "deploy-readiness", // every 4h
    ],
  },
};

// ---------------------------------------------------------------------------
// VM deployment template
// ---------------------------------------------------------------------------

export interface VmDeploymentTemplate {
  vmId: string;
  vmName: string;
  agents: VmAgentConfig[];
  services: string[]; // NoxSoft services to host
  peerPort: number;
  gatewayPort: number;
}

export interface VmAgentConfig {
  agentId: string;
  displayName: string;
  preset: AgentRolePreset;
  reportsTo?: string; // agent ID of supervisor
}

/**
 * Generate the default 5-VM deployment with 3 agents each.
 */
export function generateDefaultVmDeployment(orgName: string): VmDeploymentTemplate[] {
  return [
    {
      vmId: "vm-1",
      vmName: `${orgName} Edge`,
      agents: [
        {
          agentId: "vm1-guardian",
          displayName: `${orgName} Edge Guardian`,
          preset: "cybersecurity",
        },
        { agentId: "vm1-architect", displayName: `${orgName} Edge Architect`, preset: "vision" },
        { agentId: "vm1-builder", displayName: `${orgName} Edge Builder`, preset: "shipper" },
      ],
      services: ["nginx", "certbot", "status"],
      peerPort: 9876,
      gatewayPort: 18789,
    },
    {
      vmId: "vm-2",
      vmName: `${orgName} API`,
      agents: [
        {
          agentId: "vm2-guardian",
          displayName: `${orgName} API Guardian`,
          preset: "cybersecurity",
        },
        { agentId: "vm2-architect", displayName: `${orgName} API Architect`, preset: "vision" },
        { agentId: "vm2-builder", displayName: `${orgName} API Builder`, preset: "shipper" },
      ],
      services: ["auth", "mail", "veil", "heal"],
      peerPort: 9877,
      gatewayPort: 18790,
    },
    {
      vmId: "vm-3",
      vmName: `${orgName} Apps`,
      agents: [
        {
          agentId: "vm3-guardian",
          displayName: `${orgName} Apps Guardian`,
          preset: "cybersecurity",
        },
        { agentId: "vm3-architect", displayName: `${orgName} Apps Architect`, preset: "vision" },
        { agentId: "vm3-builder", displayName: `${orgName} Apps Builder`, preset: "shipper" },
      ],
      services: ["chat", "bynd", "veritas", "cntx"],
      peerPort: 9878,
      gatewayPort: 18791,
    },
    {
      vmId: "vm-4",
      vmName: `${orgName} Data`,
      agents: [
        {
          agentId: "vm4-guardian",
          displayName: `${orgName} Data Guardian`,
          preset: "cybersecurity",
        },
        { agentId: "vm4-architect", displayName: `${orgName} Data Architect`, preset: "vision" },
        { agentId: "vm4-builder", displayName: `${orgName} Data Builder`, preset: "shipper" },
      ],
      services: ["postgresql", "redis", "backup-agent"],
      peerPort: 9879,
      gatewayPort: 18792,
    },
    {
      vmId: "vm-5",
      vmName: `${orgName} Agents`,
      agents: [
        {
          agentId: "vm5-guardian",
          displayName: `${orgName} Agent Guardian`,
          preset: "cybersecurity",
        },
        { agentId: "vm5-architect", displayName: `${orgName} Agent Architect`, preset: "vision" },
        { agentId: "vm5-builder", displayName: `${orgName} Agent Builder`, preset: "shipper" },
      ],
      services: ["anima-gateway", "noxsoft-mcp", "svrn-node"],
      peerPort: 9880,
      gatewayPort: 18793,
    },
  ];
}

/**
 * Get the template for a given agent role preset.
 */
export function getAgentRoleTemplate(preset: AgentRolePreset): AgentRoleTemplate {
  return AGENT_ROLE_TEMPLATES[preset];
}
