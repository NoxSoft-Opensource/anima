/**
 * P2P Identity Extension for ANIMA 6
 *
 * Extends the existing device identity system with X25519 keypairs
 * for Diffie-Hellman key exchange in P2P communication.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { loadOrCreateDeviceIdentity, type DeviceIdentity } from "../infra/device-identity.js";
import {
  generateX25519Keypair,
  base64UrlEncode,
  base64UrlDecode,
  type PeerKeypair,
  type PeerIdentity,
} from "./crypto.js";

export type { PeerIdentity } from "./crypto.js";

// ---------------------------------------------------------------------------
// Storage types
// ---------------------------------------------------------------------------

interface StoredPeerIdentity {
  version: 1;
  x25519PublicKey: string; // base64url
  x25519PrivateKey: string; // base64url
  createdAtMs: number;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function resolveDefaultPeerIdentityPath(): string {
  return path.join(resolveStateDir(), "identity", "peer-keys.json");
}

// ---------------------------------------------------------------------------
// Load or create X25519 keypair
// ---------------------------------------------------------------------------

export function loadOrCreatePeerKeypair(
  filePath: string = resolveDefaultPeerIdentityPath(),
): PeerKeypair {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as StoredPeerIdentity;
      if (
        parsed?.version === 1 &&
        typeof parsed.x25519PublicKey === "string" &&
        typeof parsed.x25519PrivateKey === "string"
      ) {
        return {
          publicKey: base64UrlDecode(parsed.x25519PublicKey),
          privateKey: base64UrlDecode(parsed.x25519PrivateKey),
        };
      }
    }
  } catch {
    // fall through to regenerate
  }

  const keypair = generateX25519Keypair();

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const stored: StoredPeerIdentity = {
    version: 1,
    x25519PublicKey: base64UrlEncode(keypair.publicKey),
    x25519PrivateKey: base64UrlEncode(keypair.privateKey),
    createdAtMs: Date.now(),
  };
  fs.writeFileSync(filePath, `${JSON.stringify(stored, null, 2)}\n`, {
    mode: 0o600,
  });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // best-effort
  }

  return keypair;
}

// ---------------------------------------------------------------------------
// Build full peer identity from device + peer keys
// ---------------------------------------------------------------------------

export function buildPeerIdentity(
  deviceIdentity: DeviceIdentity,
  peerKeypair: PeerKeypair,
): PeerIdentity {
  return {
    deviceId: deviceIdentity.deviceId,
    ed25519PublicKeyPem: deviceIdentity.publicKeyPem,
    x25519PublicKey: peerKeypair.publicKey,
    x25519PublicKeyBase64: base64UrlEncode(peerKeypair.publicKey),
  };
}

/**
 * Load the complete peer identity (Ed25519 device identity + X25519 peer keys).
 * Creates any missing keys on first run.
 */
export function loadPeerIdentity(): PeerIdentity {
  const deviceIdentity = loadOrCreateDeviceIdentity();
  const peerKeypair = loadOrCreatePeerKeypair();
  return buildPeerIdentity(deviceIdentity, peerKeypair);
}
