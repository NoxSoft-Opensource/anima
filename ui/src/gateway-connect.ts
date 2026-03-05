type GatewayConnectAuth = {
  token?: string;
  password?: string;
};

type GatewayClientInfo = {
  id: string;
  version: string;
  platform: string;
  mode: string;
};

type BuildOperatorConnectParamsArgs = {
  minProtocol: number;
  maxProtocol: number;
  client: GatewayClientInfo;
  auth: GatewayConnectAuth;
  scopes?: string[];
  caps?: string[];
  nonce?: string;
};

type DeviceIdentity = {
  deviceId: string;
  publicKey: string;
  privateKey: string;
};

type StoredIdentity = {
  version: 1;
  deviceId: string;
  publicKey: string;
  privateKey: string;
  createdAtMs: number;
};

const STORAGE_KEY = "anima.gateway.device-identity.v1";

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function fingerprintPublicKey(publicKeyRaw: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(publicKeyRaw));
  return bytesToHex(new Uint8Array(digest));
}

async function generateDeviceIdentity(): Promise<DeviceIdentity> {
  if (!crypto?.subtle) {
    throw new Error("WebCrypto is unavailable in this browser context.");
  }
  const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  const privateKeyPkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
  );
  return {
    deviceId: await fingerprintPublicKey(publicKeyRaw),
    publicKey: base64UrlEncode(publicKeyRaw),
    privateKey: base64UrlEncode(privateKeyPkcs8),
  };
}

async function loadOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  if (typeof window === "undefined") {
    throw new Error("Device identity requires a browser context.");
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredIdentity;
      if (
        parsed?.version === 1 &&
        typeof parsed.deviceId === "string" &&
        typeof parsed.publicKey === "string" &&
        typeof parsed.privateKey === "string"
      ) {
        const derivedId = await fingerprintPublicKey(base64UrlDecode(parsed.publicKey));
        if (derivedId === parsed.deviceId) {
          return {
            deviceId: parsed.deviceId,
            publicKey: parsed.publicKey,
            privateKey: parsed.privateKey,
          };
        }
      }
    }
  } catch {
    // Fall through to regenerate.
  }

  const identity = await generateDeviceIdentity();
  const stored: StoredIdentity = {
    version: 1,
    deviceId: identity.deviceId,
    publicKey: identity.publicKey,
    privateKey: identity.privateKey,
    createdAtMs: Date.now(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Best-effort persistence.
  }
  return identity;
}

async function signDevicePayload(privateKeyBase64Url: string, payload: string): Promise<string> {
  if (!crypto?.subtle) {
    throw new Error("WebCrypto is unavailable in this browser context.");
  }
  const privateKeyBytes = base64UrlDecode(privateKeyBase64Url);
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    toArrayBuffer(privateKeyBytes),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const message = new TextEncoder().encode(payload);
  const signature = await crypto.subtle.sign(
    { name: "Ed25519" },
    privateKey,
    toArrayBuffer(message),
  );
  return base64UrlEncode(new Uint8Array(signature));
}

function buildDeviceAuthPayload(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce?: string;
}): string {
  const version = params.nonce ? "v2" : "v1";
  const scopes = params.scopes.join(",");
  const token = params.token ?? "";
  const parts = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
  ];
  if (version === "v2") {
    parts.push(params.nonce ?? "");
  }
  return parts.join("|");
}

export function readGatewayChallengeNonce(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const nonce = (payload as Record<string, unknown>).nonce;
  if (typeof nonce !== "string") {
    return undefined;
  }
  const trimmed = nonce.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function buildOperatorConnectParams(
  args: BuildOperatorConnectParamsArgs,
): Promise<Record<string, unknown>> {
  const scopes = Array.isArray(args.scopes) ? args.scopes : ["operator.admin"];
  const caps = Array.isArray(args.caps) ? args.caps : [];
  const identity = await loadOrCreateDeviceIdentity();
  const signedAt = Date.now();
  const payload = buildDeviceAuthPayload({
    deviceId: identity.deviceId,
    clientId: args.client.id,
    clientMode: args.client.mode,
    role: "operator",
    scopes,
    signedAtMs: signedAt,
    token: typeof args.auth.token === "string" ? args.auth.token : null,
    nonce: args.nonce,
  });
  const signature = await signDevicePayload(identity.privateKey, payload);

  return {
    minProtocol: args.minProtocol,
    maxProtocol: args.maxProtocol,
    client: args.client,
    role: "operator",
    scopes,
    caps,
    auth: args.auth,
    device: {
      id: identity.deviceId,
      publicKey: identity.publicKey,
      signature,
      signedAt,
      ...(args.nonce ? { nonce: args.nonce } : {}),
    },
  };
}
