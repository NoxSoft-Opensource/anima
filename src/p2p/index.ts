/**
 * ANIMA 6 Peer-to-Peer Network
 *
 * Encrypted agent-to-agent communication over WebSocket mesh.
 * Uses X25519 key exchange, Noise-NK handshake, and ChaCha20-Poly1305.
 */

export {
  type PeerKeypair,
  type PeerIdentity,
  type SessionKeys,
  type EncryptedFrame,
  type HandshakeHello,
  type HandshakeResult,
  generateX25519Keypair,
  base64UrlEncode,
  base64UrlDecode,
  x25519DH,
  deriveSessionKeys,
  encrypt,
  decrypt,
  encryptMessage,
  decryptMessage,
  createHandshakeHello,
  verifyHandshakeHello,
  completeHandshake,
  ratchetKeys,
} from "./crypto.js";

export {
  type PeerMessage,
  type PeerMessageType,
  type PresencePayload,
  type OrgRoleType,
  type AgentStatus,
  type DelegationPayload,
  type EscalationPayload,
  type RpcRequestPayload,
  type RpcResponsePayload,
  type BrainSyncPayload,
  type BrainSyncEvent,
  serializeMessage,
  deserializeMessage,
  createMessage,
} from "./protocol.js";

export { loadOrCreatePeerKeypair, buildPeerIdentity, loadPeerIdentity } from "./identity.js";

export { PeerTransport, type PeerTransportConfig, type PeerConnectionInfo } from "./transport.js";

export {
  PeerDiscovery,
  type PeerRecord,
  type PeerEndpoint,
  type DiscoveryConfig,
} from "./discovery.js";

export { PeerMesh, type PeerMeshConfig } from "./mesh.js";

export { PeerChannel } from "./peer-channel.js";

export {
  ContentRouter,
  type ContentRouterConfig,
  type ContentChunk,
  type ContentManifest,
  type ContentAnnouncePayload,
  type ContentRequestPayload,
  type ContentResponsePayload,
} from "./content-router.js";

export {
  PrivateDns,
  type PrivateDnsConfig,
  type DnsRecord,
  type DnsRecordType,
  type SrvRecord,
  type DnsRegisterPayload,
  type DnsQueryPayload,
  type DnsResponsePayload,
} from "./private-dns.js";

export {
  RelayManager,
  type RelayConfig,
  type RelaySession,
  type BandwidthRecord,
  type RelayRequestPayload,
  type RelayBridgePayload,
  type RelayDataPayload,
} from "./relay.js";

export {
  PinningManager,
  type PinningConfig,
  type PinAgreement,
  type PinnerStatus,
  type PinPriority,
  type PinRequestPayload,
  type PinAckPayload,
} from "./pinning.js";
