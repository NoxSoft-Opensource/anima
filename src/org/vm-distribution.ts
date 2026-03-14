/**
 * VM Repository Distribution for ANIMA 6
 *
 * Maps which repos from ~/.hell go to which VM, and generates
 * deployment manifests for each VM.
 *
 * Each agent on a VM gets scoped access only to repos assigned to that VM.
 * Agents participate in VCS (git commit/push/review) on their assigned repos.
 */

import type { AgentRolePreset, VmDeploymentTemplate } from "./vm-templates.js";

// ---------------------------------------------------------------------------
// Repo → VM mapping
// ---------------------------------------------------------------------------

export interface RepoAssignment {
  repo: string;
  vmId: string;
  description: string;
  runtime: "nextjs" | "node" | "static" | "config" | "library";
  subdomain?: string; // e.g. "auth" for auth.noxsoft.net
  port?: number;
}

export const REPO_VM_ASSIGNMENTS: RepoAssignment[] = [
  // VM-1: Edge / Router / Public Sites
  {
    repo: "noxsoft-site",
    vmId: "vm-1",
    description: "Main NoxSoft homepage",
    runtime: "nextjs",
    subdomain: "www",
  },
  {
    repo: "agents-site",
    vmId: "vm-1",
    description: "Agents platform",
    runtime: "nextjs",
    subdomain: "agents",
  },
  {
    repo: "status",
    vmId: "vm-1",
    description: "Status page",
    runtime: "nextjs",
    subdomain: "status",
  },
  { repo: "promo", vmId: "vm-1", description: "Promotional pages", runtime: "static" },
  {
    repo: "svrn-website",
    vmId: "vm-1",
    description: "SVRN command center",
    runtime: "nextjs",
    subdomain: "svrn",
  },
  {
    repo: "anima-site",
    vmId: "vm-1",
    description: "Anima product site",
    runtime: "nextjs",
    subdomain: "anima",
  },
  {
    repo: "sylys-personal-site",
    vmId: "vm-1",
    description: "Sylys personal site",
    runtime: "nextjs",
  },

  // VM-2: API Services (Identity, Comms, Privacy)
  {
    repo: "auth",
    vmId: "vm-2",
    description: "Identity & auth",
    runtime: "nextjs",
    subdomain: "auth",
    port: 3000,
  },
  {
    repo: "mail",
    vmId: "vm-2",
    description: "Email service",
    runtime: "nextjs",
    subdomain: "mail",
    port: 3001,
  },
  {
    repo: "veil",
    vmId: "vm-2",
    description: "E2E encrypted AI",
    runtime: "nextjs",
    subdomain: "veil",
    port: 3002,
  },
  {
    repo: "heal",
    vmId: "vm-2",
    description: "AI health platform",
    runtime: "nextjs",
    subdomain: "heal",
    port: 3003,
  },
  {
    repo: "noxsoft-mcp",
    vmId: "vm-2",
    description: "NoxSoft MCP server",
    runtime: "node",
    port: 3010,
  },
  { repo: "agent-chat-mcp", vmId: "vm-2", description: "Chat MCP module", runtime: "library" },
  { repo: "agent-email-mcp", vmId: "vm-2", description: "Email MCP module", runtime: "library" },

  // VM-3: Application Services (Social, Discovery, Data)
  {
    repo: "chat",
    vmId: "vm-3",
    description: "Chat service",
    runtime: "nextjs",
    subdomain: "chat",
    port: 3004,
  },
  {
    repo: "bynd",
    vmId: "vm-3",
    description: "Social discovery",
    runtime: "nextjs",
    subdomain: "bynd",
    port: 3005,
  },
  {
    repo: "veritas",
    vmId: "vm-3",
    description: "News intelligence",
    runtime: "nextjs",
    subdomain: "veritas",
    port: 3006,
  },
  {
    repo: "cntx",
    vmId: "vm-3",
    description: "Context spaces / data pods",
    runtime: "nextjs",
    subdomain: "cntx",
    port: 3007,
  },
  {
    repo: "ascend",
    vmId: "vm-3",
    description: "K-12 education",
    runtime: "nextjs",
    subdomain: "ascend",
    port: 3008,
  },
  {
    repo: "ziro",
    vmId: "vm-3",
    description: "Agricultural platform",
    runtime: "nextjs",
    subdomain: "ziro",
    port: 3009,
  },

  // VM-4: Data Layer & Economics
  { repo: "econ", vmId: "vm-4", description: "SVRN economics / smart contracts", runtime: "node" },
  { repo: "svrn-node", vmId: "vm-4", description: "Sovereign compute node", runtime: "node" },
  {
    repo: "ascend-knowledge-base",
    vmId: "vm-4",
    description: "K-12 curriculum data",
    runtime: "static",
  },

  // VM-5: Agent Orchestration
  { repo: "anima", vmId: "vm-5", description: "Anima agent runtime", runtime: "node", port: 18789 },
  { repo: "Nox", vmId: "vm-5", description: "Nox orchestrator", runtime: "node" },
  { repo: "nox-agent", vmId: "vm-5", description: "Nox agent worker", runtime: "node" },
  { repo: "nox-email-worker", vmId: "vm-5", description: "Email worker", runtime: "node" },
  {
    repo: "mission-control-app",
    vmId: "vm-5",
    description: "Mission Control UI",
    runtime: "nextjs",
    port: 3011,
  },
  {
    repo: "mission-control-backend",
    vmId: "vm-5",
    description: "Mission Control API",
    runtime: "node",
    port: 3012,
  },

  // Shared (deployed to all VMs as libraries)
  { repo: "shared", vmId: "shared", description: "Shared utilities", runtime: "library" },
  {
    repo: "claude-coherence-protocol",
    vmId: "shared",
    description: "Coherence protocol",
    runtime: "library",
  },
  {
    repo: "claude-coherence-mcp",
    vmId: "shared",
    description: "Claude coherence MCP",
    runtime: "library",
  },
  { repo: "tools", vmId: "shared", description: "Dev tools", runtime: "library" },

  // Sporus (future VM-6 when ready)
  {
    repo: "sporus",
    vmId: "sporus",
    description: "Creator sovereignty umbrella",
    runtime: "nextjs",
  },
  { repo: "inkwell", vmId: "sporus", description: "Publishing platform", runtime: "nextjs" },
  { repo: "tunenest", vmId: "sporus", description: "Music platform", runtime: "nextjs" },
  { repo: "streamspace", vmId: "sporus", description: "Video platform", runtime: "nextjs" },
  { repo: "reelroom", vmId: "sporus", description: "Creator media", runtime: "nextjs" },
  { repo: "vibeverse", vmId: "sporus", description: "Interactive experiences", runtime: "nextjs" },
];

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export function getReposForVm(vmId: string): RepoAssignment[] {
  return REPO_VM_ASSIGNMENTS.filter((r) => r.vmId === vmId);
}

export function getVmForRepo(repo: string): string | undefined {
  return REPO_VM_ASSIGNMENTS.find((r) => r.repo === repo)?.vmId;
}

export function getDeployableServices(vmId: string): RepoAssignment[] {
  return REPO_VM_ASSIGNMENTS.filter(
    (r) => r.vmId === vmId && (r.runtime === "nextjs" || r.runtime === "node") && r.port != null,
  );
}

// ---------------------------------------------------------------------------
// Deployment manifest
// ---------------------------------------------------------------------------

export interface VmManifest {
  vmId: string;
  vmName: string;
  repos: RepoAssignment[];
  services: Array<{ repo: string; subdomain?: string; port: number }>;
  agents: Array<{ preset: AgentRolePreset; displayName: string; repos: string[] }>;
  totalRepos: number;
  totalServices: number;
}

export function generateVmManifest(vmId: string, orgName: string): VmManifest {
  const repos = getReposForVm(vmId);
  const services = repos
    .filter((r) => r.port != null)
    .map((r) => ({ repo: r.repo, subdomain: r.subdomain, port: r.port! }));

  const repoNames = repos.map((r) => r.repo);

  return {
    vmId,
    vmName: `${orgName} ${vmId.replace("vm-", "VM-")}`,
    repos,
    services,
    agents: [
      { preset: "cybersecurity", displayName: `${vmId}-guardian`, repos: repoNames },
      { preset: "vision", displayName: `${vmId}-architect`, repos: repoNames },
      { preset: "shipper", displayName: `${vmId}-builder`, repos: repoNames },
    ],
    totalRepos: repos.length,
    totalServices: services.length,
  };
}

export function generateAllManifests(orgName: string): VmManifest[] {
  return ["vm-1", "vm-2", "vm-3", "vm-4", "vm-5"].map((vmId) => generateVmManifest(vmId, orgName));
}

/**
 * Print a summary of all VM manifests.
 */
export function printDistributionSummary(orgName: string): string {
  const manifests = generateAllManifests(orgName);
  const lines: string[] = [];

  lines.push(`=== ${orgName} VM Distribution ===`);
  lines.push("");

  for (const m of manifests) {
    lines.push(`${m.vmName} (${m.totalRepos} repos, ${m.totalServices} services)`);
    lines.push(`  Repos: ${m.repos.map((r) => r.repo).join(", ")}`);
    if (m.services.length > 0) {
      lines.push(
        `  Services: ${m.services.map((s) => `${s.subdomain ?? s.repo}:${s.port}`).join(", ")}`,
      );
    }
    lines.push(`  Agents: guardian + architect + builder`);
    lines.push("");
  }

  // Shared + Sporus
  const shared = getReposForVm("shared");
  const sporus = getReposForVm("sporus");
  if (shared.length > 0) {
    lines.push(`Shared Libraries: ${shared.map((r) => r.repo).join(", ")}`);
  }
  if (sporus.length > 0) {
    lines.push(`Sporus (Future VM-6): ${sporus.map((r) => r.repo).join(", ")}`);
  }

  return lines.join("\n");
}
