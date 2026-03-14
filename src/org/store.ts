/**
 * ANIMA 6 Organization Store
 *
 * Persists organization state to ~/.anima/org/
 * Supports CRUD operations for orgs, members, and roles.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  type NoxOrganization,
  type OrgMember,
  type OrgSettings,
  type OrgRole,
  type MemberKind,
  type MemberStatus,
  type OrgHierarchyNode,
  DEFAULT_ROLE_PERMISSIONS,
} from "./types.js";

const log = createSubsystemLogger("org-store");

// ---------------------------------------------------------------------------
// Storage paths
// ---------------------------------------------------------------------------

function resolveOrgDir(): string {
  return path.join(resolveStateDir(), "org");
}

function resolveOrgFile(orgId: string): string {
  return path.join(resolveOrgDir(), `${orgId}.json`);
}

// ---------------------------------------------------------------------------
// Storage format
// ---------------------------------------------------------------------------

interface StoredOrg {
  version: 1;
  org: NoxOrganization;
  members: OrgMember[];
}

// ---------------------------------------------------------------------------
// Read / Write helpers
// ---------------------------------------------------------------------------

function readOrgFile(orgId: string): StoredOrg | null {
  const filePath = resolveOrgFile(orgId);
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as StoredOrg;
    if (parsed?.version !== 1) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeOrgFile(orgId: string, data: StoredOrg): void {
  const filePath = resolveOrgFile(orgId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, {
    mode: 0o600,
  });
}

// ---------------------------------------------------------------------------
// Organization CRUD
// ---------------------------------------------------------------------------

export function createOrganization(
  name: string,
  description: string,
  ownerId: string,
  ownerName: string,
  ownerKind: MemberKind,
  settings?: Partial<OrgSettings>,
): NoxOrganization {
  const orgId = crypto.randomUUID();
  const now = Date.now();

  const org: NoxOrganization = {
    id: orgId,
    name,
    description,
    createdAt: now,
    updatedAt: now,
    ownerId,
    settings: {
      maxAgents: 50,
      maxHumans: 20,
      autoSpecialization: true,
      securityLevel: "standard",
      syncIntervalMs: 60_000,
      backupIntervalMs: 5 * 60 * 60 * 1000, // 5 hours
      peerPort: 9876,
      ...settings,
    },
  };

  const ownerMember: OrgMember = {
    id: crypto.randomUUID(),
    kind: ownerKind,
    displayName: ownerName,
    role: "owner",
    description: "Organization owner",
    specializations: [],
    joinedAt: now,
    lastActiveAt: now,
    status: "active",
    permissions: DEFAULT_ROLE_PERMISSIONS.owner,
  };

  writeOrgFile(orgId, { version: 1, org, members: [ownerMember] });
  log.info(`created organization: ${name} (${orgId})`);
  return org;
}

export function getOrganization(orgId: string): NoxOrganization | null {
  const data = readOrgFile(orgId);
  return data?.org ?? null;
}

export function updateOrganization(
  orgId: string,
  updates: Partial<Pick<NoxOrganization, "name" | "description" | "settings">>,
): NoxOrganization | null {
  const data = readOrgFile(orgId);
  if (!data) {
    return null;
  }

  if (updates.name) {
    data.org.name = updates.name;
  }
  if (updates.description) {
    data.org.description = updates.description;
  }
  if (updates.settings) {
    data.org.settings = { ...data.org.settings, ...updates.settings };
  }
  data.org.updatedAt = Date.now();

  writeOrgFile(orgId, data);
  log.info(`updated organization: ${orgId}`);
  return data.org;
}

export function deleteOrganization(orgId: string): boolean {
  const filePath = resolveOrgFile(orgId);
  try {
    fs.unlinkSync(filePath);
    log.info(`deleted organization: ${orgId}`);
    return true;
  } catch {
    return false;
  }
}

export function listOrganizations(): NoxOrganization[] {
  const dir = resolveOrgDir();
  try {
    if (!fs.existsSync(dir)) {
      return [];
    }
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const data = readOrgFile(f.replace(".json", ""));
        return data?.org;
      })
      .filter((o): o is NoxOrganization => o != null);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Member CRUD
// ---------------------------------------------------------------------------

export function addMember(
  orgId: string,
  member: Omit<OrgMember, "id" | "joinedAt" | "lastActiveAt" | "permissions">,
): OrgMember | null {
  const data = readOrgFile(orgId);
  if (!data) {
    return null;
  }

  const newMember: OrgMember = {
    ...member,
    id: crypto.randomUUID(),
    joinedAt: Date.now(),
    lastActiveAt: Date.now(),
    permissions: DEFAULT_ROLE_PERMISSIONS[member.role],
  };

  data.members.push(newMember);
  data.org.updatedAt = Date.now();
  writeOrgFile(orgId, data);
  log.info(`added member ${newMember.displayName} to org ${orgId}`);
  return newMember;
}

export function removeMember(orgId: string, memberId: string): boolean {
  const data = readOrgFile(orgId);
  if (!data) {
    return false;
  }

  const idx = data.members.findIndex((m) => m.id === memberId);
  if (idx === -1) {
    return false;
  }

  data.members.splice(idx, 1);
  data.org.updatedAt = Date.now();
  writeOrgFile(orgId, data);
  log.info(`removed member ${memberId} from org ${orgId}`);
  return true;
}

export function updateMember(
  orgId: string,
  memberId: string,
  updates: Partial<
    Pick<
      OrgMember,
      | "displayName"
      | "role"
      | "description"
      | "specializations"
      | "status"
      | "reportsTo"
      | "permissions"
    >
  >,
): OrgMember | null {
  const data = readOrgFile(orgId);
  if (!data) {
    return null;
  }

  const member = data.members.find((m) => m.id === memberId);
  if (!member) {
    return null;
  }

  if (updates.displayName) {
    member.displayName = updates.displayName;
  }
  if (updates.role) {
    member.role = updates.role;
    member.permissions = {
      ...DEFAULT_ROLE_PERMISSIONS[updates.role],
      ...updates.permissions,
    };
  }
  if (updates.description !== undefined) {
    member.description = updates.description;
  }
  if (updates.specializations) {
    member.specializations = updates.specializations;
  }
  if (updates.status) {
    member.status = updates.status;
  }
  if (updates.reportsTo !== undefined) {
    member.reportsTo = updates.reportsTo;
  }
  if (updates.permissions && !updates.role) {
    member.permissions = { ...member.permissions, ...updates.permissions };
  }

  member.lastActiveAt = Date.now();
  data.org.updatedAt = Date.now();
  writeOrgFile(orgId, data);
  return member;
}

export function getMembers(orgId: string): OrgMember[] {
  const data = readOrgFile(orgId);
  return data?.members ?? [];
}

export function getMember(orgId: string, memberId: string): OrgMember | null {
  const data = readOrgFile(orgId);
  return data?.members.find((m) => m.id === memberId) ?? null;
}

// ---------------------------------------------------------------------------
// Hierarchy builder
// ---------------------------------------------------------------------------

export function buildHierarchy(orgId: string): OrgHierarchyNode[] {
  const members = getMembers(orgId);
  if (members.length === 0) {
    return [];
  }

  const memberMap = new Map(members.map((m) => [m.id, m]));

  function buildNode(member: OrgMember): OrgHierarchyNode {
    const children = members.filter((m) => m.reportsTo === member.id).map((m) => buildNode(m));

    return {
      memberId: member.id,
      displayName: member.displayName,
      kind: member.kind,
      role: member.role,
      specializations: member.specializations,
      status: member.status,
      children,
    };
  }

  // Find root nodes (no reportsTo, or reportsTo not in org)
  const roots = members.filter((m) => !m.reportsTo || !memberMap.has(m.reportsTo));

  return roots.map((r) => buildNode(r));
}

// ---------------------------------------------------------------------------
// ASCII hierarchy visualization
// ---------------------------------------------------------------------------

export function visualizeHierarchy(orgId: string): string {
  const org = getOrganization(orgId);
  if (!org) {
    return "Organization not found";
  }

  const roots = buildHierarchy(orgId);
  if (roots.length === 0) {
    return "No members in organization";
  }

  const lines: string[] = [];
  lines.push(`╔══ ${org.name} ══╗`);
  lines.push(`║  ${org.description}`);
  lines.push(`╚${"═".repeat(org.name.length + 6)}╝`);
  lines.push("");

  function renderNode(node: OrgHierarchyNode, prefix: string, isLast: boolean): void {
    const connector = isLast ? "└── " : "├── ";
    const icon = node.kind === "human" ? "👤" : "🤖";
    const statusIcon = statusEmoji(node.status);
    const specs = node.specializations.length > 0 ? ` [${node.specializations.join(", ")}]` : "";

    lines.push(
      `${prefix}${connector}${icon} ${node.displayName} (${node.role})${specs} ${statusIcon}`,
    );

    const childPrefix = prefix + (isLast ? "    " : "│   ");
    node.children.forEach((child, i) => {
      renderNode(child, childPrefix, i === node.children.length - 1);
    });
  }

  roots.forEach((root, i) => {
    renderNode(root, "", i === roots.length - 1);
  });

  return lines.join("\n");
}

function statusEmoji(status: MemberStatus): string {
  switch (status) {
    case "active":
      return "●";
    case "idle":
      return "○";
    case "busy":
      return "◉";
    case "offline":
      return "◌";
    case "suspended":
      return "⊘";
  }
}
