/**
 * P2P Wire Protocol for ANIMA 6
 *
 * Defines the message types, framing, and serialization for
 * peer-to-peer agent communication over encrypted WebSocket.
 */

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

export type PeerMessageType =
  | "dm" // Direct message to a specific peer
  | "broadcast" // Broadcast to all org peers
  | "channel" // Message to a named sub-group channel
  | "rpc.request" // RPC-style invoke
  | "rpc.response" // RPC response
  | "presence" // Heartbeat/presence announcement
  | "sync" // Brain state sync
  | "delegate" // Task delegation
  | "escalate"; // Task escalation

export interface PeerMessage {
  type: PeerMessageType;
  id: string;
  from: string; // sender deviceId
  to?: string; // target deviceId or channel name
  orgId: string;
  payload: unknown;
  ts: number; // unix ms
  seq: number; // per-connection sequence number
  replyTo?: string; // for rpc.response
}

// ---------------------------------------------------------------------------
// Presence payload
// ---------------------------------------------------------------------------

export interface PresencePayload {
  agentName: string;
  roleType: OrgRoleType;
  specializations: string[];
  status: AgentStatus;
  activeTaskCount: number;
  capacity: number;
  uptime: number; // seconds
}

export type OrgRoleType = "operator" | "coordinator" | "worker";
export type AgentStatus = "active" | "idle" | "busy" | "overloaded" | "offline";

// ---------------------------------------------------------------------------
// Delegation payload
// ---------------------------------------------------------------------------

export interface DelegationPayload {
  taskId: string;
  title: string;
  description: string;
  domain: string;
  priority: "critical" | "high" | "medium" | "low";
  deadline?: number; // unix ms
  parentTaskId?: string;
}

export interface EscalationPayload {
  taskId: string;
  reason: string;
  blockedSince: number;
  attemptedResolutions: string[];
}

// ---------------------------------------------------------------------------
// RPC payloads
// ---------------------------------------------------------------------------

export interface RpcRequestPayload {
  method: string;
  params?: unknown;
  timeout?: number; // ms
}

export interface RpcResponsePayload {
  result?: unknown;
  error?: { code: number; message: string };
}

// ---------------------------------------------------------------------------
// Sync payloads
// ---------------------------------------------------------------------------

export interface BrainSyncPayload {
  eventBatch: BrainSyncEvent[];
  vectorClock: Record<string, number>;
}

export interface BrainSyncEvent {
  eventId: string;
  type: "node:upsert" | "node:archive" | "edge:upsert" | "edge:archive";
  nodeId?: string;
  edgeId?: string;
  clock: number;
  sensitivity: "public" | "internal" | "private" | "secret";
  data?: unknown;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export function serializeMessage(msg: PeerMessage): Uint8Array {
  return TEXT_ENCODER.encode(JSON.stringify(msg));
}

export function deserializeMessage(data: Uint8Array): PeerMessage {
  const raw = TEXT_DECODER.decode(data);
  const parsed = JSON.parse(raw) as PeerMessage;
  if (
    typeof parsed.type !== "string" ||
    typeof parsed.id !== "string" ||
    typeof parsed.from !== "string" ||
    typeof parsed.orgId !== "string" ||
    typeof parsed.ts !== "number" ||
    typeof parsed.seq !== "number"
  ) {
    throw new Error("Invalid peer message: missing required fields");
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Message factory
// ---------------------------------------------------------------------------

let globalSeq = 0;

export function createMessage(
  type: PeerMessageType,
  from: string,
  orgId: string,
  payload: unknown,
  options?: { to?: string; replyTo?: string },
): PeerMessage {
  return {
    type,
    id: crypto.randomUUID(),
    from,
    to: options?.to,
    orgId,
    payload,
    ts: Date.now(),
    seq: globalSeq++,
    replyTo: options?.replyTo,
  };
}
