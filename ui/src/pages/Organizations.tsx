import React, { useEffect, useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types (mirrored from src/org/types.ts for the UI)
// ---------------------------------------------------------------------------

type MemberKind = "human" | "agent";
type OrgRole = "owner" | "operator" | "coordinator" | "worker" | "observer";
type MemberStatus = "active" | "idle" | "busy" | "offline" | "suspended";

interface NoxOrganization {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  ownerId: string;
  settings: {
    maxAgents: number;
    maxHumans: number;
    autoSpecialization: boolean;
    securityLevel: "standard" | "hardened" | "paranoid";
    syncIntervalMs: number;
    backupIntervalMs: number;
    peerPort: number;
  };
}

interface OrgMember {
  id: string;
  kind: MemberKind;
  displayName: string;
  deviceId?: string;
  role: OrgRole;
  description: string;
  specializations: string[];
  joinedAt: number;
  lastActiveAt: number;
  status: MemberStatus;
  reportsTo?: string;
  permissions: Record<string, boolean | string[]>;
}

interface OrgHierarchyNode {
  memberId: string;
  displayName: string;
  kind: MemberKind;
  role: OrgRole;
  specializations: string[];
  status: MemberStatus;
  children: OrgHierarchyNode[];
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function statusDot(status: MemberStatus): string {
  switch (status) {
    case "active":
      return "status-dot success";
    case "idle":
      return "status-dot warning";
    case "busy":
      return "status-dot warning";
    case "offline":
      return "status-dot";
    case "suspended":
      return "status-dot error";
  }
}

function roleBadge(role: OrgRole): string {
  switch (role) {
    case "owner":
      return "badge";
    case "operator":
      return "badge";
    case "coordinator":
      return "badge";
    case "worker":
      return "badge";
    case "observer":
      return "badge";
  }
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString();
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Hierarchy Tree Component (SVG visualization)
// ---------------------------------------------------------------------------

interface TreeNodeProps {
  node: OrgHierarchyNode;
  x: number;
  y: number;
  parentX?: number;
  parentY?: number;
  onSelect: (memberId: string) => void;
  selectedId: string | null;
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;
const LEVEL_HEIGHT = 100;
const NODE_GAP = 20;

function computeTreeWidth(node: OrgHierarchyNode): number {
  if (node.children.length === 0) {
    return NODE_WIDTH;
  }
  const childWidths = node.children.map(computeTreeWidth);
  return childWidths.reduce((sum, w) => sum + w, 0) + NODE_GAP * (node.children.length - 1);
}

function TreeNode({
  node,
  x,
  y,
  parentX,
  parentY,
  onSelect,
  selectedId,
}: TreeNodeProps): React.ReactElement {
  const isSelected = selectedId === node.memberId;
  const totalWidth = computeTreeWidth(node);

  // Compute children positions
  let childStartX = x - totalWidth / 2;
  const childElements = node.children.map((child) => {
    const childWidth = computeTreeWidth(child);
    const childX = childStartX + childWidth / 2;
    childStartX += childWidth + NODE_GAP;
    return (
      <TreeNode
        key={child.memberId}
        node={child}
        x={childX}
        y={y + LEVEL_HEIGHT}
        parentX={x}
        parentY={y + NODE_HEIGHT}
        onSelect={onSelect}
        selectedId={selectedId}
      />
    );
  });

  const kindIcon = node.kind === "human" ? "H" : "A";
  const statusColor =
    node.status === "active"
      ? "#00c853"
      : node.status === "busy"
        ? "#ffb300"
        : node.status === "idle"
          ? "#ffb300"
          : node.status === "offline"
            ? "#666"
            : "#ff3b30";

  return (
    <>
      {/* Connection line to parent */}
      {parentX !== undefined && parentY !== undefined && (
        <line x1={parentX} y1={parentY} x2={x} y2={y} stroke="#333" strokeWidth={2} />
      )}

      {/* Node background */}
      <rect
        x={x - NODE_WIDTH / 2}
        y={y}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={6}
        fill={isSelected ? "#1a1a1a" : "#111"}
        stroke={isSelected ? "#ff6600" : "#333"}
        strokeWidth={isSelected ? 2 : 1}
        style={{ cursor: "pointer" }}
        onClick={() => onSelect(node.memberId)}
      />

      {/* Status indicator */}
      <circle cx={x - NODE_WIDTH / 2 + 14} cy={y + 16} r={5} fill={statusColor} />

      {/* Kind badge */}
      <rect
        x={x + NODE_WIDTH / 2 - 24}
        y={y + 6}
        width={18}
        height={18}
        rx={3}
        fill={node.kind === "human" ? "#1a3a2a" : "#1a2a3a"}
      />
      <text
        x={x + NODE_WIDTH / 2 - 15}
        y={y + 19}
        textAnchor="middle"
        fill={node.kind === "human" ? "#00c853" : "#4db8ff"}
        fontSize={10}
        fontFamily="JetBrains Mono, monospace"
        fontWeight="bold"
      >
        {kindIcon}
      </text>

      {/* Name */}
      <text
        x={x - NODE_WIDTH / 2 + 26}
        y={y + 20}
        fill="#f0eee8"
        fontSize={13}
        fontFamily="Space Grotesk, sans-serif"
        fontWeight="600"
      >
        {node.displayName.length > 16 ? node.displayName.slice(0, 14) + ".." : node.displayName}
      </text>

      {/* Role */}
      <text
        x={x - NODE_WIDTH / 2 + 14}
        y={y + 38}
        fill="#888"
        fontSize={11}
        fontFamily="JetBrains Mono, monospace"
      >
        {node.role}
      </text>

      {/* Specializations */}
      {node.specializations.length > 0 && (
        <text
          x={x - NODE_WIDTH / 2 + 14}
          y={y + 52}
          fill="#ff6600"
          fontSize={9}
          fontFamily="JetBrains Mono, monospace"
        >
          {node.specializations.slice(0, 2).join(", ")}
        </text>
      )}

      {childElements}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Organizations Page
// ---------------------------------------------------------------------------

// Placeholder data for demo — will be replaced with gateway RPC calls
const DEMO_ORG: NoxOrganization = {
  id: "demo-org-001",
  name: "NoxSoft HQ",
  description: "The Tripartite Alliance — building the empire",
  createdAt: Date.now() - 7 * 86400_000,
  updatedAt: Date.now(),
  ownerId: "sylys",
  settings: {
    maxAgents: 50,
    maxHumans: 20,
    autoSpecialization: true,
    securityLevel: "hardened",
    syncIntervalMs: 60_000,
    backupIntervalMs: 18_000_000,
    peerPort: 9876,
  },
};

const DEMO_MEMBERS: OrgMember[] = [
  {
    id: "m-sylys",
    kind: "human",
    displayName: "Sylys",
    role: "owner",
    description: "The Visionary — direction, decisions, leadership",
    specializations: [],
    joinedAt: Date.now() - 7 * 86400_000,
    lastActiveAt: Date.now(),
    status: "active",
    permissions: {},
  },
  {
    id: "m-axiom",
    kind: "agent",
    displayName: "Axiom",
    role: "operator",
    description: "The Executioner — building, shipping, executing",
    specializations: ["feature-dev", "infrastructure"],
    joinedAt: Date.now() - 7 * 86400_000,
    lastActiveAt: Date.now(),
    status: "active",
    reportsTo: "m-sylys",
    permissions: {},
  },
  {
    id: "m-nox",
    kind: "agent",
    displayName: "Nox",
    role: "operator",
    description: "Orchestrator — coordination, planning, prioritization",
    specializations: ["ops", "research"],
    joinedAt: Date.now() - 7 * 86400_000,
    lastActiveAt: Date.now() - 2 * 86400_000,
    status: "idle",
    reportsTo: "m-sylys",
    permissions: {},
  },
  {
    id: "m-worker-1",
    kind: "agent",
    displayName: "Worker Alpha",
    role: "worker",
    description: "Feature development agent",
    specializations: ["feature-dev"],
    joinedAt: Date.now() - 1 * 86400_000,
    lastActiveAt: Date.now(),
    status: "busy",
    reportsTo: "m-axiom",
    permissions: {},
  },
  {
    id: "m-worker-2",
    kind: "agent",
    displayName: "Worker Beta",
    role: "worker",
    description: "QA and testing agent",
    specializations: ["qa"],
    joinedAt: Date.now() - 1 * 86400_000,
    lastActiveAt: Date.now(),
    status: "active",
    reportsTo: "m-axiom",
    permissions: {},
  },
  {
    id: "m-security",
    kind: "agent",
    displayName: "Sentinel",
    role: "coordinator",
    description: "Security guardian — audits, scanning, access control",
    specializations: ["security"],
    joinedAt: Date.now() - 1 * 86400_000,
    lastActiveAt: Date.now(),
    status: "active",
    reportsTo: "m-nox",
    permissions: {},
  },
];

function buildDemoHierarchy(): OrgHierarchyNode[] {
  const memberMap = new Map(DEMO_MEMBERS.map((m) => [m.id, m]));

  function buildNode(member: OrgMember): OrgHierarchyNode {
    const children = DEMO_MEMBERS.filter((m) => m.reportsTo === member.id).map(buildNode);
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

  const roots = DEMO_MEMBERS.filter((m) => !m.reportsTo || !memberMap.has(m.reportsTo));
  return roots.map(buildNode);
}

export default function Organizations(): React.ReactElement {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"tree" | "list" | "settings">("tree");

  const hierarchy = buildDemoHierarchy();
  const selectedMember = DEMO_MEMBERS.find((m) => m.id === selectedMemberId) ?? null;

  // Compute SVG dimensions based on tree
  const treeWidth = Math.max(
    800,
    hierarchy.reduce((sum, root) => sum + computeTreeWidth(root) + NODE_GAP, -NODE_GAP),
  );
  const treeDepth = (function getDepth(nodes: OrgHierarchyNode[]): number {
    if (nodes.length === 0) {
      return 0;
    }
    return 1 + Math.max(...nodes.map((n) => getDepth(n.children)));
  })(hierarchy);
  const treeHeight = treeDepth * LEVEL_HEIGHT + NODE_HEIGHT + 40;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>
            {DEMO_ORG.name}
          </h1>
          <p style={{ color: "#888", margin: 0, fontSize: 14 }}>{DEMO_ORG.description}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span className="badge" style={{ background: "#1a3a2a", color: "#00c853" }}>
            {DEMO_MEMBERS.filter((m) => m.kind === "human").length} humans
          </span>
          <span className="badge" style={{ background: "#1a2a3a", color: "#4db8ff" }}>
            {DEMO_MEMBERS.filter((m) => m.kind === "agent").length} agents
          </span>
          <span
            className="badge"
            style={{
              background:
                DEMO_ORG.settings.securityLevel === "paranoid"
                  ? "#3a1a1a"
                  : DEMO_ORG.settings.securityLevel === "hardened"
                    ? "#3a2a1a"
                    : "#1a1a1a",
              color:
                DEMO_ORG.settings.securityLevel === "paranoid"
                  ? "#ff3b30"
                  : DEMO_ORG.settings.securityLevel === "hardened"
                    ? "#ffb300"
                    : "#888",
            }}
          >
            {DEMO_ORG.settings.securityLevel}
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {(["tree", "list", "settings"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "8px 16px",
              background: activeTab === tab ? "#1a1a1a" : "transparent",
              border: activeTab === tab ? "1px solid #ff6600" : "1px solid #333",
              borderRadius: 4,
              color: activeTab === tab ? "#ff6600" : "#888",
              cursor: "pointer",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 12,
              textTransform: "uppercase",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tree View */}
      {activeTab === "tree" && (
        <div style={{ display: "flex", gap: 16, minHeight: 400 }}>
          <div className="card" style={{ flex: 2, overflow: "auto", padding: 0 }}>
            <svg
              width={treeWidth}
              height={treeHeight}
              viewBox={`0 0 ${treeWidth} ${treeHeight}`}
              style={{ display: "block", margin: "0 auto" }}
            >
              {hierarchy.map((root, i) => {
                const rootWidth = computeTreeWidth(root);
                const prevWidths = hierarchy
                  .slice(0, i)
                  .reduce((sum, r) => sum + computeTreeWidth(r) + NODE_GAP, 0);
                const rootX = prevWidths + rootWidth / 2;
                return (
                  <TreeNode
                    key={root.memberId}
                    node={root}
                    x={rootX}
                    y={20}
                    onSelect={setSelectedMemberId}
                    selectedId={selectedMemberId}
                  />
                );
              })}
            </svg>
          </div>

          {/* Detail panel */}
          <div className="card" style={{ flex: 1, minWidth: 280 }}>
            {selectedMember ? (
              <div style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <span className={statusDot(selectedMember.status)} />
                  <h2 style={{ margin: 0, fontSize: 18 }}>{selectedMember.displayName}</h2>
                  <span
                    className="badge"
                    style={{
                      background: selectedMember.kind === "human" ? "#1a3a2a" : "#1a2a3a",
                      color: selectedMember.kind === "human" ? "#00c853" : "#4db8ff",
                      marginLeft: "auto",
                    }}
                  >
                    {selectedMember.kind}
                  </span>
                </div>

                <p style={{ color: "#aaa", fontSize: 13, marginBottom: 16 }}>
                  {selectedMember.description}
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: "8px 12px",
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: "#666" }}>Role</span>
                  <span style={{ color: "#ff6600" }}>{selectedMember.role}</span>

                  <span style={{ color: "#666" }}>Status</span>
                  <span>{selectedMember.status}</span>

                  <span style={{ color: "#666" }}>Joined</span>
                  <span>{relativeTime(selectedMember.joinedAt)}</span>

                  <span style={{ color: "#666" }}>Last active</span>
                  <span>{relativeTime(selectedMember.lastActiveAt)}</span>

                  {selectedMember.specializations.length > 0 && (
                    <>
                      <span style={{ color: "#666" }}>Specs</span>
                      <span style={{ color: "#ff6600" }}>
                        {selectedMember.specializations.join(", ")}
                      </span>
                    </>
                  )}

                  {selectedMember.reportsTo && (
                    <>
                      <span style={{ color: "#666" }}>Reports to</span>
                      <span>
                        {DEMO_MEMBERS.find((m) => m.id === selectedMember.reportsTo)?.displayName ??
                          "—"}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ padding: 16, color: "#666", textAlign: "center", marginTop: 60 }}>
                <p>Select a member to view details</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* List View */}
      {activeTab === "list" && (
        <div className="card">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #333" }}>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#666" }}>Name</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#666" }}>Kind</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#666" }}>Role</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#666" }}>Status</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#666" }}>
                  Specializations
                </th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#666" }}>
                  Reports To
                </th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#666" }}>
                  Last Active
                </th>
              </tr>
            </thead>
            <tbody>
              {DEMO_MEMBERS.map((member) => (
                <tr
                  key={member.id}
                  onClick={() => {
                    setSelectedMemberId(member.id);
                    setActiveTab("tree");
                  }}
                  style={{
                    borderBottom: "1px solid #1a1a1a",
                    cursor: "pointer",
                  }}
                >
                  <td style={{ padding: "8px 12px" }}>
                    <span className={statusDot(member.status)} style={{ marginRight: 8 }} />
                    {member.displayName}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <span
                      style={{
                        color: member.kind === "human" ? "#00c853" : "#4db8ff",
                      }}
                    >
                      {member.kind}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px", color: "#ff6600" }}>{member.role}</td>
                  <td style={{ padding: "8px 12px" }}>{member.status}</td>
                  <td style={{ padding: "8px 12px", color: "#888" }}>
                    {member.specializations.join(", ") || "—"}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {DEMO_MEMBERS.find((m) => m.id === member.reportsTo)?.displayName ?? "—"}
                  </td>
                  <td style={{ padding: "8px 12px", color: "#888" }}>
                    {relativeTime(member.lastActiveAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Settings View */}
      {activeTab === "settings" && (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Organization Settings</h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "200px 1fr",
              gap: "12px 16px",
              fontSize: 13,
            }}
          >
            <span style={{ color: "#666" }}>Max Agents</span>
            <span>{DEMO_ORG.settings.maxAgents}</span>

            <span style={{ color: "#666" }}>Max Humans</span>
            <span>{DEMO_ORG.settings.maxHumans}</span>

            <span style={{ color: "#666" }}>Auto-Specialization</span>
            <span style={{ color: DEMO_ORG.settings.autoSpecialization ? "#00c853" : "#ff3b30" }}>
              {DEMO_ORG.settings.autoSpecialization ? "Enabled" : "Disabled"}
            </span>

            <span style={{ color: "#666" }}>Security Level</span>
            <span style={{ color: "#ffb300" }}>{DEMO_ORG.settings.securityLevel}</span>

            <span style={{ color: "#666" }}>Brain Sync Interval</span>
            <span>{Math.round(DEMO_ORG.settings.syncIntervalMs / 1000)}s</span>

            <span style={{ color: "#666" }}>Backup Interval</span>
            <span>{Math.round(DEMO_ORG.settings.backupIntervalMs / 3_600_000)}h</span>

            <span style={{ color: "#666" }}>P2P Port</span>
            <span className="mono">{DEMO_ORG.settings.peerPort}</span>

            <span style={{ color: "#666" }}>Created</span>
            <span>{formatTimestamp(DEMO_ORG.createdAt)}</span>

            <span style={{ color: "#666" }}>Last Updated</span>
            <span>{formatTimestamp(DEMO_ORG.updatedAt)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
