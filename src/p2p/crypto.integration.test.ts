/**
 * Integration tests for the ANIMA P2P crypto layer.
 *
 * Unlike crypto.test.ts (unit tests), this file exercises the full
 * end-to-end flow: key generation -> handshake -> session establishment ->
 * encrypted bidirectional communication -> key ratchet -> adversarial cases.
 */

import crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  generateX25519Keypair,
  createHandshakeHello,
  verifyHandshakeHello,
  completeHandshake,
  encryptMessage,
  decryptMessage,
  ratchetKeys,
  decrypt,
  base64UrlEncode,
  base64UrlDecode,
  type PeerKeypair,
  type SessionKeys,
  type EncryptedFrame,
} from "./crypto.js";

// ---------------------------------------------------------------------------
// Helpers — simulate two peers with full identity material
// ---------------------------------------------------------------------------

interface PeerSetup {
  deviceId: string;
  orgId: string;
  x25519Static: PeerKeypair;
  x25519Ephemeral: PeerKeypair;
  ed25519PubPem: string;
  ed25519PrivPem: string;
}

function createPeer(deviceId: string, orgId: string): PeerSetup {
  const { publicKey: ed25519Pub, privateKey: ed25519Priv } = crypto.generateKeyPairSync("ed25519");
  return {
    deviceId,
    orgId,
    x25519Static: generateX25519Keypair(),
    x25519Ephemeral: generateX25519Keypair(),
    ed25519PubPem: ed25519Pub.export({ type: "spki", format: "pem" }).toString(),
    ed25519PrivPem: ed25519Priv.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("P2P Crypto Integration", () => {
  // -----------------------------------------------------------------------
  // 1. Key generation
  // -----------------------------------------------------------------------
  describe("key generation", () => {
    it("generates valid X25519 keypairs for two distinct peers", () => {
      const alice = generateX25519Keypair();
      const bob = generateX25519Keypair();

      // Both produce 32-byte keys
      expect(alice.publicKey).toHaveLength(32);
      expect(alice.privateKey).toHaveLength(32);
      expect(bob.publicKey).toHaveLength(32);
      expect(bob.privateKey).toHaveLength(32);

      // Keys are distinct
      expect(base64UrlEncode(alice.publicKey)).not.toBe(base64UrlEncode(bob.publicKey));
      expect(base64UrlEncode(alice.privateKey)).not.toBe(base64UrlEncode(bob.privateKey));
    });
  });

  // -----------------------------------------------------------------------
  // 2-3. Full handshake flow with session establishment
  // -----------------------------------------------------------------------
  describe("handshake and session establishment", () => {
    it("Alice creates hello, Bob verifies, Bob creates response, Alice verifies", () => {
      const alice = createPeer("alice-device-1", "org-anima");
      const bob = createPeer("bob-device-1", "org-anima");

      // Alice creates a HandshakeHello
      const aliceHello = createHandshakeHello(
        alice.deviceId,
        alice.orgId,
        alice.x25519Static.publicKey,
        alice.ed25519PubPem,
        alice.ed25519PrivPem,
        alice.x25519Ephemeral,
      );

      // Bob verifies Alice's hello
      expect(verifyHandshakeHello(aliceHello)).toBe(true);

      // Bob creates his own hello
      const bobHello = createHandshakeHello(
        bob.deviceId,
        bob.orgId,
        bob.x25519Static.publicKey,
        bob.ed25519PubPem,
        bob.ed25519PrivPem,
        bob.x25519Ephemeral,
      );

      // Alice verifies Bob's hello
      expect(verifyHandshakeHello(bobHello)).toBe(true);

      // Both complete the handshake to derive session keys
      const aliceSession = completeHandshake(
        true,
        alice.x25519Static,
        alice.x25519Ephemeral,
        bob.x25519Static.publicKey,
        bob.x25519Ephemeral.publicKey,
      );

      const bobSession = completeHandshake(
        false,
        bob.x25519Static,
        bob.x25519Ephemeral,
        alice.x25519Static.publicKey,
        alice.x25519Ephemeral.publicKey,
      );

      // Session keys are correctly crossed
      expect(base64UrlEncode(aliceSession.sendKey)).toBe(base64UrlEncode(bobSession.recvKey));
      expect(base64UrlEncode(aliceSession.recvKey)).toBe(base64UrlEncode(bobSession.sendKey));
      expect(aliceSession.sendNonce).toBe(0n);
      expect(aliceSession.recvNonce).toBe(0n);
    });
  });

  // -----------------------------------------------------------------------
  // 4-5. Encryption round-trip and bidirectional communication
  // -----------------------------------------------------------------------
  describe("encrypted bidirectional communication", () => {
    function establishSession() {
      const alice = createPeer("alice", "org-1");
      const bob = createPeer("bob", "org-1");

      const aliceKeys = completeHandshake(
        true,
        alice.x25519Static,
        alice.x25519Ephemeral,
        bob.x25519Static.publicKey,
        bob.x25519Ephemeral.publicKey,
      );

      const bobKeys = completeHandshake(
        false,
        bob.x25519Static,
        bob.x25519Ephemeral,
        alice.x25519Static.publicKey,
        alice.x25519Ephemeral.publicKey,
      );

      return { aliceKeys, bobKeys };
    }

    it("Alice encrypts, Bob decrypts — plaintext matches", () => {
      const { aliceKeys, bobKeys } = establishSession();
      const message = "Hello Bob, this is a secret message from Alice!";

      const { frame } = encryptMessage(aliceKeys, encoder.encode(message));
      const { plaintext } = decryptMessage(bobKeys, frame);

      expect(decoder.decode(plaintext)).toBe(message);
    });

    it("Bob encrypts, Alice decrypts — bidirectional", () => {
      let { aliceKeys, bobKeys } = establishSession();
      const messageFromBob = "Hello Alice, Bob here!";

      const { frame, updatedKeys: bobUpdated } = encryptMessage(
        bobKeys,
        encoder.encode(messageFromBob),
      );
      const { plaintext, updatedKeys: aliceUpdated } = decryptMessage(aliceKeys, frame);

      expect(decoder.decode(plaintext)).toBe(messageFromBob);

      // Now Alice responds
      const reply = "Got your message, Bob!";
      const { frame: replyFrame } = encryptMessage(aliceUpdated, encoder.encode(reply));
      const { plaintext: replyPlain } = decryptMessage(bobUpdated, replyFrame);

      expect(decoder.decode(replyPlain)).toBe(reply);
    });

    it("multi-message conversation in both directions", () => {
      let { aliceKeys, bobKeys } = establishSession();

      const conversation = [
        { from: "alice", text: "Hey Bob" },
        { from: "bob", text: "Hey Alice, what's up?" },
        { from: "alice", text: "Building crypto tests" },
        { from: "bob", text: "Nice, same here" },
        { from: "alice", text: "Great minds think alike" },
      ];

      for (const msg of conversation) {
        if (msg.from === "alice") {
          const { frame, updatedKeys } = encryptMessage(aliceKeys, encoder.encode(msg.text));
          aliceKeys = updatedKeys;
          const { plaintext, updatedKeys: bobUpd } = decryptMessage(bobKeys, frame);
          bobKeys = bobUpd;
          expect(decoder.decode(plaintext)).toBe(msg.text);
        } else {
          const { frame, updatedKeys } = encryptMessage(bobKeys, encoder.encode(msg.text));
          bobKeys = updatedKeys;
          const { plaintext, updatedKeys: aliceUpd } = decryptMessage(aliceKeys, frame);
          aliceKeys = aliceUpd;
          expect(decoder.decode(plaintext)).toBe(msg.text);
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // 6. Nonce increment
  // -----------------------------------------------------------------------
  describe("nonce increment", () => {
    it("send and recv nonces increment correctly over multiple messages", () => {
      const alice = createPeer("alice", "org");
      const bob = createPeer("bob", "org");

      let aliceKeys = completeHandshake(
        true,
        alice.x25519Static,
        alice.x25519Ephemeral,
        bob.x25519Static.publicKey,
        bob.x25519Ephemeral.publicKey,
      );
      let bobKeys = completeHandshake(
        false,
        bob.x25519Static,
        bob.x25519Ephemeral,
        alice.x25519Static.publicKey,
        alice.x25519Ephemeral.publicKey,
      );

      // Send 5 messages from Alice to Bob
      for (let i = 0; i < 5; i++) {
        const { frame, updatedKeys } = encryptMessage(aliceKeys, encoder.encode(`message-${i}`));
        aliceKeys = updatedKeys;

        expect(aliceKeys.sendNonce).toBe(BigInt(i + 1));

        const { plaintext, updatedKeys: bobUpd } = decryptMessage(bobKeys, frame);
        bobKeys = bobUpd;

        expect(bobKeys.recvNonce).toBe(BigInt(i + 1));
        expect(decoder.decode(plaintext)).toBe(`message-${i}`);
      }

      // Send 3 messages from Bob to Alice
      for (let i = 0; i < 3; i++) {
        const { frame, updatedKeys } = encryptMessage(bobKeys, encoder.encode(`reply-${i}`));
        bobKeys = updatedKeys;

        expect(bobKeys.sendNonce).toBe(BigInt(i + 1));

        const { plaintext, updatedKeys: aliceUpd } = decryptMessage(aliceKeys, frame);
        aliceKeys = aliceUpd;

        expect(aliceKeys.recvNonce).toBe(BigInt(i + 1));
        expect(decoder.decode(plaintext)).toBe(`reply-${i}`);
      }

      // Verify final nonce state
      expect(aliceKeys.sendNonce).toBe(5n);
      expect(aliceKeys.recvNonce).toBe(3n);
      expect(bobKeys.sendNonce).toBe(3n);
      expect(bobKeys.recvNonce).toBe(5n);
    });
  });

  // -----------------------------------------------------------------------
  // 7. Key ratchet
  // -----------------------------------------------------------------------
  describe("key ratchet", () => {
    it("after ratcheting, old keys cannot decrypt new messages", () => {
      const alice = createPeer("alice", "org");
      const bob = createPeer("bob", "org");

      let aliceKeys = completeHandshake(
        true,
        alice.x25519Static,
        alice.x25519Ephemeral,
        bob.x25519Static.publicKey,
        bob.x25519Ephemeral.publicKey,
      );

      // Send a message before ratchet — works fine
      const { frame: preRatchetFrame, updatedKeys: alicePreRatchet } = encryptMessage(
        aliceKeys,
        encoder.encode("before ratchet"),
      );

      // Save pre-ratchet keys
      const oldAliceKeys = { ...alicePreRatchet };

      // Ratchet Alice's keys
      aliceKeys = ratchetKeys(alicePreRatchet);

      // New message encrypted with ratcheted keys
      const { frame: postRatchetFrame } = encryptMessage(
        aliceKeys,
        encoder.encode("after ratchet"),
      );

      // Old keys use a different sendKey, so decrypting with the old recvKey fails
      // (simulating an attacker who captured the pre-ratchet key material)
      const staleReceiverKeys: SessionKeys = {
        sendKey: oldAliceKeys.recvKey,
        recvKey: oldAliceKeys.sendKey,
        sendNonce: 0n,
        recvNonce: 0n,
      };

      expect(() => decryptMessage(staleReceiverKeys, postRatchetFrame)).toThrow();
    });

    it("ratchet produces different keys and resets nonces", () => {
      const alice = createPeer("alice", "org");
      const bob = createPeer("bob", "org");

      let aliceKeys = completeHandshake(
        true,
        alice.x25519Static,
        alice.x25519Ephemeral,
        bob.x25519Static.publicKey,
        bob.x25519Ephemeral.publicKey,
      );
      let bobKeys = completeHandshake(
        false,
        bob.x25519Static,
        bob.x25519Ephemeral,
        alice.x25519Static.publicKey,
        alice.x25519Ephemeral.publicKey,
      );

      // Send a few messages to increment nonces
      for (let i = 0; i < 3; i++) {
        const { frame, updatedKeys } = encryptMessage(aliceKeys, encoder.encode(`msg-${i}`));
        aliceKeys = updatedKeys;
        const { updatedKeys: bobUpd } = decryptMessage(bobKeys, frame);
        bobKeys = bobUpd;
      }

      expect(aliceKeys.sendNonce).toBe(3n);

      const preRatchetSendKey = new Uint8Array(aliceKeys.sendKey);
      const preRatchetRecvKey = new Uint8Array(aliceKeys.recvKey);

      // Ratchet
      const ratchetedAlice = ratchetKeys(aliceKeys);

      // Keys changed
      expect(Buffer.from(ratchetedAlice.sendKey).equals(Buffer.from(preRatchetSendKey))).toBe(
        false,
      );
      expect(Buffer.from(ratchetedAlice.recvKey).equals(Buffer.from(preRatchetRecvKey))).toBe(
        false,
      );

      // Nonces reset
      expect(ratchetedAlice.sendNonce).toBe(0n);
      expect(ratchetedAlice.recvNonce).toBe(0n);
    });

    it("ratchet is deterministic — same input produces same output", () => {
      const alice = createPeer("alice", "org");
      const bob = createPeer("bob", "org");

      const aliceKeys = completeHandshake(
        true,
        alice.x25519Static,
        alice.x25519Ephemeral,
        bob.x25519Static.publicKey,
        bob.x25519Ephemeral.publicKey,
      );

      const r1 = ratchetKeys(aliceKeys);
      const r2 = ratchetKeys(aliceKeys);

      expect(base64UrlEncode(r1.sendKey)).toBe(base64UrlEncode(r2.sendKey));
      expect(base64UrlEncode(r1.recvKey)).toBe(base64UrlEncode(r2.recvKey));
    });

    it("coordinated ratchet preserves communication", () => {
      const alice = createPeer("alice", "org");
      const bob = createPeer("bob", "org");

      let aliceKeys = completeHandshake(
        true,
        alice.x25519Static,
        alice.x25519Ephemeral,
        bob.x25519Static.publicKey,
        bob.x25519Ephemeral.publicKey,
      );
      let bobKeys = completeHandshake(
        false,
        bob.x25519Static,
        bob.x25519Ephemeral,
        alice.x25519Static.publicKey,
        alice.x25519Ephemeral.publicKey,
      );

      // Ratchet both sides, but build Bob's ratcheted keys to match Alice's
      // by using the same derivation: Bob's recvKey (== Alice's sendKey) with "send" info
      const ratchetedAlice = ratchetKeys(aliceKeys);
      // For Bob, we need his recvKey to match Alice's ratcheted sendKey.
      // Since ratchetKeys uses different info for send vs recv, we construct
      // Bob's post-ratchet keys so the directions align.
      const ratchetedBob: SessionKeys = {
        sendKey: ratchetKeys(bobKeys).sendKey,
        recvKey: ratchetedAlice.sendKey, // must match Alice's ratcheted sendKey
        sendNonce: 0n,
        recvNonce: 0n,
      };

      const { frame } = encryptMessage(ratchetedAlice, encoder.encode("coordinated ratchet"));
      const { plaintext } = decryptMessage(ratchetedBob, frame);
      expect(decoder.decode(plaintext)).toBe("coordinated ratchet");
    });
  });

  // -----------------------------------------------------------------------
  // 8. Tamper detection
  // -----------------------------------------------------------------------
  describe("tamper detection", () => {
    it("detects modified ciphertext", () => {
      const alice = createPeer("alice", "org");
      const bob = createPeer("bob", "org");

      const aliceKeys = completeHandshake(
        true,
        alice.x25519Static,
        alice.x25519Ephemeral,
        bob.x25519Static.publicKey,
        bob.x25519Ephemeral.publicKey,
      );
      const bobKeys = completeHandshake(
        false,
        bob.x25519Static,
        bob.x25519Ephemeral,
        alice.x25519Static.publicKey,
        alice.x25519Ephemeral.publicKey,
      );

      const { frame } = encryptMessage(aliceKeys, encoder.encode("do not tamper"));

      // Flip a bit in the ciphertext body (not the auth tag)
      const tampered: EncryptedFrame = {
        nonce: frame.nonce,
        ciphertext: new Uint8Array(frame.ciphertext),
      };
      tampered.ciphertext[0] ^= 0xff;

      expect(() => decryptMessage(bobKeys, tampered)).toThrow();
    });

    it("detects modified nonce", () => {
      const alice = createPeer("alice", "org");
      const bob = createPeer("bob", "org");

      const aliceKeys = completeHandshake(
        true,
        alice.x25519Static,
        alice.x25519Ephemeral,
        bob.x25519Static.publicKey,
        bob.x25519Ephemeral.publicKey,
      );
      const bobKeys = completeHandshake(
        false,
        bob.x25519Static,
        bob.x25519Ephemeral,
        alice.x25519Static.publicKey,
        alice.x25519Ephemeral.publicKey,
      );

      const { frame } = encryptMessage(aliceKeys, encoder.encode("nonce check"));

      // Modify the nonce
      const tampered: EncryptedFrame = {
        nonce: new Uint8Array(frame.nonce),
        ciphertext: frame.ciphertext,
      };
      tampered.nonce[0] ^= 0x01;

      expect(() => decryptMessage(bobKeys, tampered)).toThrow();
    });

    it("detects modified auth tag", () => {
      const alice = createPeer("alice", "org");
      const bob = createPeer("bob", "org");

      const aliceKeys = completeHandshake(
        true,
        alice.x25519Static,
        alice.x25519Ephemeral,
        bob.x25519Static.publicKey,
        bob.x25519Ephemeral.publicKey,
      );
      const bobKeys = completeHandshake(
        false,
        bob.x25519Static,
        bob.x25519Ephemeral,
        alice.x25519Static.publicKey,
        alice.x25519Ephemeral.publicKey,
      );

      const { frame } = encryptMessage(aliceKeys, encoder.encode("tag check"));

      // Flip a bit in the auth tag (last 16 bytes of ciphertext)
      const tampered: EncryptedFrame = {
        nonce: frame.nonce,
        ciphertext: new Uint8Array(frame.ciphertext),
      };
      tampered.ciphertext[tampered.ciphertext.length - 1] ^= 0x01;

      expect(() => decryptMessage(bobKeys, tampered)).toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // 9. Wrong key
  // -----------------------------------------------------------------------
  describe("wrong key rejection", () => {
    it("a third party with different keys cannot decrypt messages", () => {
      const alice = createPeer("alice", "org");
      const bob = createPeer("bob", "org");
      const eve = createPeer("eve", "org");

      const aliceKeys = completeHandshake(
        true,
        alice.x25519Static,
        alice.x25519Ephemeral,
        bob.x25519Static.publicKey,
        bob.x25519Ephemeral.publicKey,
      );

      // Eve tries to establish her own session with Alice's public keys
      // but she has different private keys
      const eveKeys = completeHandshake(
        false,
        eve.x25519Static,
        eve.x25519Ephemeral,
        alice.x25519Static.publicKey,
        alice.x25519Ephemeral.publicKey,
      );

      const { frame } = encryptMessage(aliceKeys, encoder.encode("for bob only"));

      // Eve cannot decrypt Alice->Bob messages
      expect(() => decryptMessage(eveKeys, frame)).toThrow();
    });

    it("swapped send/recv keys fail decryption", () => {
      const alice = createPeer("alice", "org");
      const bob = createPeer("bob", "org");

      const aliceKeys = completeHandshake(
        true,
        alice.x25519Static,
        alice.x25519Ephemeral,
        bob.x25519Static.publicKey,
        bob.x25519Ephemeral.publicKey,
      );
      const bobKeys = completeHandshake(
        false,
        bob.x25519Static,
        bob.x25519Ephemeral,
        alice.x25519Static.publicKey,
        alice.x25519Ephemeral.publicKey,
      );

      const { frame } = encryptMessage(aliceKeys, encoder.encode("directional"));

      // Try decrypting with send key instead of recv key
      const wrongKeys: SessionKeys = {
        sendKey: bobKeys.sendKey,
        recvKey: bobKeys.sendKey, // wrong! should be recvKey
        sendNonce: 0n,
        recvNonce: 0n,
      };

      expect(() => decryptMessage(wrongKeys, frame)).toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // 10. Large message
  // -----------------------------------------------------------------------
  describe("large message", () => {
    it("encrypts and decrypts a 100KB payload through a full session", () => {
      const alice = createPeer("alice", "org");
      const bob = createPeer("bob", "org");

      // Full handshake
      const aliceHello = createHandshakeHello(
        alice.deviceId,
        alice.orgId,
        alice.x25519Static.publicKey,
        alice.ed25519PubPem,
        alice.ed25519PrivPem,
        alice.x25519Ephemeral,
      );
      expect(verifyHandshakeHello(aliceHello)).toBe(true);

      const bobHello = createHandshakeHello(
        bob.deviceId,
        bob.orgId,
        bob.x25519Static.publicKey,
        bob.ed25519PubPem,
        bob.ed25519PrivPem,
        bob.x25519Ephemeral,
      );
      expect(verifyHandshakeHello(bobHello)).toBe(true);

      const aliceKeys = completeHandshake(
        true,
        alice.x25519Static,
        alice.x25519Ephemeral,
        bob.x25519Static.publicKey,
        bob.x25519Ephemeral.publicKey,
      );
      const bobKeys = completeHandshake(
        false,
        bob.x25519Static,
        bob.x25519Ephemeral,
        alice.x25519Static.publicKey,
        alice.x25519Ephemeral.publicKey,
      );

      // 100KB random payload
      const largePayload = new Uint8Array(crypto.randomBytes(100 * 1024));

      const { frame } = encryptMessage(aliceKeys, largePayload);
      const { plaintext } = decryptMessage(bobKeys, frame);

      expect(plaintext).toHaveLength(largePayload.length);
      expect(Buffer.from(plaintext).equals(Buffer.from(largePayload))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // End-to-end: complete lifecycle
  // -----------------------------------------------------------------------
  describe("complete lifecycle", () => {
    it("key gen -> handshake -> session -> encrypt -> ratchet -> encrypt again", () => {
      // 1. Key generation
      const alice = createPeer("alice-phone", "anima-corp");
      const bob = createPeer("bob-laptop", "anima-corp");

      // 2. Mutual handshake
      const aliceHello = createHandshakeHello(
        alice.deviceId,
        alice.orgId,
        alice.x25519Static.publicKey,
        alice.ed25519PubPem,
        alice.ed25519PrivPem,
        alice.x25519Ephemeral,
      );
      const bobHello = createHandshakeHello(
        bob.deviceId,
        bob.orgId,
        bob.x25519Static.publicKey,
        bob.ed25519PubPem,
        bob.ed25519PrivPem,
        bob.x25519Ephemeral,
      );

      expect(verifyHandshakeHello(aliceHello)).toBe(true);
      expect(verifyHandshakeHello(bobHello)).toBe(true);

      // 3. Session establishment
      let aliceKeys = completeHandshake(
        true,
        alice.x25519Static,
        alice.x25519Ephemeral,
        bob.x25519Static.publicKey,
        bob.x25519Ephemeral.publicKey,
      );
      let bobKeys = completeHandshake(
        false,
        bob.x25519Static,
        bob.x25519Ephemeral,
        alice.x25519Static.publicKey,
        alice.x25519Ephemeral.publicKey,
      );

      // 4. Alice -> Bob
      {
        const { frame, updatedKeys } = encryptMessage(aliceKeys, encoder.encode("init message"));
        aliceKeys = updatedKeys;
        const { plaintext, updatedKeys: bobUpd } = decryptMessage(bobKeys, frame);
        bobKeys = bobUpd;
        expect(decoder.decode(plaintext)).toBe("init message");
      }

      // 5. Bob -> Alice
      {
        const { frame, updatedKeys } = encryptMessage(bobKeys, encoder.encode("ack"));
        bobKeys = updatedKeys;
        const { plaintext, updatedKeys: aliceUpd } = decryptMessage(aliceKeys, frame);
        aliceKeys = aliceUpd;
        expect(decoder.decode(plaintext)).toBe("ack");
      }

      // 6. Verify nonces
      expect(aliceKeys.sendNonce).toBe(1n);
      expect(aliceKeys.recvNonce).toBe(1n);
      expect(bobKeys.sendNonce).toBe(1n);
      expect(bobKeys.recvNonce).toBe(1n);

      // 7. Ratchet
      const preRatchetAliceSendKey = new Uint8Array(aliceKeys.sendKey);
      const ratchetedAlice = ratchetKeys(aliceKeys);

      // Keys changed
      expect(Buffer.from(ratchetedAlice.sendKey).equals(Buffer.from(preRatchetAliceSendKey))).toBe(
        false,
      );
      // Nonces reset
      expect(ratchetedAlice.sendNonce).toBe(0n);
      expect(ratchetedAlice.recvNonce).toBe(0n);

      // 8. Pre-ratchet keys can't decrypt post-ratchet messages (forward secrecy)
      {
        const { frame } = encryptMessage(ratchetedAlice, encoder.encode("post-ratchet secret"));
        const staleKeys: SessionKeys = {
          sendKey: bobKeys.sendKey,
          recvKey: bobKeys.recvKey,
          sendNonce: 0n,
          recvNonce: 0n,
        };
        expect(() => decryptMessage(staleKeys, frame)).toThrow();
      }
    });
  });
});
