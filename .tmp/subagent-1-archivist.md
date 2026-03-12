The current repo state is blocked first by narrow but hard typecheck regressions around Discord action imports, channel target typing, and the `channels capabilities` CLI barrel. The secondary stabilization theme is repo-shape drift: lint debt has accumulated in `freedom`, `learning`, `node-host`, and stubbed agent files, while build/test/docs still assume an `extensions/` tree that is not present in this checkout.

## Build/Typecheck

- [ ] Restore module resolution in `src/agents/tools/discord-actions.ts` by reconciling its `.js` imports with `tsgo` and `NodeNext` expectations.
- [ ] Verify `src/agents/tools/discord-actions-guild.ts` exports the handler signature expected by `handleDiscordAction` and remove any build-only drift.
- [ ] Verify `src/agents/tools/discord-actions-messaging.ts` exports the handler signature expected by `handleDiscordAction` and remove any build-only drift.
- [ ] Verify `src/agents/tools/discord-actions-moderation.ts` exports the handler signature expected by `handleDiscordAction` and remove any build-only drift.
- [ ] Verify `src/agents/tools/discord-actions-presence.ts` exports the handler signature expected by `handleDiscordAction` and remove any build-only drift.
- [ ] Fix the stale import in `src/channels/targets.ts` so it points at the live channel plugin type surface instead of `./plugins/directory-config.js`.
- [ ] Decide whether `src/channels/plugins/directory-config.ts` should be restored or fully retired, then update all importers consistently.
- [ ] Align `src/plugin-sdk/index.ts` and `src/channels/plugins/types.ts` so `ChannelDirectoryEntry` is exported from one stable path.
- [ ] Reconcile `src/cli/channels-cli.ts` with `src/commands/channels.ts` so `channelsCapabilitiesCommand` resolves under `tsgo`.
- [ ] Confirm `src/commands/channels/capabilities.ts` stays in the root command barrel and is not excluded by build tooling.
- [ ] Review `tsconfig.json` includes for the removed `extensions/**/*` tree and either restore the workspace or stop typechecking a path that no longer exists.
- [ ] Audit `package.json` build scripts around `tsdown` and `build:plugin-sdk:dts` to ensure split Discord action modules are emitted and typed.
- [ ] Add a repo-level typecheck target that runs plain `tsc -p tsconfig.json` alongside `pnpm tsgo` to catch `NodeNext` import drift earlier.
- [ ] Add a targeted smoke check for `src/agents/tools/discord-actions.ts`, `src/channels/targets.ts`, and `src/cli/channels-cli.ts` so future barrel/import regressions fail fast.

## Lint/Format

- [ ] Rename the shadowed `setActivePluginRegistry` binding inside `src/gateway/server.channels.e2e.test.ts`.
- [ ] Split the `vi.mock("./server-plugins.js", ...)` helper in `src/gateway/server.channels.e2e.test.ts` so it no longer reuses outer-scope identifiers.
- [ ] Rename the outer `candidates` variable in `src/infra/update-runner.ts` to remove the oxlint `no-shadow` violation.
- [ ] Rename the inner `candidates` list built from `git rev-list` in `src/infra/update-runner.ts` to make preflight logic readable and lint-clean.
- [ ] Rename the inner `steps` array in `src/infra/update-runner.ts` so it no longer shadows the top-level update step accumulator.
- [ ] Add braces to the three single-line `if (entry)` statements in `src/freedom/journal.ts`.
- [ ] Replace mutating `sort()` and `reverse()` usage in `src/freedom/journal.ts` with `toSorted()` and `toReversed()`.
- [ ] Replace the stub-only body in `src/agents/pi-embedded-block-chunker.ts` with a minimal exported shim or delete the file if nothing imports it.
- [ ] Replace the stub-only body in `src/agents/pi-embedded-subscribe.types.ts` with a minimal exported shim or delete the file if nothing imports it.
- [ ] Replace the stub-only body in `src/agents/pi-embedded-subscribe.handlers.lifecycle.ts` with a minimal exported shim or delete the file if nothing imports it.
- [ ] Replace the stub-only body in `src/agents/pi-embedded-messaging.ts` with a minimal exported shim or delete the file if nothing imports it.
- [ ] Remove the unused `getTotalWeight` import from `src/freedom/engine.ts`.
- [ ] Convert the mutating `sort()/reverse()` chain and single-line `break` in `src/freedom/engine.ts` to lint-compliant forms.
- [ ] Rename the local `path` variable in `src/node-host/invoke.ts` so it does not shadow the `node:path` import.
- [ ] Apply the same brace and non-mutating array cleanup across `src/learning/evaluations.ts`, which shows the same lint pattern as `src/freedom/*`.

## Channels/Integrations

- [ ] Audit `src/channels/plugins/catalog.ts` against the channel docs under `docs/channels/` and remove any providers that are documented but no longer loadable.
- [ ] Review `src/channels/plugins/load.ts` for assumptions about an `extensions/` workspace that has been stripped from this checkout.
- [ ] Stabilize `src/channels/targets.ts` parsing rules for `user:` vs `channel:` targets and document the fallback behavior in code comments/tests.
- [ ] Review `src/infra/outbound/target-resolver.ts` so directory lookups, cache keys, and normalized IDs still work with the current `ChannelDirectoryEntry` type.
- [ ] Add a gap analysis for `src/commands/channels/resolve.ts` versus `src/infra/outbound/target-resolver.ts`, especially for ambiguous group/user results.
- [ ] Verify `src/commands/channels/add.ts` and `src/commands/channels/add-mutators.ts` still expose options for every built-in channel listed in the CLI.
- [ ] Audit `src/channels/plugins/config-schema.ts` so every supported channel has a matching schema entry and no removed channel lingers.
- [ ] Align `src/channels/plugins/channel-config.ts` with `src/channels/plugins/config-schema.ts` so reads and writes use the same field names.
- [ ] Review `src/channels/plugins/config-writes.ts` for account-scoped writes, especially where default-account semantics differ by provider.
- [ ] Revalidate `src/channels/plugins/status.ts` and `src/channels/plugins/status-issues/shared.ts` so status output distinguishes config errors from auth failures.
- [ ] Recheck `src/channels/plugins/status-issues/bluebubbles.ts` against current BlueBubbles docs and onboarding messages.
- [ ] Audit `src/channels/plugins/onboarding/channel-access.ts` and `src/channels/plugins/onboarding/helpers.ts` so onboarding only references live providers.
- [ ] Review `src/channels/plugins/pairing.ts` and `src/channels/plugins/pairing-message.ts` for consistent pairing prompts across Signal, WhatsApp, Matrix, and Discord.
- [ ] Compare `src/channels/plugins/message-actions.ts` and `src/channels/plugins/message-action-names.ts` against the actual agent tool handlers for Discord, WhatsApp, Slack, and Telegram.
- [ ] Validate `src/channels/web/index.ts` against `src/web/login.ts`, `src/web/logout.ts`, and `src/web/session.ts` so the web channel wrapper matches the current session lifecycle.
- [ ] Review `src/channels/noxsoft-chat.ts` and `src/routing/bindings.ts` for allowlist, sender identity, and session binding consistency.
- [ ] Review `src/channels/noxsoft-email.ts` and `src/channels/sender-identity.ts` so email-originated sessions use the same identity rules as chat channels.
- [ ] Recheck `src/channels/command-gating.ts`, `src/channels/mention-gating.ts`, and `src/channels/allowlist-match.ts` so shared gating still applies uniformly across all active integrations.

## Agent Runtime

- [ ] Audit `src/agents/anima-tools.ts` to ensure the tool registry still includes the split Discord action handlers and does not reference retired pi-embedded pieces.
- [ ] Review `src/agents/channel-tools.ts` so channel capability gating matches the current `channels capabilities` command output.
- [ ] Trace the import graph rooted at `src/agents/pi-embedded-runner.ts` and remove dead references to stubbed modules left from the provider removal.
- [ ] Review `src/agents/pi-embedded-subscribe.ts` and `src/agents/pi-embedded-subscribe.handlers.ts` so the subscribe pipeline still compiles without empty placeholder modules.
- [ ] Audit `src/agents/cli-runner.ts`, `src/agents/claude-cli-runner.ts`, and `src/agents/noxsoft-runner.ts` for backend selection drift and stale fallback branches.
- [ ] Revalidate `src/agents/model-catalog.ts` against `src/gateway/server-model-catalog.ts` so agent-side and gateway-side model availability stay in sync.
- [ ] Review `src/agents/model-selection.ts` and `src/agents/model-fallback.ts` for provider alias drift now that model packages are split across direct and gateway runners.
- [ ] Inspect `src/agents/session-tool-result-guard.ts` and `src/agents/session-tool-result-guard-wrapper.ts` so persisted tool results survive partial failures cleanly.
- [ ] Audit `src/agents/context-window-guard.ts` alongside `src/agents/compaction.ts` to confirm compaction thresholds still match current transcript sizes.
- [ ] Review `src/agents/bash-tools.exec.ts` and `src/agents/bash-tools.process.ts` for timeout, truncation, and PTY fallback behavior under large-output commands.
- [ ] Recheck `src/agents/auth-profiles/store.ts`, `src/agents/auth-profiles/repair.ts`, and `src/agents/auth-profiles/oauth.ts` for partial-profile recovery and ordering stability.
- [ ] Audit `src/agents/skills.ts` and `src/agents/skills/bundled-dir.ts` so workspace skill resolution behaves correctly without an `extensions/` tree.
- [ ] Review `src/agents/pi-tool-definition-adapter.ts` and `src/agents/schema/typebox.ts` for compliance with the repo’s tool-schema guardrails.
- [ ] Revalidate `src/node-host/invoke.ts`, `src/gateway/node-command-policy.ts`, and `src/gateway/server-methods/exec-approval.ts` so exec approvals behave the same from node-host and gateway entrypoints.
- [ ] Audit `src/agents/live-auth-keys.ts` and `src/agents/model-auth.ts` so missing credentials fail with deterministic, source-specific diagnostics.
- [ ] Review `src/agents/sandbox/tool-policy.ts`, `src/agents/sandbox/config.ts`, and `src/agents/sandbox/workspace.ts` so runtime sandbox rules match current workspace mounting behavior.

## UI/Web

- [ ] Reconcile the nav items and route table in `ui/src/App.tsx` so every sidebar link maps to a live page and every page has a discoverable nav entry.
- [ ] Add an explicit not-found route in `ui/src/App.tsx` instead of relying on a root-only redirect.
- [ ] Review `ui/src/api.ts`, `ui/src/gateway-connect.ts`, and `ui/src/gateway-connection.ts` against current gateway auth and reconnect flows.
- [ ] Audit `ui/src/pages/Sessions.tsx` against `src/gateway/server-methods/sessions.ts` so session actions and filters still match the backend.
- [ ] Audit `ui/src/pages/MCP.tsx` against `src/gateway/server-methods/mcp.ts` so the page reflects the current server method names and payloads.
- [ ] Review `ui/src/pages/Freedom.tsx` and `ui/src/pages/Journal.tsx` against `src/freedom/*` and `src/freedom/journal.ts` so the UI matches current data shape and sort order.
- [ ] Revalidate `ui/src/ui/app-gateway.ts` and `ui/src/ui/app-polling.ts` for browser/node transport differences and reconnect timing.
- [ ] Review `ui/src/ui/navigation.ts` and `ui/src/ui/app-scroll.ts` for React Router v7 edge cases around back/forward navigation and preserved scroll state.
- [ ] Audit `ui/src/styles.css` and `ui/src/styles/base.css` for mobile sidebar behavior and small-screen overflow in the current Control Panel layout.
- [ ] Decide whether checked-in `ui/dist/*` artifacts are still part of the source-of-truth workflow, and if not, remove them from stabilization targets and docs.
- [ ] Review `src/web/inbound.ts`, `src/web/inbound/access-control.ts`, and `src/web/inbound/dedupe.ts` so inbound webhooks enforce auth before dedupe or state mutation.
- [ ] Review `src/web/auto-reply.ts`, `src/web/auto-reply/heartbeat-runner.ts`, and `src/web/reconnect.ts` so reconnect and heartbeat ownership are not split across competing loops.
- [ ] Recheck `src/web/login.ts`, `src/web/logout.ts`, `src/web/session.ts`, and `src/web/accounts.ts` so login/logout/session state transitions stay consistent across WhatsApp web flows.

## Tests

- [ ] Add a regression test that exercises the import surface of `src/agents/tools/discord-actions.ts` under the same module resolution used by `pnpm tsgo`.
- [ ] Add a regression test for `src/cli/channels-cli.ts` that fails if `channelsCapabilitiesCommand` drops out of the command barrel again.
- [ ] Extend `src/channels/targets.test.ts` to cover the `DirectoryConfigParams` export path and any replacement for `directory-config.ts`.
- [ ] Add a focused test for `src/infra/outbound/target-resolver.ts` covering ambiguous user/channel matches and cache normalization.
- [ ] Add coverage in `src/commands/channels/capabilities.e2e.test.ts` for at least one built-in provider and one plugin-backed provider path.
- [ ] Add a regression test around `src/infra/update-runner.ts` preflight naming and branch logic so later refactors do not reintroduce unreadable step state.
- [ ] Add unit tests for `src/freedom/journal.ts` that assert stable sort order without mutating the input file list.
- [ ] Add unit tests for `src/freedom/engine.ts` around cutoff handling so the `break` path remains correct after lint cleanup.
- [ ] Add tests for `src/learning/evaluations.ts` covering empty directories, missing files, and reverse chronological reads.
- [ ] Add an e2e or integration test for `src/channels/web/index.ts` that walks login, active session, and logout in one flow.
- [ ] Add a UI test for `ui/src/App.tsx` asserting nav-to-route parity and not-found behavior.
- [ ] Add a browser-side test for `ui/src/pages/Sessions.tsx` or `ui/src/ui/app-gateway.ts` that covers reconnect after a dropped gateway response.
- [ ] Add a gateway integration test that exercises `src/gateway/server-methods/exec-approval.ts` through the same approval file state used by `src/node-host/invoke.ts`.
- [ ] Add a documentation-link or smoke test that fails if AGENTS-referenced doc paths like `docs/testing.md` are missing or renamed.

## Docs/Process

- [ ] Update `docs/channels/index.md` so the supported-channel matrix matches the providers that actually load from `src/channels/plugins/catalog.ts`.
- [ ] Update `docs/channels/discord.md` to describe the current Discord action groups and any capability gating exposed by `src/agents/tools/discord-actions.ts`.
- [ ] Update `docs/channels/pairing.md` so pairing guidance matches the current onboarding logic in `src/channels/plugins/pairing.ts`.
- [ ] Update `docs/web/control-ui.md` so the documented Control Panel pages and routes match `ui/src/App.tsx`.
- [ ] Update `docs/web/webchat.md` and `docs/gateway/openresponses-http-api.md` where needed so web UI and gateway APIs reflect the current server methods.
- [ ] Update `docs/gateway/sandbox-vs-tool-policy-vs-elevated.md` so it matches the current separation among sandbox config, tool policy, and exec approvals.
- [ ] Update `docs/gateway/configuration-reference.md` and `docs/gateway/authentication.md` so gateway and node-host exec approval behavior is documented from a single source of truth.
- [ ] Add or restore the testing guide referenced by repo instructions as `docs/testing.md`, or update the instructions to the real test doc path if that page was intentionally moved.
- [ ] Add a release/process check in repo scripts or maintainer docs to catch stale `extensions/` references after the channel-removal checkout shape changed.
- [ ] Update the contributor/process docs that govern `pnpm check` so they explicitly call out the dual typecheck/lint pipeline and the current baseline blockers.
