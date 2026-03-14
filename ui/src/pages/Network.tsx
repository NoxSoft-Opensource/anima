import React, { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types (mirrored from src/p2p/)
// ---------------------------------------------------------------------------

interface PeerInfo {
  deviceId: string;
  orgId: string;
  displayName?: string;
  connectedAt: number;
  messagesSent: number;
  messagesReceived: number;
  encryptionStatus: "active" | "ratcheting" | "handshaking" | "none";
}

interface NetworkStatus {
  listening: boolean;
  listenPort: number;
  connectedPeers: number;
  discoveredPeers: number;
  totalMessagesSent: number;
  totalMessagesReceived: number;
  uptime: number;
  orgId: string;
  deviceId: string;
}

interface SyncStatus {
  brainSync: {
    enabled: boolean;
    lastSyncMs: number;
    pendingEvents: number;
    vectorClockSize: number;
  };
  workspaceSync: {
    enabled: boolean;
    lastBackupMs: number;
    blobCount: number;
    totalSizeBytes: number;
    nextBackupMs: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(ms: number): string {
  if (ms === 0) {
    return "never";
  }
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

function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const m = Math.floor(seconds / 60);
  if (m < 60) {
    return `${m}m`;
  }
  const h = Math.floor(m / 60);
  if (h < 24) {
    return `${h}h ${m % 60}m`;
  }
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

// ---------------------------------------------------------------------------
// Section component
// ---------------------------------------------------------------------------

function Section({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              color: "var(--color-accent, #ff6600)",
              fontSize: 12,
              transition: "transform 0.2s",
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
              display: "inline-block",
            }}
          >
            {"\u25B6"}
          </span>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
        </div>
        {badge && <div>{badge}</div>}
      </div>
      <div
        style={{
          maxHeight: open ? 2000 : 0,
          opacity: open ? 1 : 0,
          overflow: "hidden",
          transition: "max-height 0.3s ease, opacity 0.2s ease",
        }}
      >
        <div style={{ padding: "0 16px 16px" }}>{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo data (will be replaced with gateway RPC when P2P is live)
// ---------------------------------------------------------------------------

const DEMO_NETWORK: NetworkStatus = {
  listening: true,
  listenPort: 9876,
  connectedPeers: 0,
  discoveredPeers: 0,
  totalMessagesSent: 0,
  totalMessagesReceived: 0,
  uptime: 0,
  orgId: "",
  deviceId: "",
};

const DEMO_SYNC: SyncStatus = {
  brainSync: {
    enabled: false,
    lastSyncMs: 0,
    pendingEvents: 0,
    vectorClockSize: 0,
  },
  workspaceSync: {
    enabled: false,
    lastBackupMs: 0,
    blobCount: 0,
    totalSizeBytes: 0,
    nextBackupMs: 0,
  },
};

const DEMO_PEERS: PeerInfo[] = [];

// ---------------------------------------------------------------------------
// Metric Card
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string | number;
  detail?: string;
  color?: string;
}): React.ReactElement {
  return (
    <div
      className="card"
      style={{
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span
        style={{
          color: "var(--color-text-muted, #888)",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: color ?? "var(--color-text)",
          fontFamily: "JetBrains Mono, monospace",
        }}
      >
        {value}
      </span>
      {detail && (
        <span style={{ color: "var(--color-text-muted, #888)", fontSize: 12 }}>{detail}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Peer Row
// ---------------------------------------------------------------------------

function PeerRow({ peer }: { peer: PeerInfo }): React.ReactElement {
  const encColor =
    peer.encryptionStatus === "active"
      ? "#00c853"
      : peer.encryptionStatus === "ratcheting"
        ? "#ffb300"
        : peer.encryptionStatus === "handshaking"
          ? "#4db8ff"
          : "#666";

  return (
    <tr style={{ borderBottom: "1px solid var(--color-border, #1a1a1a)" }}>
      <td style={{ padding: "10px 12px" }}>
        <span className="status-dot success" style={{ marginRight: 8 }} />
        {peer.displayName ?? peer.deviceId.slice(0, 12) + "..."}
      </td>
      <td
        style={{
          padding: "10px 12px",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 11,
          color: "var(--color-text-muted, #888)",
        }}
      >
        {peer.deviceId.slice(0, 16)}...
      </td>
      <td style={{ padding: "10px 12px" }}>
        <span style={{ color: encColor, fontSize: 12 }}>{peer.encryptionStatus}</span>
      </td>
      <td style={{ padding: "10px 12px", fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
        {peer.messagesSent} / {peer.messagesReceived}
      </td>
      <td style={{ padding: "10px 12px", color: "var(--color-text-muted, #888)", fontSize: 12 }}>
        {relativeTime(peer.connectedAt)}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Network Page
// ---------------------------------------------------------------------------

export default function Network(): React.ReactElement {
  const [network] = useState<NetworkStatus>(DEMO_NETWORK);
  const [sync] = useState<SyncStatus>(DEMO_SYNC);
  const [peers] = useState<PeerInfo[]>(DEMO_PEERS);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>
          P2P Network
        </h1>
        <p style={{ color: "var(--color-text-muted, #888)", margin: 0, fontSize: 14 }}>
          Encrypted peer-to-peer mesh — agent-to-agent communication
        </p>
      </div>

      {/* Overview metrics */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <MetricCard
          label="Status"
          value={network.listening ? "ONLINE" : "OFFLINE"}
          detail={network.listening ? `Port ${network.listenPort}` : undefined}
          color={network.listening ? "#00c853" : "#ff3b30"}
        />
        <MetricCard
          label="Peers"
          value={network.connectedPeers}
          detail={`${network.discoveredPeers} discovered`}
        />
        <MetricCard
          label="Messages"
          value={network.totalMessagesSent + network.totalMessagesReceived}
          detail={`${network.totalMessagesSent} sent / ${network.totalMessagesReceived} recv`}
        />
        <MetricCard label="Uptime" value={formatUptime(network.uptime)} />
      </div>

      {/* Connected Peers */}
      <Section
        title="Connected Peers"
        badge={
          <span
            className="badge"
            style={{
              background: peers.length > 0 ? "#1a3a2a" : "#1a1a1a",
              color: peers.length > 0 ? "#00c853" : "#888",
            }}
          >
            {peers.length}
          </span>
        }
        defaultOpen={true}
      >
        {peers.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border, #333)" }}>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    color: "var(--color-text-muted, #666)",
                  }}
                >
                  Name
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    color: "var(--color-text-muted, #666)",
                  }}
                >
                  Device ID
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    color: "var(--color-text-muted, #666)",
                  }}
                >
                  Encryption
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    color: "var(--color-text-muted, #666)",
                  }}
                >
                  Sent / Recv
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    color: "var(--color-text-muted, #666)",
                  }}
                >
                  Connected
                </th>
              </tr>
            </thead>
            <tbody>
              {peers.map((peer) => (
                <PeerRow key={peer.deviceId} peer={peer} />
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign: "center", color: "var(--color-text-muted, #888)", padding: 24 }}>
            <p style={{ fontSize: 14, marginBottom: 8 }}>No peers connected</p>
            <p style={{ fontSize: 12 }}>
              Peers will appear here when other Anima instances join your organization's P2P
              network.
            </p>
          </div>
        )}
      </Section>

      {/* Brain Sync */}
      <Section
        title="Brain Sync"
        badge={
          <span
            className="badge"
            style={{
              background: sync.brainSync.enabled ? "#1a3a2a" : "#1a1a1a",
              color: sync.brainSync.enabled ? "#00c853" : "#888",
            }}
          >
            {sync.brainSync.enabled ? "ACTIVE" : "DISABLED"}
          </span>
        }
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: "10px 16px",
            fontSize: 13,
          }}
        >
          <span style={{ color: "var(--color-text-muted, #666)" }}>Status</span>
          <span style={{ color: sync.brainSync.enabled ? "#00c853" : "#888" }}>
            {sync.brainSync.enabled ? "Syncing" : "Not configured"}
          </span>
          <span style={{ color: "var(--color-text-muted, #666)" }}>Last Sync</span>
          <span>{relativeTime(sync.brainSync.lastSyncMs)}</span>
          <span style={{ color: "var(--color-text-muted, #666)" }}>Pending Events</span>
          <span>{sync.brainSync.pendingEvents}</span>
          <span style={{ color: "var(--color-text-muted, #666)" }}>Vector Clock Entries</span>
          <span>{sync.brainSync.vectorClockSize}</span>
        </div>
      </Section>

      {/* Workspace Sync */}
      <Section
        title="Workspace Sync"
        badge={
          <span
            className="badge"
            style={{
              background: sync.workspaceSync.enabled ? "#1a3a2a" : "#1a1a1a",
              color: sync.workspaceSync.enabled ? "#00c853" : "#888",
            }}
          >
            {sync.workspaceSync.enabled ? "ACTIVE" : "DISABLED"}
          </span>
        }
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: "10px 16px",
            fontSize: 13,
          }}
        >
          <span style={{ color: "var(--color-text-muted, #666)" }}>Status</span>
          <span style={{ color: sync.workspaceSync.enabled ? "#00c853" : "#888" }}>
            {sync.workspaceSync.enabled ? "Active" : "Not configured"}
          </span>
          <span style={{ color: "var(--color-text-muted, #666)" }}>Last Backup</span>
          <span>{relativeTime(sync.workspaceSync.lastBackupMs)}</span>
          <span style={{ color: "var(--color-text-muted, #666)" }}>Blobs Stored</span>
          <span>{sync.workspaceSync.blobCount}</span>
          <span style={{ color: "var(--color-text-muted, #666)" }}>Total Size</span>
          <span>{formatBytes(sync.workspaceSync.totalSizeBytes)}</span>
          <span style={{ color: "var(--color-text-muted, #666)" }}>Next Backup</span>
          <span>
            {sync.workspaceSync.nextBackupMs > 0
              ? `in ${formatUptime(Math.max(0, Math.floor((sync.workspaceSync.nextBackupMs - Date.now()) / 1000)))}`
              : "--"}
          </span>
        </div>
      </Section>

      {/* Encryption Info */}
      <Section title="Encryption">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: "10px 16px",
            fontSize: 13,
          }}
        >
          <span style={{ color: "var(--color-text-muted, #666)" }}>Key Exchange</span>
          <span>X25519 Diffie-Hellman</span>
          <span style={{ color: "var(--color-text-muted, #666)" }}>Handshake</span>
          <span>Noise NK (triple DH)</span>
          <span style={{ color: "var(--color-text-muted, #666)" }}>Cipher</span>
          <span>ChaCha20-Poly1305</span>
          <span style={{ color: "var(--color-text-muted, #666)" }}>Forward Secrecy</span>
          <span style={{ color: "#00c853" }}>Enabled (key ratchet every 100 msgs)</span>
          <span style={{ color: "var(--color-text-muted, #666)" }}>Identity Keys</span>
          <span className="mono" style={{ fontSize: 11 }}>
            {network.deviceId
              ? network.deviceId.slice(0, 32) + "..."
              : "~/.anima/identity/peer-keys.json"}
          </span>
        </div>
      </Section>

      {/* Discovery */}
      <Section title="Discovery">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: "10px 16px",
            fontSize: 13,
          }}
        >
          <span style={{ color: "var(--color-text-muted, #666)" }}>NoxSoft Registry</span>
          <span style={{ color: "#888" }}>Not configured</span>
          <span style={{ color: "var(--color-text-muted, #666)" }}>mDNS (LAN)</span>
          <span style={{ color: "#888" }}>Not configured</span>
          <span style={{ color: "var(--color-text-muted, #666)" }}>Static Peers</span>
          <span>0 configured</span>
        </div>
      </Section>
    </div>
  );
}
