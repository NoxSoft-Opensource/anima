import crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  generateX25519Keypair,
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
  base64UrlEncode,
  base64UrlDecode,
} from "./crypto.js";

describe("P2P Crypto", () => {
  describe("X25519 key generation", () => {
    it("generates 32-byte keypairs", () => {
      const kp = generateX25519Keypair();
      expect(kp.publicKey).toHaveLength(32);
      expect(kp.privateKey).toHaveLength(32);
    });

    it("generates unique keypairs", () => {
      const kp1 = generateX25519Keypair();
      const kp2 = generateX25519Keypair();
      expect(base64UrlEncode(kp1.publicKey)).not.toBe(base64UrlEncode(kp2.publicKey));
    });
  });

  describe("base64url encoding", () => {
    it("roundtrips correctly", () => {
      const data = crypto.randomBytes(32);
      const encoded = base64UrlEncode(new Uint8Array(data));
      const decoded = base64UrlDecode(encoded);
      expect(Buffer.from(decoded).equals(data)).toBe(true);
    });

    it("produces URL-safe characters", () => {
      const data = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        data[i] = i;
      }
      const encoded = base64UrlEncode(data);
      expect(encoded).not.toContain("+");
      expect(encoded).not.toContain("/");
      expect(encoded).not.toContain("=");
    });
  });

  describe("Diffie-Hellman", () => {
    it("produces matching shared secrets", () => {
      const alice = generateX25519Keypair();
      const bob = generateX25519Keypair();

      const sharedA = x25519DH(alice.privateKey, bob.publicKey);
      const sharedB = x25519DH(bob.privateKey, alice.publicKey);

      expect(base64UrlEncode(sharedA)).toBe(base64UrlEncode(sharedB));
    });
  });

  describe("Session key derivation", () => {
    it("produces directional keys", () => {
      const shared = crypto.randomBytes(32);
      const pubA = crypto.randomBytes(32);
      const pubB = crypto.randomBytes(32);

      const keys = deriveSessionKeys(
        new Uint8Array(shared),
        new Uint8Array(pubA),
        new Uint8Array(pubB),
      );

      expect(keys.sendKey).toHaveLength(32);
      expect(keys.recvKey).toHaveLength(32);
      expect(base64UrlEncode(keys.sendKey)).not.toBe(base64UrlEncode(keys.recvKey));
      expect(keys.sendNonce).toBe(0n);
      expect(keys.recvNonce).toBe(0n);
    });
  });

  describe("ChaCha20-Poly1305 encryption", () => {
    it("encrypts and decrypts correctly", () => {
      const key = new Uint8Array(crypto.randomBytes(32));
      const plaintext = new TextEncoder().encode("hello anima network");

      const frame = encrypt(key, 0n, plaintext);
      const decrypted = decrypt(key, frame);

      expect(new TextDecoder().decode(decrypted)).toBe("hello anima network");
    });

    it("rejects tampered ciphertext", () => {
      const key = new Uint8Array(crypto.randomBytes(32));
      const plaintext = new TextEncoder().encode("sensitive data");

      const frame = encrypt(key, 0n, plaintext);
      // Tamper with ciphertext
      frame.ciphertext[0] ^= 0xff;

      expect(() => decrypt(key, frame)).toThrow();
    });

    it("rejects wrong key", () => {
      const key1 = new Uint8Array(crypto.randomBytes(32));
      const key2 = new Uint8Array(crypto.randomBytes(32));
      const plaintext = new TextEncoder().encode("secret");

      const frame = encrypt(key1, 0n, plaintext);
      expect(() => decrypt(key2, frame)).toThrow();
    });
  });

  describe("Session encryption with nonce increment", () => {
    it("auto-increments nonces", () => {
      const key = new Uint8Array(crypto.randomBytes(32));
      const keys = {
        sendKey: key,
        recvKey: key,
        sendNonce: 0n,
        recvNonce: 0n,
      };

      const msg1 = encryptMessage(keys, new TextEncoder().encode("msg1"));
      expect(msg1.updatedKeys.sendNonce).toBe(1n);

      const msg2 = encryptMessage(msg1.updatedKeys, new TextEncoder().encode("msg2"));
      expect(msg2.updatedKeys.sendNonce).toBe(2n);
    });

    it("decrypt matches encrypt with shared keys", () => {
      const alice = generateX25519Keypair();
      const bob = generateX25519Keypair();

      const sharedA = x25519DH(alice.privateKey, bob.publicKey);
      const aliceKeys = deriveSessionKeys(sharedA, alice.publicKey, bob.publicKey);
      const bobKeys = {
        sendKey: aliceKeys.recvKey,
        recvKey: aliceKeys.sendKey,
        sendNonce: 0n,
        recvNonce: 0n,
      };

      const { frame, updatedKeys: aliceUpdated } = encryptMessage(
        aliceKeys,
        new TextEncoder().encode("hello bob"),
      );

      const { plaintext, updatedKeys: bobUpdated } = decryptMessage(bobKeys, frame);

      expect(new TextDecoder().decode(plaintext)).toBe("hello bob");
      expect(aliceUpdated.sendNonce).toBe(1n);
      expect(bobUpdated.recvNonce).toBe(1n);
    });
  });

  describe("Handshake", () => {
    it("creates and verifies handshake hello", () => {
      const { publicKey: ed25519Pub, privateKey: ed25519Priv } =
        crypto.generateKeyPairSync("ed25519");
      const ed25519PubPem = ed25519Pub.export({ type: "spki", format: "pem" }).toString();
      const ed25519PrivPem = ed25519Priv.export({ type: "pkcs8", format: "pem" }).toString();

      const x25519Kp = generateX25519Keypair();
      const ephemeral = generateX25519Keypair();

      const hello = createHandshakeHello(
        "device-123",
        "org-456",
        x25519Kp.publicKey,
        ed25519PubPem,
        ed25519PrivPem,
        ephemeral,
      );

      expect(hello.deviceId).toBe("device-123");
      expect(hello.orgId).toBe("org-456");
      expect(verifyHandshakeHello(hello)).toBe(true);
    });

    it("rejects tampered handshake", () => {
      const { publicKey: ed25519Pub, privateKey: ed25519Priv } =
        crypto.generateKeyPairSync("ed25519");
      const ed25519PubPem = ed25519Pub.export({ type: "spki", format: "pem" }).toString();
      const ed25519PrivPem = ed25519Priv.export({ type: "pkcs8", format: "pem" }).toString();

      const x25519Kp = generateX25519Keypair();
      const ephemeral = generateX25519Keypair();

      const hello = createHandshakeHello(
        "device-123",
        "org-456",
        x25519Kp.publicKey,
        ed25519PubPem,
        ed25519PrivPem,
        ephemeral,
      );

      // Tamper with orgId
      hello.orgId = "org-hacked";
      expect(verifyHandshakeHello(hello)).toBe(false);
    });
  });

  describe("Full handshake", () => {
    it("produces matching session keys for initiator and responder", () => {
      const aliceStatic = generateX25519Keypair();
      const aliceEphemeral = generateX25519Keypair();
      const bobStatic = generateX25519Keypair();
      const bobEphemeral = generateX25519Keypair();

      const aliceKeys = completeHandshake(
        true,
        aliceStatic,
        aliceEphemeral,
        bobStatic.publicKey,
        bobEphemeral.publicKey,
      );

      const bobKeys = completeHandshake(
        false,
        bobStatic,
        bobEphemeral,
        aliceStatic.publicKey,
        aliceEphemeral.publicKey,
      );

      // Alice's send key should be Bob's recv key
      expect(base64UrlEncode(aliceKeys.sendKey)).toBe(base64UrlEncode(bobKeys.recvKey));
      expect(base64UrlEncode(aliceKeys.recvKey)).toBe(base64UrlEncode(bobKeys.sendKey));

      // Verify end-to-end encryption works
      const { frame } = encryptMessage(aliceKeys, new TextEncoder().encode("hello from alice"));
      const { plaintext } = decryptMessage(bobKeys, frame);
      expect(new TextDecoder().decode(plaintext)).toBe("hello from alice");
    });
  });

  describe("Key ratchet", () => {
    it("produces different keys after ratcheting", () => {
      const keys = {
        sendKey: new Uint8Array(crypto.randomBytes(32)),
        recvKey: new Uint8Array(crypto.randomBytes(32)),
        sendNonce: 42n,
        recvNonce: 17n,
      };

      const ratcheted = ratchetKeys(keys);

      expect(base64UrlEncode(ratcheted.sendKey)).not.toBe(base64UrlEncode(keys.sendKey));
      expect(base64UrlEncode(ratcheted.recvKey)).not.toBe(base64UrlEncode(keys.recvKey));
      expect(ratcheted.sendNonce).toBe(0n);
      expect(ratcheted.recvNonce).toBe(0n);
    });

    it("is deterministic", () => {
      const keys = {
        sendKey: new Uint8Array(crypto.randomBytes(32)),
        recvKey: new Uint8Array(crypto.randomBytes(32)),
        sendNonce: 0n,
        recvNonce: 0n,
      };

      const r1 = ratchetKeys(keys);
      const r2 = ratchetKeys(keys);

      expect(base64UrlEncode(r1.sendKey)).toBe(base64UrlEncode(r2.sendKey));
    });
  });
});
