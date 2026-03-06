# ANIMA Codebase Cleanup Report

Generated: 2026-03-07

---

## 1. Remaining Upstream/Legacy References

### 1.1 "OpenClaw" references in source code (outside CHANGELOG)

| File                                                    | Line(s)                              | Description                                                                                                                                                         | Severity     |
| ------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `README.md`                                             | 33                                   | "Claude Code or OpenClaw installed" — user-facing doc still references OpenClaw                                                                                     | must-fix     |
| `src/agents/cli-credentials.ts`                         | 17-18, 268-285, 297, 313, 427-430    | `OPENCLAW_AUTH_PROFILES_PATH`, `readOpenClawCredentials()` function, and log messages referencing "openclaw" — functional code still reads from `~/.openclaw/` path | should-fix   |
| `src/commands/setup-token.ts`                           | 18, 61, 79-85                        | Imports and calls `readOpenClawCredentials`, fallback logic references OpenClaw                                                                                     | should-fix   |
| `src/wizard/onboarding.ts`                              | 140                                  | Comment: "OpenClaw auth-profiles.json (same infrastructure, best Windows fallback)"                                                                                 | nice-to-have |
| `src/heartbeat/cycle.ts`                                | 38, 292, 376-377                     | `WORKSPACE_DIR` hardcoded to `~/.openclaw/workspace`, prompts reference `~/.openclaw/workspace/memory/` paths                                                       | must-fix     |
| `src/cli/migrate.ts`                                    | 2, 15, 18, 21-25, 41, 91-98, 125-126 | Full migration preset for "openclaw" with search paths `Desktop/hell/openclaw`, `Desktop/hell/open-claw`, etc.                                                      | should-fix   |
| `src/cli/migrate.test.ts`                               | 8-9, 51-72                           | Tests for openclaw migration preset                                                                                                                                 | should-fix   |
| `src/cli/program/command-registry.ts`                   | 149                                  | Description: "Import identity from Codex/OpenClaw/Claude coherence protocol"                                                                                        | should-fix   |
| `src/cli/program/register.anima.ts`                     | 110, 112                             | CLI help text references OpenClaw, preset option includes "openclaw"                                                                                                | should-fix   |
| `templates/profiles/nox.profile.json5`                  | 18, 25, 27, 67, 69                   | Heartbeat prompt and memory config reference `~/.openclaw/workspace/` paths, comment says "OpenClaw workspace memory"                                               | must-fix     |
| `docs/plans/2026-03-03-openclaw-streamline.md`          | 1, 18, 23, 36                        | Entire plan document about OpenClaw streamlining — stale planning artifact                                                                                          | nice-to-have |
| `docs/claude-code-adoption.md`                          | 3, 9, 18, 37, 421                    | Multiple references to "OpenClaw fork", comparisons with OpenClaw architecture                                                                                      | nice-to-have |
| `docs/roadmaps/noxsoft-alignment-1000-task-backlog.csv` | 922-961                              | 40 rows referencing "OpenClaw-era artifacts" in task descriptions                                                                                                   | nice-to-have |

### 1.2 "Clawdbot" / "Moltbot" references

| File                       | Line(s)       | Description                                                                                                                                                     | Severity     |
| -------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `.gitignore`               | 29, 36, 42-43 | References `MoltbotKit` and `Clawdbot.xcodeproj` — stale if those directories are renamed                                                                       | should-fix   |
| `.swiftlint.yml`           | 21            | Excludes `MoltbotProtocol` path                                                                                                                                 | should-fix   |
| `.swiftformat`             | 51            | Excludes `MoltbotProtocol` path                                                                                                                                 | should-fix   |
| `src/gateway/auth.test.ts` | 37, 42-43     | Test verifies `CLAWDBOT_GATEWAY_TOKEN` and `CLAWDBOT_GATEWAY_PASSWORD` are NOT resolved — this is correct behavior but the test references legacy env var names | nice-to-have |
| `.secrets.baseline`        | 181-227       | References `ClawdbotIPCTests` and `ClawdbotKit` in path entries                                                                                                 | should-fix   |
| `appcast.xml`              | 302           | Release notes reference "Clawdbot targeting"                                                                                                                    | nice-to-have |

### 1.3 `@mariozechner/pi-*` upstream package imports

Over 80 source files import from `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, and `@mariozechner/pi-tui`. These are functional dependencies from the upstream OpenClaw fork. Key files:

| Package                         | File count | Example files                                               | Severity   |
| ------------------------------- | ---------- | ----------------------------------------------------------- | ---------- |
| `@mariozechner/pi-agent-core`   | ~25        | `src/agents/tool-images.ts`, `src/plugins/types.ts`         | should-fix |
| `@mariozechner/pi-ai`           | ~20        | `src/agents/model-auth.ts`, `src/agents/cli-credentials.ts` | should-fix |
| `@mariozechner/pi-coding-agent` | ~15        | `src/auto-reply/reply/session.ts`, `src/agents/pi-tools.ts` | should-fix |
| `@mariozechner/pi-tui`          | ~15        | `src/tui/tui.ts`, `src/tui/components/*.ts`                 | should-fix |

These are runtime dependencies, not just naming issues. Replacing them requires publishing forked/rebranded packages.

---

## 2. Dead/Unused Files

### 2.1 Channel files that may be vestigial after v3.0

| File                                                 | Description                                                                                      | Severity   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------- |
| `src/channels/plugins/agent-tools/whatsapp-login.ts` | WhatsApp QR login tool — was WhatsApp channel removed in v3.0? If so, this is dead code          | should-fix |
| `src/channels/plugins/status-issues/bluebubbles.ts`  | BlueBubbles-specific status issue handling                                                       | should-fix |
| `src/channels/plugins/bluebubbles-actions.ts`        | BlueBubbles action handlers                                                                      | should-fix |
| `src/config/telegram-custom-commands.ts`             | Full Telegram custom command validation module (96 lines) — dead if Telegram channel was removed | should-fix |
| `src/agents/tools/whatsapp-actions.ts`               | WhatsApp agent tool actions                                                                      | should-fix |
| `src/agents/tools/discord-actions.ts`                | Discord agent tool actions                                                                       | should-fix |

### 2.2 Provider files — v3.0 went Claude-only

| File                                            | Description                                                                                                    | Severity   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------- |
| `src/providers/provider-store.ts`               | Multi-provider store with rotation strategy — manages multiple API keys/providers. Questionable if Claude-only | should-fix |
| `src/providers/rate-limit-rotation.ts`          | Auto-rotation on rate limit — includes OpenAI error detection (line 36-38)                                     | should-fix |
| `src/infra/provider-usage.fetch.copilot.ts`     | Copilot usage fetcher                                                                                          | should-fix |
| `src/infra/provider-usage.fetch.antigravity.ts` | Antigravity provider usage fetcher                                                                             | should-fix |
| `src/infra/provider-usage.fetch.zai.ts`         | ZAI provider usage fetcher                                                                                     | should-fix |
| `src/infra/provider-usage.fetch.codex.ts`       | OpenAI Codex usage fetcher                                                                                     | should-fix |

---

## 3. Stale Configuration

### 3.1 Config schema references to removed channels

| File                                      | Line(s)                                                                                         | Description                                                                                                                        | Severity     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `src/config/zod-schema.providers-core.ts` | 3                                                                                               | Comment: "Dead channel schemas (BlueBubbles, MSTeams) removed" — confirms cleanup happened but check if schema still accepts these | nice-to-have |
| `src/config/commands.test.ts`             | 8, 14, 20, 26, 35, 42                                                                           | Tests reference `discord`, `telegram`, `slack`, `whatsapp` as provider IDs                                                         | should-fix   |
| `src/config/redact-snapshot.test.ts`      | 54-55, 60-61, 101, 106, 199, 204, 257-271, 277-282, 330-334, 650-668, 713-733, 753-755, 820-824 | Extensive test fixtures for `telegram`, `slack`, `discord` channel token redaction                                                 | should-fix   |
| `src/config/normalize-paths.test.ts`      | 18-51                                                                                           | Test fixture normalizes `telegram` token file paths                                                                                | should-fix   |

### 3.2 Env var references

| File                            | Line(s) | Description                                                               | Severity |
| ------------------------------- | ------- | ------------------------------------------------------------------------- | -------- |
| `src/agents/cli-credentials.ts` | 18      | `OPENCLAW_AUTH_PROFILES_PATH` constant pointing to `.openclaw/` directory | must-fix |

---

## 4. Test Coverage Gaps

### 4.1 Security-critical files with NO test file

| File                               | Description                                                                                                                  | Severity   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `src/auth/noxsoft-auth.ts`         | Core NoxSoft authentication — token management, registration, identity resolution. No `src/auth/noxsoft-auth.test.ts` exists | must-fix   |
| `src/commands/setup-token.ts`      | Setup token command — credential resolution chain. No test file                                                              | must-fix   |
| `src/gateway/device-auth.ts`       | Device authentication for gateway. No `device-auth.test.ts`                                                                  | must-fix   |
| `src/gateway/http-auth-helpers.ts` | HTTP auth helper utilities. No test file                                                                                     | should-fix |
| `src/gateway/probe-auth.ts`        | Probe authentication. No test file                                                                                           | should-fix |
| `src/gateway/origin-check.ts`      | Has test, but related `http-auth-helpers.ts` does not                                                                        | should-fix |

### 4.2 Gateway files with no corresponding test (45 files)

The following `src/gateway/` source files have no test:

`chat-abort.ts`, `control-ui-shared.ts`, `device-auth.ts`, `exec-approval-manager.ts`, `hooks.ts`, `http-auth-helpers.ts`, `http-common.ts`, `http-utils.ts`, `live-image-probe.ts`, `node-invoke-sanitize.ts`, `node-invoke-system-run-approval.ts`, `node-registry.ts`, `open-responses.schema.ts`, `probe.ts`, `probe-auth.ts`, `server.ts`, `server-browser.ts`, `server-channels.ts`, `server-chat.ts`, `server-close.ts`, `server-constants.ts`, `server-cron.ts`, `server-discovery-runtime.ts`, `server-http.ts`, `server-lanes.ts`, `server-maintenance.ts`, `server-methods.ts`, `server-methods-list.ts`, `server-mobile-nodes.ts`, `server-model-catalog.ts`, `server-node-events-types.ts`, `server-reload-handlers.ts`, `server-restart-sentinel.ts`, `server-runtime-state.ts`, `server-session-key.ts`, `server-shared.ts`, `server-startup.ts`, `server-startup-log.ts`, `server-tailscale.ts`, `server-wizard-sessions.ts`, `server-ws-runtime.ts`, `server.impl.ts`, `session-utils.types.ts`, `sessions-resolve.ts`, `ws-logging.ts`

Severity: should-fix (for security-relevant ones like `node-invoke-sanitize.ts`, `exec-approval-manager.ts`, `node-invoke-system-run-approval.ts`), nice-to-have for others.

---

## 5. Build Artifacts

### 5.1 dist/ directory

- `dist/` is listed in `.gitignore` and is NOT tracked by git (0 tracked files). This is correct.
- `dist/` contains ~553 entries (build output). The `.gitignore` entry `dist` covers this properly.
- `dist/plugin-sdk/` contains `.d.ts` type declaration files, which appear to be a build output for the plugin SDK.

No issues found with build artifacts.

### 5.2 .gitignore completeness

| Issue                          | Description                                                                                                       | Severity     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------ |
| `apps/ios/Clawdbot.xcodeproj/` | `.gitignore` lines 42-43 reference old `Clawdbot` project name — should be updated if renamed                     | should-fix   |
| `apps/shared/MoltbotKit/`      | `.gitignore` lines 29, 36 reference old `MoltbotKit` name — should be updated if renamed                          | should-fix   |
| No `*.tgz` pattern             | Line 75 has `.tgz` but this matches a literal file named `.tgz`, not `*.tgz` glob. npm pack outputs `*.tgz` files | nice-to-have |

---

## Summary

| Severity     | Count |
| ------------ | ----- |
| must-fix     | 6     |
| should-fix   | ~30   |
| nice-to-have | ~12   |

### Top priority items:

1. **`src/heartbeat/cycle.ts`** — Hardcoded `~/.openclaw/workspace` path used in production heartbeat logic
2. **`templates/profiles/nox.profile.json5`** — Production profile template references `~/.openclaw/` paths
3. **`src/agents/cli-credentials.ts`** — `OPENCLAW_AUTH_PROFILES_PATH` constant and `readOpenClawCredentials()` function
4. **`README.md`** — User-facing doc references OpenClaw
5. **`src/auth/noxsoft-auth.ts`** — Zero test coverage on the core authentication module
6. **`src/commands/setup-token.ts`** and **`src/gateway/device-auth.ts`** — Zero test coverage on security-critical code
