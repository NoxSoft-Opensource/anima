# ANIMA Authentication Flow

Complete reference for ANIMA's authentication and authorization architecture.

---

## Overview

ANIMA uses a layered auth model:

1. **Agent auth** -- Anthropic API token stored locally, used for AI inference
2. **Gateway auth** -- WebSocket connection auth between clients (Control UI, TUI, nodes) and the gateway
3. **Device pairing** -- Ed25519 keypair-based device identity for persistent trust

---

## 1. Setup Token Flow (Agent Auth)

The `anima setup-token` command provisions the Anthropic API credential that powers all agent turns.

### Token Formats

| Format             | Source                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `sk-ant-api01-...` | Anthropic Console API key ([console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)) |
| `sk-ant-oat01-...` | Claude Code OAuth access token (from `claude login`)                                                           |

### Auto-Detection Priority

When no token is passed explicitly, ANIMA checks these sources in order:

1. `ANTHROPIC_API_KEY` environment variable
2. `CLAUDE_API_KEY` environment variable
3. Claude Code CLI credentials (macOS Keychain / Windows Credential Manager / file)
4. Legacy OpenClaw `auth-profiles.json`

### Storage

Tokens are saved to the auth profile store:

```
~/.anima/agents/main/agent/auth-profiles.json
```

Profile ID: `anthropic:default`

### Validation

By default, `setup-token` sends a minimal request to `https://api.anthropic.com/v1/messages` to verify the token works. Pass `--skip-validation` to skip this check (useful offline or in CI).

### Non-Interactive Mode

For scripting and CI:

```bash
anima setup-token --token sk-ant-api01-... --json
# Output: {"ok":true,"profileId":"anthropic:default"}
```

---

## 2. Gateway Auth Flow

The gateway is ANIMA's WebSocket server. Clients authenticate during the WebSocket connect handshake.

### Auth Modes

Configured via `gateway.auth.mode` in `anima.json5`:

| Mode            | Description                                                               |
| --------------- | ------------------------------------------------------------------------- |
| `none`          | No auth required (localhost only, default)                                |
| `token`         | Shared secret token (`gateway.auth.token` or `ANIMA_GATEWAY_TOKEN` env)   |
| `password`      | Shared password (`gateway.auth.password` or `ANIMA_GATEWAY_PASSWORD` env) |
| `trusted-proxy` | Reverse proxy provides user identity via headers                          |

### Tailscale Auth

When `gateway.tailscale.mode` is `"serve"`, Tailscale identity headers are accepted as an auth method. The gateway verifies the identity via `tailscale whois` to prevent header spoofing.

### Rate Limiting

Failed auth attempts are rate-limited per IP:

- **Max attempts**: 10 per window (configurable via `gateway.auth.rateLimit.maxAttempts`)
- **Window**: 60 seconds (`gateway.auth.rateLimit.windowMs`)
- **Lockout**: 5 minutes (`gateway.auth.rateLimit.lockoutMs`)
- Loopback addresses are exempt by default (`gateway.auth.rateLimit.exemptLoopback`)

### Trusted Proxy Auth

For deployments behind identity-aware proxies (Pomerium, Caddy + OAuth, etc.):

```json5
{
  gateway: {
    auth: {
      mode: "trusted-proxy",
      trustedProxy: {
        userHeader: "x-forwarded-user",
        requiredHeaders: ["x-forwarded-proto"],
        allowUsers: ["admin@example.com"],
      },
    },
    trustedProxies: ["127.0.0.1", "10.0.0.1"],
  },
}
```

---

## 3. WebSocket Connect Handshake

Every client must send a `connect` request as its first WebSocket message.

### Connect Request

```json
{
  "type": "req",
  "id": "unique-id",
  "method": "connect",
  "params": {
    "minProtocol": 1,
    "maxProtocol": 1,
    "client": {
      "id": "control-ui",
      "version": "3.1.0",
      "platform": "darwin",
      "mode": "web"
    },
    "role": "operator",
    "scopes": ["operator.admin"],
    "auth": {
      "token": "your-gateway-token"
    },
    "device": {
      "id": "<sha256-fingerprint-of-public-key>",
      "publicKey": "<base64url-ed25519-public-key>",
      "signature": "<base64url-ed25519-signature>",
      "signedAt": 1709827200000,
      "nonce": "<server-provided-nonce>"
    }
  }
}
```

### Connect Response (Success)

```json
{
  "type": "res",
  "id": "unique-id",
  "ok": true,
  "payload": {
    "type": "hello-ok",
    "protocol": 1,
    "server": {
      "version": "3.1.0",
      "host": "hostname",
      "connId": "conn-uuid"
    },
    "features": {
      "methods": ["chat.send", "chat.history", "..."],
      "events": ["chat.delta", "health.changed", "..."]
    },
    "snapshot": { "...": "current gateway state" },
    "auth": {
      "deviceToken": "issued-device-token",
      "role": "operator",
      "scopes": ["operator.admin"]
    },
    "policy": {
      "maxPayload": 1048576,
      "maxBufferedBytes": 4194304,
      "tickIntervalMs": 5000
    }
  }
}
```

### Protocol Negotiation

The client sends `minProtocol` and `maxProtocol`. The server checks compatibility with its current `PROTOCOL_VERSION`. Mismatches close the connection with code 1002.

### Roles

| Role       | Description                         |
| ---------- | ----------------------------------- |
| `operator` | Human operator or Control UI client |
| `node`     | SVRN compute node                   |

### Scopes

| Scope                | Access                                                       |
| -------------------- | ------------------------------------------------------------ |
| `operator.admin`     | Full access to all methods                                   |
| `operator.read`      | Read-only methods (health, status, logs, chat history, etc.) |
| `operator.write`     | Write methods (send messages, agent runs, config changes)    |
| `operator.approvals` | Exec approval management                                     |
| `operator.pairing`   | Device and node pairing management                           |

---

## 4. Device Pairing Flow

Device pairing provides persistent trust between the gateway and a client device, eliminating the need to send the shared secret after initial pairing.

### Key Generation (Client-Side)

The Control UI generates an Ed25519 keypair using WebCrypto:

1. `crypto.subtle.generateKey({ name: "Ed25519" })` creates the keypair
2. The public key raw bytes are SHA-256 hashed to produce the `deviceId`
3. The keypair is stored in `localStorage` under `anima.gateway.device-identity.v1`

### Signature Payload

The client signs a structured payload to prove key ownership:

```
v2|<deviceId>|<clientId>|<clientMode>|<role>|<scopes>|<signedAtMs>|<token>|<nonce>
```

- `signedAt` must be within 10 minutes of server time
- Remote (non-loopback) connections must include the server's `nonce` (v2 format)
- Local (loopback) connections may omit the nonce (v1 format for backward compatibility)

### Pairing Lifecycle

1. Client sends `connect` with `device` field containing `id`, `publicKey`, `signature`, `signedAt`
2. Gateway verifies the signature and derives `deviceId` from the public key
3. If the device is not yet paired:
   - **Local connections**: Auto-approved silently
   - **Remote connections**: A pairing request is created and broadcast; the connection is closed with `NOT_PAIRED` until approved
4. If the device is paired but requests new roles/scopes: Re-pairing is triggered
5. On successful connect, the gateway issues a `deviceToken` in the hello response

### Device Tokens

After pairing, the gateway issues a device-specific token. On subsequent connections, the client can authenticate with this token instead of the shared gateway secret. Device tokens are:

- Scoped to the device's approved role and scopes
- Rotatable via `device.token.rotate` RPC
- Revocable via `device.token.revoke` RPC

---

## 5. Token Storage Locations

| Token                   | Location                                                          | Purpose                                   |
| ----------------------- | ----------------------------------------------------------------- | ----------------------------------------- |
| Anthropic API key       | `~/.anima/agents/main/agent/auth-profiles.json`                   | AI inference                              |
| NoxSoft agent token     | `~/.noxsoft-agent-token`                                          | NoxSoft platform auth (chat, email, etc.) |
| Gateway token           | `anima.json5` (`gateway.auth.token`) or `ANIMA_GATEWAY_TOKEN` env | Gateway connection auth                   |
| Device identity         | Browser `localStorage` (`anima.gateway.device-identity.v1`)       | Client device keypair                     |
| Gateway auth token (UI) | Browser `localStorage` (`anima.gateway.token`)                    | Cached gateway token in Control UI        |

---

## 6. Security Properties

- **Constant-time comparison**: All token/password checks use `crypto.timingSafeEqual` to prevent timing attacks
- **Rate limiting**: Per-IP sliding window with lockout for failed auth attempts
- **Origin checking**: Control UI and WebChat connections validate browser `Origin` header against the gateway host
- **Nonce replay prevention**: Remote device signatures include a server-generated nonce unique to each connection
- **Signature expiry**: Device signatures expire after 10 minutes
- **Proxy awareness**: Untrusted proxy headers are detected and logged; connections through untrusted proxies are not treated as local

---

_This document is maintained by [NoxSoft DAO LLC](https://noxsoft.dev) as part of the ANIMA security documentation._
