# ANIMA Security Audit Report

**Date:** 2026-03-07
**Scope:** @noxsoft/anima v3.1.0 — full source audit (read-only)
**Auditor:** Automated code review (Claude Opus 4.6)

---

## Executive Summary

The ANIMA codebase demonstrates strong security awareness across most areas. The project includes a built-in security audit system (`src/security/audit.ts`), SSRF protection with DNS pinning, timing-safe secret comparison, rate limiting on auth, device identity via Ed25519, external content wrapping for prompt injection defense, and command injection prevention. The most significant findings are around timing side-channels in secret comparison, token exposure in URL fragments, and the `allowUnsafeExternalContent` escape hatch.

**Totals:** 3 CRITICAL, 5 HIGH, 6 MEDIUM, 5 LOW, 6 INFO

---

## CRITICAL

### C-1: Timing side-channel in `safeEqualSecret` on length mismatch

**File:** `/Users/grimreaper/Desktop/hell/anima/src/security/secret-equal.ts`, lines 12-13
**Description:** When `providedBuffer.length !== expectedBuffer.length`, the function returns `false` immediately. This leaks the expected secret's length through timing differences. An attacker who can measure response times precisely (e.g., over a local network or via repeated requests) can determine the exact length of the gateway token/password, reducing brute-force search space.

```typescript
if (providedBuffer.length !== expectedBuffer.length) {
  return false; // leaks expected length via timing
}
```

**Recommended fix:** Pad both buffers to the same length (the maximum of the two) before calling `timingSafeEqual`, or hash both values with a fixed-output-length function (e.g., SHA-256) before comparing:

```typescript
const providedHash = crypto.createHash("sha256").update(provided).digest();
const expectedHash = crypto.createHash("sha256").update(expected).digest();
return timingSafeEqual(providedHash, expectedHash);
```

### C-2: Gateway token exposed in URL fragment during onboarding and CLI

**File:** `/Users/grimreaper/Desktop/hell/anima/src/wizard/onboarding.finalize.ts`, line 256
**File:** `/Users/grimreaper/Desktop/hell/anima/src/cli/gateway-cli/run.ts`, lines 342-345
**Description:** The gateway auth token is appended to dashboard URLs as a fragment (`#token=...`). While fragments are not sent to the server in HTTP requests, they are:

- Visible in browser history
- Logged by browser extensions
- Visible in the address bar (shoulder surfing)
- Potentially captured by `window.location.href` in any JS running on the page
- Stored in localStorage on the client side

This is the primary bootstrap credential for the gateway. If leaked, an attacker gains full gateway access.

**Recommended fix:** Use a short-lived session cookie set via a one-time login endpoint instead of embedding the token in the URL. If fragment-based passing is required for the initial bootstrap, clear the fragment from `window.location` immediately after reading it.

### C-3: `allowUnsafeExternalContent` bypasses prompt injection defenses

**File:** `/Users/grimreaper/Desktop/hell/anima/src/gateway/server-http.ts`, line 79
**File:** `/Users/grimreaper/Desktop/hell/anima/src/gateway/hooks-mapping.ts`, lines 110, 124, 213
**Description:** The `allowUnsafeExternalContent` flag in hook mappings and agent payloads bypasses the external content wrapping (`wrapExternalContent`). When set to `true`, external content from emails/webhooks is passed directly to the LLM without the security boundary markers or injection warnings. This is configurable per-hook-mapping and also exposed via the Gmail hook config (`hooks.gmail.allowUnsafeExternalContent`).

If a hook mapping enables this flag, all prompt injection defenses for that channel are disabled. An attacker who can send an email to a Gmail-hooked address could inject arbitrary instructions into the agent.

**Recommended fix:** Remove this flag entirely, or at minimum: (1) add a security audit finding when it is enabled, (2) require an additional confirmation flag like `dangerouslyAllowUnsafeExternalContent`, (3) log a warning on every invocation where it is active.

---

## HIGH

### H-1: Rate limiter exempts all loopback connections

**File:** `/Users/grimreaper/Desktop/hell/anima/src/gateway/auth-rate-limit.ts`, lines 119-121, 88
**Description:** The `exemptLoopback` setting (default: `true`) means any process on the same machine can brute-force gateway authentication without rate limiting. This is by design for CLI convenience, but in shared-server environments (multi-user Linux boxes, CI runners, containers with shared network namespaces), any local process can enumerate tokens without throttling.

**Recommended fix:** Consider making `exemptLoopback` default to `false` when `gateway.bind` is not loopback, or when running in container/CI environments. Document the risk in security docs.

### H-2: Control UI serves static files without authentication

**File:** `/Users/grimreaper/Desktop/hell/anima/src/gateway/server-http.ts`, lines 564-582
**File:** `/Users/grimreaper/Desktop/hell/anima/src/gateway/control-ui.ts`, lines 154-161
**Description:** The `handleControlUiHttpRequest` function serves static UI files (HTML, JS, CSS, images) without any authentication check. While the WebSocket connection requires auth, the static files themselves are served to any requester. This means:

- The UI bundle (JavaScript) is accessible without auth, potentially revealing internal API structures
- The injected config (`__ANIMA_ASSISTANT_NAME__`, `__ANIMA_ASSISTANT_AVATAR__`) is accessible
- Avatar images are served without auth

This is standard for SPA architectures but worth noting since the UI contains gateway connection logic.

**Recommended fix:** Consider gating static asset serving behind the same auth as the WebSocket when `gateway.bind` is not loopback, or ensure the UI JavaScript does not embed sensitive information.

### H-3: Canvas request authorization falls back to IP-based matching

**File:** `/Users/grimreaper/Desktop/hell/anima/src/gateway/server-http.ts`, lines 99-156
**Description:** The `authorizeCanvasRequest` function, after token auth fails, falls back to checking if the requesting IP has an existing authorized WebSocket client (`hasAuthorizedWsClientForIp`). While restricted to private/loopback IPs, this means any process on the same private network that shares an IP with a legitimate client can access canvas resources without credentials. In corporate NAT environments, multiple machines may share the same external IP.

The code does check `isPrivateOrLoopbackAddress` (line 149), but private RFC1918 addresses can be shared across many hosts behind NAT.

**Recommended fix:** Restrict the IP-based fallback to loopback addresses only (not all private addresses). Or require explicit token auth for canvas requests.

### H-4: Auth profile store written without restrictive permissions

**File:** `/Users/grimreaper/Desktop/hell/anima/src/agents/auth-profiles/store.ts`, line 345
**Description:** The `saveAuthProfileStore` function calls `saveJsonFile` which writes the auth profile store (containing API keys, OAuth tokens, and access tokens) to disk. The file is written via a generic JSON utility without explicitly setting `0o600` permissions. While the device identity file (`device-identity.ts`, line 116) explicitly uses `mode: 0o600`, the auth profile store may inherit the default umask, potentially making tokens readable by other users on the system.

**Recommended fix:** Ensure `saveJsonFile` (or the auth store writer) explicitly sets file permissions to `0o600` on creation and write.

### H-5: Device signature skew window is 10 minutes

**File:** `/Users/grimreaper/Desktop/hell/anima/src/gateway/server/ws-connection/message-handler.ts`, line 69
**Description:** `DEVICE_SIGNATURE_SKEW_MS = 10 * 60 * 1000` (10 minutes) allows signatures that are up to 10 minutes old. This is a generous window that increases the replay window for captured device auth payloads. If an attacker captures a signed connect payload (e.g., via network sniffing on HTTP), they have 10 minutes to replay it.

The v2 payload includes a server-issued nonce (required for non-local connections), which mitigates this. However, for local connections, nonces are optional (line 519: `const nonceRequired = !isLocalClient`), and the legacy v1 path (lines 566-594) doesn't require nonces at all.

**Recommended fix:** Reduce skew to 2-3 minutes. Deprecate the v1 legacy signature path. Require nonces for all connections regardless of local status.

---

## MEDIUM

### M-1: `testAnthropicToken` treats non-auth errors as valid tokens

**File:** `/Users/grimreaper/Desktop/hell/anima/src/agents/anthropic-direct-runner.ts`, line 343
**Description:** The `testAnthropicToken` function returns `{ ok: true }` for any HTTP status that is not 401/403. This means a 400, 500, 502, etc. response is treated as "token is valid." While the comment says "Other errors = token may be fine, network issue," this could mask an invalid token behind transient server errors, giving users false confidence.

**Recommended fix:** Return a distinct `{ ok: true, warning: "..." }` for ambiguous status codes, or only treat 200 and 529 as definitive success.

### M-2: Session history files written without restrictive permissions

**File:** `/Users/grimreaper/Desktop/hell/anima/src/agents/anthropic-direct-runner.ts`, lines 74-79
**Description:** The `saveSessionHistory` function writes conversation history (potentially containing sensitive user prompts and AI responses) to disk using `fs.writeFile` without specifying file permissions. These files may be world-readable depending on the umask.

**Recommended fix:** Use `{ mode: 0o600 }` in the `writeFile` options.

### M-3: Hook token query parameter rejection is informational leakage

**File:** `/Users/grimreaper/Desktop/hell/anima/src/gateway/server-http.ts`, lines 264-270
**Description:** When a hook request includes a `?token=` query parameter, the server returns a 400 with a detailed message explaining that tokens must be provided via `Authorization: Bearer` or `X-Anima-Token` header. While this is good UX, it confirms to an attacker that this is an ANIMA gateway and leaks the exact header names accepted for authentication.

**Recommended fix:** Return a generic 400 without revealing accepted authentication methods. Log the detailed guidance server-side.

### M-4: Private key stored unencrypted in localStorage (browser)

**File:** `/Users/grimreaper/Desktop/hell/anima/ui/src/gateway-connect.ts`, lines 89-131
**Description:** The browser device identity (Ed25519 private key) is stored in `window.localStorage` as a JSON-serialized PKCS8 key. localStorage is accessible to any JavaScript running on the same origin, is not encrypted at rest, and persists indefinitely. An XSS vulnerability on the gateway domain would expose the device private key.

**Recommended fix:** Use the Web Crypto API's non-extractable key storage where possible (generate with `extractable: false`). If the key must be extractable for the signature operation, consider using IndexedDB with a short TTL, or encrypt the key with a user-derived secret.

### M-5: Control UI `injectControlUiConfig` does not escape values for XSS

**File:** `/Users/grimreaper/Desktop/hell/anima/src/gateway/control-ui.ts`, lines 169-190
**Description:** The `injectControlUiConfig` function injects configuration values into HTML using `JSON.stringify`. While `JSON.stringify` escapes double quotes and backslashes, it does not escape `</script>` sequences or HTML entities within string values. If `assistantName` or `assistantAvatar` contains a `</script>` tag, it could break out of the script context.

```typescript
`window.__ANIMA_ASSISTANT_NAME__=${JSON.stringify(assistantName ?? ...)};`
```

A malicious config value like `</script><script>alert(1)</script>` would close the script tag and inject arbitrary JavaScript.

**Recommended fix:** Use a safe serializer that escapes `</script>`, `<!--`, and other HTML-significant sequences within JSON strings. A common approach is to replace `<` with `\u003c` in the JSON output.

### M-6: `shouldSpawnWithShell` always returns false, even when shell is needed

**File:** `/Users/grimreaper/Desktop/hell/anima/src/process/exec.ts`, lines 32-43
**Description:** The function always returns `false` with a security comment explaining why. This is correct from a security perspective (preventing command injection via shell metacharacters). However, the `runCommandWithTimeout` function (line 140-143) still conditionally spreads `{ shell: true }` based on this function's return value. If this function's behavior is ever changed or if there's a code path that sets shell independently, it could introduce command injection. The dead code path (`{ shell: true }`) should be removed entirely to prevent future mistakes.

**Recommended fix:** Remove the conditional shell spread entirely since `shouldSpawnWithShell` always returns `false`. This eliminates a potential future footgun.

---

## LOW

### L-1: In-memory rate limiter does not survive gateway restart

**File:** `/Users/grimreaper/Desktop/hell/anima/src/gateway/auth-rate-limit.ts`, lines 84-90
**Description:** The rate limiter uses an in-memory `Map`. If the gateway process restarts (crash, update, manual restart), all rate-limit state is lost. An attacker can force a restart (e.g., by triggering an unhandled error) to reset rate limits.

**Recommended fix:** For production deployments, consider persisting rate-limit state to the filesystem or using a short-lived on-disk cache.

### L-2: Legacy v1 device auth signature path remains active

**File:** `/Users/grimreaper/Desktop/hell/anima/src/gateway/server/ws-connection/message-handler.ts`, lines 565-594
**Description:** When a v2 signature verification fails on a local connection, the code falls back to trying v1 signature verification (without nonce). This backward-compatibility path weakens security for local connections by accepting signatures without server-issued nonces.

**Recommended fix:** Set a deprecation timeline for v1 signatures and log a warning when the legacy path is used. Eventually remove it.

### L-3: Error logging in hooks may leak internal state

**File:** `/Users/grimreaper/Desktop/hell/anima/src/gateway/server/hooks.ts`, line 97
**Description:** Hook execution errors are logged with `String(err)`, which may include stack traces and internal file paths. While this is server-side logging (not exposed to clients), if log files are accessible to other users or shipped to a logging service, they could reveal internal architecture details.

**Recommended fix:** Sanitize error messages in logs to remove stack traces and file paths in production mode.

### L-4: `setup-token` logs masked token but reveals length characteristics

**File:** `/Users/grimreaper/Desktop/hell/anima/src/commands/setup-token.ts`, lines 116, 222
**Description:** The masked token display shows the first 16 characters plus the last 4 characters. This reveals the approximate total length of the token and a significant prefix, which could help narrow down the token's format or origin.

**Recommended fix:** Show fewer characters (e.g., first 8 + last 4) or use a fixed-width mask regardless of token length.

### L-5: `pnpm.overrides` pins some dependencies but not all

**File:** `/Users/grimreaper/Desktop/hell/anima/package.json`, lines 200-207
**Description:** The `pnpm.overrides` section pins specific versions of `fast-xml-parser`, `form-data`, `qs`, `tar`, and `tough-cookie` — likely to address known vulnerabilities. However, other transitive dependencies are not audited here. The pinned versions should be periodically reviewed.

**Recommended fix:** Run `pnpm audit` regularly and update overrides as new vulnerabilities are discovered. Consider using `pnpm.minimumReleaseAge: 2880` (already set) to avoid supply chain attacks from newly published packages.

---

## INFO

### I-1: Comprehensive built-in security audit system

**File:** `/Users/grimreaper/Desktop/hell/anima/src/security/audit.ts`
**Description:** ANIMA includes a thorough built-in security audit system (`anima security audit --deep`) that checks gateway configuration, file permissions, token strength, exposure vectors, Tailscale settings, plugin trust, and more. This is well-designed and covers many of the issues that external audits typically find. The system also has async filesystem checks and skill code scanning.

### I-2: SSRF protection is well-implemented

**File:** `/Users/grimreaper/Desktop/hell/anima/src/infra/net/ssrf.ts`
**File:** `/Users/grimreaper/Desktop/hell/anima/src/infra/net/fetch-guard.ts`
**Description:** The SSRF protection includes DNS pinning, private IP blocking (RFC1918, link-local, loopback, CGNAT, IPv4-mapped IPv6), hostname blocklisting (localhost, _.local, _.internal, metadata.google.internal), redirect following with re-validation, and configurable hostname allowlists. This is thorough and handles edge cases like IPv4-embedded IPv6 addresses.

### I-3: External content wrapping for prompt injection defense

**File:** `/Users/grimreaper/Desktop/hell/anima/src/security/external-content.ts`
**Description:** The `wrapExternalContent` function provides defense-in-depth against prompt injection from external sources. It uses boundary markers, security warnings, suspicious pattern detection, and Unicode homoglyph folding to prevent marker spoofing. The `replaceMarkers` function handles fullwidth and CJK angle bracket characters that could be used to forge boundary markers.

### I-4: Command execution security is strong

**File:** `/Users/grimreaper/Desktop/hell/anima/src/process/exec.ts`
**File:** `/Users/grimreaper/Desktop/hell/anima/src/infra/exec-safety.ts`
**Description:** Shell execution always uses `execFile`/`spawn` without `shell: true`, preventing shell metacharacter injection. The `isSafeExecutableValue` function validates command names against shell metacharacters, control characters, and quote characters. Node command allowlisting (`resolveNodeCommandAllowlist`) restricts which commands remote nodes can execute.

### I-5: Device identity files are created with 0o600 permissions

**File:** `/Users/grimreaper/Desktop/hell/anima/src/infra/device-identity.ts`, lines 84, 116
**Description:** The device identity file (containing Ed25519 private key) is written with `mode: 0o600` and `chmod` is called as a fallback. This is correct practice for sensitive key material.

### I-6: Hook token rejected from query parameters

**File:** `/Users/grimreaper/Desktop/hell/anima/src/gateway/server-http.ts`, lines 264-270
**Description:** The gateway explicitly rejects hook tokens passed as URL query parameters, preventing token leakage in server access logs, browser history, and referrer headers. This is good security practice.

---

## Dependency Notes

| Dependency                | Version    | Notes                                                    |
| ------------------------- | ---------- | -------------------------------------------------------- |
| `ws`                      | ^8.19.0    | WebSocket library, current                               |
| `undici`                  | ^7.22.0    | HTTP client, current                                     |
| `express`                 | ^5.2.1     | Express 5 (RC), check for stable release                 |
| `sharp`                   | ^0.34.5    | Image processing, native addon                           |
| `pdfjs-dist`              | ^5.4.624   | PDF parsing, check for prototype pollution history       |
| `linkedom`                | ^0.18.12   | DOM parser, used for web content — ensure no XSS vectors |
| `@whiskeysockets/baileys` | 7.0.0-rc.9 | WhatsApp library (dev dep), RC version                   |

The `pnpm.overrides` section pins known-vulnerable transitive deps (`qs`, `tar`, `tough-cookie`, `fast-xml-parser`, `form-data`) to patched versions. The `minimumReleaseAge: 2880` (48 hours) provides supply chain attack mitigation.

---

## Summary of Recommendations (Priority Order)

1. **Fix timing side-channel** in `safeEqualSecret` by hashing before comparison (C-1)
2. **Stop embedding tokens in URL fragments** — use a session cookie or clear the fragment immediately (C-2)
3. **Audit and restrict `allowUnsafeExternalContent`** — add warnings, require explicit dangerous prefix, log usage (C-3)
4. **Set 0o600 permissions** on auth profile store writes (H-4)
5. **Restrict canvas IP fallback** to loopback only (H-3)
6. **Reduce device signature skew** to 2-3 minutes, deprecate v1 path (H-5)
7. **Escape HTML in `injectControlUiConfig`** to prevent XSS via config values (M-5)
8. **Set restrictive permissions** on session history files (M-2)
9. **Remove dead `shell: true` code path** in exec.ts (M-6)
10. **Run `pnpm audit`** and review transitive dependency security regularly (L-5)
