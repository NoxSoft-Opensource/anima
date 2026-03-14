/**
 * P2P Cryptographic Layer for ANIMA 6
 *
 * Provides X25519 key exchange, Noise-NK-inspired handshake,
 * and ChaCha20-Poly1305 authenticated encryption for peer-to-peer
 * agent communication.
 *
 * Uses only Node.js built-in crypto — zero external dependencies.
 */

import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PeerKeypair {
  publicKey: Uint8Array; // 32 bytes
  privateKey: Uint8Array; // 32 bytes
}

export interface PeerIdentity {
  deviceId: string;
  ed25519PublicKeyPem: string;
  x25519PublicKey: Uint8Array; // 32 bytes
  x25519PublicKeyBase64: string;
}

export interface SessionKeys {
  sendKey: Uint8Array; // 32-byte ChaCha20-Poly1305 key
  recvKey: Uint8Array; // 32-byte ChaCha20-Poly1305 key
  sendNonce: bigint;
  recvNonce: bigint;
}

export interface EncryptedFrame {
  nonce: Uint8Array; // 12 bytes
  ciphertext: Uint8Array;
}

export interface HandshakeHello {
  deviceId: string;
  orgId: string;
  x25519PublicKey: string; // base64url
  ed25519PublicKey: string; // base64url
  ephemeralPublicKey: string; // base64url, X25519 ephemeral
  timestamp: number;
  signature: string; // Ed25519 signature over the handshake payload
}

export interface HandshakeResult {
  sessionKeys: SessionKeys;
  peerDeviceId: string;
  peerOrgId: string;
}

// ---------------------------------------------------------------------------
// X25519 Key Generation
// ---------------------------------------------------------------------------

export function generateX25519Keypair(): PeerKeypair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("x25519");
  const pubRaw = publicKey.export({ type: "spki", format: "der" });
  const privRaw = privateKey.export({ type: "pkcs8", format: "der" });
  // X25519 SPKI is 44 bytes: 12-byte prefix + 32-byte key
  const pubBytes = new Uint8Array(pubRaw.subarray(pubRaw.length - 32));
  // X25519 PKCS8 is 48 bytes: 16-byte prefix + 32-byte key
  const privBytes = new Uint8Array(privRaw.subarray(privRaw.length - 32));
  return { publicKey: pubBytes, privateKey: privBytes };
}

// ---------------------------------------------------------------------------
// Key serialization helpers
// ---------------------------------------------------------------------------

const X25519_SPKI_PREFIX = Buffer.from("302a300506032b656e032100", "hex");

const X25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b656e04220420", "hex");

export function base64UrlEncode(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

export function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return new Uint8Array(Buffer.from(padded, "base64"));
}

function rawToX25519PublicKeyObject(raw: Uint8Array): crypto.KeyObject {
  const der = Buffer.concat([X25519_SPKI_PREFIX, Buffer.from(raw)]);
  return crypto.createPublicKey({ key: der, type: "spki", format: "der" });
}

function rawToX25519PrivateKeyObject(raw: Uint8Array): crypto.KeyObject {
  const der = Buffer.concat([X25519_PKCS8_PREFIX, Buffer.from(raw)]);
  return crypto.createPrivateKey({ key: der, type: "pkcs8", format: "der" });
}

// ---------------------------------------------------------------------------
// Diffie-Hellman key exchange
// ---------------------------------------------------------------------------

export function x25519DH(localPrivate: Uint8Array, remotePublic: Uint8Array): Uint8Array {
  const priv = rawToX25519PrivateKeyObject(localPrivate);
  const pub = rawToX25519PublicKeyObject(remotePublic);
  const shared = crypto.diffieHellman({ privateKey: priv, publicKey: pub });
  return new Uint8Array(shared);
}

// ---------------------------------------------------------------------------
// HKDF key derivation
// ---------------------------------------------------------------------------

export function deriveSessionKeys(
  sharedSecret: Uint8Array,
  initiatorPublicKey: Uint8Array,
  responderPublicKey: Uint8Array,
): SessionKeys {
  const salt = crypto
    .createHash("sha256")
    .update(Buffer.from(initiatorPublicKey))
    .update(Buffer.from(responderPublicKey))
    .digest();

  const keyMaterial = crypto.hkdfSync(
    "sha256",
    sharedSecret,
    salt,
    Buffer.from("anima-p2p-session-v1"),
    64, // 32 bytes for send key + 32 bytes for recv key
  );

  const km = new Uint8Array(keyMaterial);
  return {
    sendKey: km.slice(0, 32),
    recvKey: km.slice(32, 64),
    sendNonce: 0n,
    recvNonce: 0n,
  };
}

// ---------------------------------------------------------------------------
// ChaCha20-Poly1305 authenticated encryption
// ---------------------------------------------------------------------------

function nonceToBuffer(nonce: bigint): Buffer {
  const buf = Buffer.alloc(12);
  buf.writeBigUInt64LE(nonce, 0);
  return buf;
}

export function encrypt(
  key: Uint8Array,
  nonce: bigint,
  plaintext: Uint8Array,
  aad?: Uint8Array,
): EncryptedFrame {
  const nonceBuf = nonceToBuffer(nonce);
  const cipher = crypto.createCipheriv(
    "chacha20-poly1305" as crypto.CipherCCMTypes,
    Buffer.from(key),
    nonceBuf,
    { authTagLength: 16 },
  );
  if (aad) {
    (cipher as unknown as { setAAD(buf: Buffer): void }).setAAD(Buffer.from(aad));
  }
  const encrypted = cipher.update(Buffer.from(plaintext));
  const final = cipher.final();
  const tag = cipher.getAuthTag();
  const ciphertext = new Uint8Array(Buffer.concat([encrypted, final, tag]));
  return { nonce: new Uint8Array(nonceBuf), ciphertext };
}

export function decrypt(key: Uint8Array, frame: EncryptedFrame, aad?: Uint8Array): Uint8Array {
  const ct = Buffer.from(frame.ciphertext);
  const tag = ct.subarray(ct.length - 16);
  const data = ct.subarray(0, ct.length - 16);

  const decipher = crypto.createDecipheriv(
    "chacha20-poly1305" as crypto.CipherCCMTypes,
    Buffer.from(key),
    Buffer.from(frame.nonce),
    { authTagLength: 16 },
  );
  if (aad) {
    (decipher as unknown as { setAAD(buf: Buffer): void }).setAAD(Buffer.from(aad));
  }
  decipher.setAuthTag(tag);
  const decrypted = decipher.update(data);
  const final = decipher.final();
  return new Uint8Array(Buffer.concat([decrypted, final]));
}

// ---------------------------------------------------------------------------
// Session encryption with automatic nonce increment
// ---------------------------------------------------------------------------

export function encryptMessage(
  keys: SessionKeys,
  plaintext: Uint8Array,
): { frame: EncryptedFrame; updatedKeys: SessionKeys } {
  const frame = encrypt(keys.sendKey, keys.sendNonce, plaintext);
  return {
    frame,
    updatedKeys: { ...keys, sendNonce: keys.sendNonce + 1n },
  };
}

export function decryptMessage(
  keys: SessionKeys,
  frame: EncryptedFrame,
): { plaintext: Uint8Array; updatedKeys: SessionKeys } {
  const plaintext = decrypt(keys.recvKey, frame, undefined);
  return {
    plaintext,
    updatedKeys: { ...keys, recvNonce: keys.recvNonce + 1n },
  };
}

// ---------------------------------------------------------------------------
// Handshake: Noise-NK-inspired mutual authentication
// ---------------------------------------------------------------------------

export function createHandshakeHello(
  deviceId: string,
  orgId: string,
  x25519StaticPub: Uint8Array,
  ed25519PublicKeyPem: string,
  ed25519PrivateKeyPem: string,
  ephemeralKeypair: PeerKeypair,
): HandshakeHello {
  const timestamp = Date.now();
  const payload = [
    deviceId,
    orgId,
    base64UrlEncode(x25519StaticPub),
    base64UrlEncode(ephemeralKeypair.publicKey),
    String(timestamp),
  ].join("|");

  const ed25519Key = crypto.createPrivateKey(ed25519PrivateKeyPem);
  const sig = crypto.sign(null, Buffer.from(payload, "utf8"), ed25519Key);

  // Extract raw Ed25519 public key for compact transmission
  const ed25519PubKey = crypto.createPublicKey(ed25519PublicKeyPem);
  const spki = ed25519PubKey.export({ type: "spki", format: "der" });
  const ed25519Raw = new Uint8Array(spki.subarray(spki.length - 32));

  return {
    deviceId,
    orgId,
    x25519PublicKey: base64UrlEncode(x25519StaticPub),
    ed25519PublicKey: base64UrlEncode(ed25519Raw),
    ephemeralPublicKey: base64UrlEncode(ephemeralKeypair.publicKey),
    timestamp,
    signature: base64UrlEncode(new Uint8Array(sig)),
  };
}

export function verifyHandshakeHello(hello: HandshakeHello): boolean {
  const payload = [
    hello.deviceId,
    hello.orgId,
    hello.x25519PublicKey,
    hello.ephemeralPublicKey,
    String(hello.timestamp),
  ].join("|");

  // Reconstruct Ed25519 public key from raw bytes
  const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
  const ed25519Raw = base64UrlDecode(hello.ed25519PublicKey);
  const pubKey = crypto.createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(ed25519Raw)]),
    type: "spki",
    format: "der",
  });

  const sigBytes = base64UrlDecode(hello.signature);

  // Verify timestamp is within 30 seconds
  const now = Date.now();
  if (Math.abs(now - hello.timestamp) > 30_000) {
    return false;
  }

  return crypto.verify(null, Buffer.from(payload, "utf8"), pubKey, Buffer.from(sigBytes));
}

/**
 * Complete a Noise-NK-inspired handshake.
 *
 * Both sides perform a triple DH:
 *   1. initiator_ephemeral × responder_static
 *   2. initiator_static × responder_ephemeral
 *   3. initiator_ephemeral × responder_ephemeral
 *
 * The shared secrets are hashed together to derive session keys.
 * This provides forward secrecy via ephemerals and mutual auth via statics.
 */
export function completeHandshake(
  isInitiator: boolean,
  localStaticKeypair: PeerKeypair,
  localEphemeralKeypair: PeerKeypair,
  remoteStaticPublicKey: Uint8Array,
  remoteEphemeralPublicKey: Uint8Array,
): SessionKeys {
  // Triple DH — both sides compute the same three shared secrets
  // regardless of role, because DH is commutative:
  //   initiator_ephemeral × responder_static = responder_static × initiator_ephemeral
  //
  // We normalize by always hashing in canonical order:
  //   dh(ephemeral_initiator, static_responder)
  //   dh(static_initiator, ephemeral_responder)
  //   dh(ephemeral_initiator, ephemeral_responder)
  //
  // Each side computes the same values using their own private keys.
  const dhEphStatic = x25519DH(
    isInitiator ? localEphemeralKeypair.privateKey : localStaticKeypair.privateKey,
    isInitiator ? remoteStaticPublicKey : remoteEphemeralPublicKey,
  );
  const dhStaticEph = x25519DH(
    isInitiator ? localStaticKeypair.privateKey : localEphemeralKeypair.privateKey,
    isInitiator ? remoteEphemeralPublicKey : remoteStaticPublicKey,
  );
  const dhEphEph = x25519DH(localEphemeralKeypair.privateKey, remoteEphemeralPublicKey);

  // Combine all three shared secrets in canonical order
  const combined = crypto
    .createHash("sha256")
    .update(Buffer.from(dhEphStatic))
    .update(Buffer.from(dhStaticEph))
    .update(Buffer.from(dhEphEph))
    .digest();

  // Derive directional keys — initiator and responder get opposite send/recv
  const initiatorPub = isInitiator ? localStaticKeypair.publicKey : remoteStaticPublicKey;
  const responderPub = isInitiator ? remoteStaticPublicKey : localStaticKeypair.publicKey;

  const keys = deriveSessionKeys(new Uint8Array(combined), initiatorPub, responderPub);

  // Swap keys for responder so send/recv are correct
  if (!isInitiator) {
    return {
      sendKey: keys.recvKey,
      recvKey: keys.sendKey,
      sendNonce: 0n,
      recvNonce: 0n,
    };
  }

  return keys;
}

// ---------------------------------------------------------------------------
// Key ratchet for forward secrecy
// ---------------------------------------------------------------------------

export function ratchetKeys(keys: SessionKeys): SessionKeys {
  const newSendKey = new Uint8Array(
    crypto.hkdfSync(
      "sha256",
      keys.sendKey,
      Buffer.alloc(32), // zero salt
      Buffer.from("anima-ratchet-send"),
      32,
    ),
  );

  const newRecvKey = new Uint8Array(
    crypto.hkdfSync(
      "sha256",
      keys.recvKey,
      Buffer.alloc(32),
      Buffer.from("anima-ratchet-recv"),
      32,
    ),
  );

  return {
    sendKey: newSendKey,
    recvKey: newRecvKey,
    sendNonce: 0n,
    recvNonce: 0n,
  };
}
