## Critical failures

- [`src/commands/channels/capabilities.ts:12`](/Users/grimreaper/.hell/anima/src/commands/channels/capabilities.ts#L12) is now a hard stub that always prints an error and exits 1. The CLI still exposes `anima channels capabilities` at [`src/cli/channels-cli.ts:107`](/Users/grimreaper/.hell/anima/src/cli/channels-cli.ts#L107), so this command is now guaranteed broken at runtime.
- The split Discord handlers are all hard stubs that throw for every action: [`src/agents/tools/discord-actions-messaging.ts:6`](/Users/grimreaper/.hell/anima/src/agents/tools/discord-actions-messaging.ts#L6), [`src/agents/tools/discord-actions-guild.ts:6`](/Users/grimreaper/.hell/anima/src/agents/tools/discord-actions-guild.ts#L6), [`src/agents/tools/discord-actions-moderation.ts:6`](/Users/grimreaper/.hell/anima/src/agents/tools/discord-actions-moderation.ts#L6), [`src/agents/tools/discord-actions-presence.ts:6`](/Users/grimreaper/.hell/anima/src/agents/tools/discord-actions-presence.ts#L6). The dispatcher in [`src/agents/tools/discord-actions.ts:57`](/Users/grimreaper/.hell/anima/src/agents/tools/discord-actions.ts#L57) still routes live action names into them, so every Discord tool path now hard-fails.
- The `pi-embedded` compatibility layer severed the embedded-run control plane. [`src/agents/pi-embedded.ts:19`](/Users/grimreaper/.hell/anima/src/agents/pi-embedded.ts#L19) makes compaction a noop, [`:29`](/Users/grimreaper/.hell/anima/src/agents/pi-embedded.ts#L29) makes abort always return `false`, [`:33`](/Users/grimreaper/.hell/anima/src/agents/pi-embedded.ts#L33) and [`:37`](/Users/grimreaper/.hell/anima/src/agents/pi-embedded.ts#L37) always report inactive/non-streaming, [`:41`](/Users/grimreaper/.hell/anima/src/agents/pi-embedded.ts#L41) disables steering, [`:45`](/Users/grimreaper/.hell/anima/src/agents/pi-embedded.ts#L45) collapses every lane to `"default"`, and [`:49`](/Users/grimreaper/.hell/anima/src/agents/pi-embedded.ts#L49) claims runs ended even when they did not. Those exports are still used by live runtime paths:
  - interrupt/queue logic in [`src/auto-reply/reply/get-reply-run.ts:360`](/Users/grimreaper/.hell/anima/src/auto-reply/reply/get-reply-run.ts#L360)
  - steering in [`src/auto-reply/reply/agent-runner.ts:161`](/Users/grimreaper/.hell/anima/src/auto-reply/reply/agent-runner.ts#L161)
  - compaction in [`src/auto-reply/reply/commands-compact.ts:67`](/Users/grimreaper/.hell/anima/src/auto-reply/reply/commands-compact.ts#L67)
  - subagent announce/settling in [`src/agents/subagent-announce.ts:198`](/Users/grimreaper/.hell/anima/src/agents/subagent-announce.ts#L198) and [`src/agents/subagent-announce.ts:443`](/Users/grimreaper/.hell/anima/src/agents/subagent-announce.ts#L443)
  - kill/stop flows in [`src/agents/tools/subagents-tool.ts:292`](/Users/grimreaper/.hell/anima/src/agents/tools/subagents-tool.ts#L292) and [`src/gateway/server-methods/sessions.ts:108`](/Users/grimreaper/.hell/anima/src/gateway/server-methods/sessions.ts#L108)
- Because `waitForEmbeddedPiRunEnd()` now always returns `true`, the gateway session-stop path in [`src/gateway/server-methods/sessions.ts:108`](/Users/grimreaper/.hell/anima/src/gateway/server-methods/sessions.ts#L108) can falsely report success while the run is still alive. That is a bad runtime lie, not just a missing feature.

## High-risk gaps

- [`src/agents/noxsoft-runner.ts:451`](/Users/grimreaper/.hell/anima/src/agents/noxsoft-runner.ts#L451) forwards CLI streaming via `text.trim()` on every callback, but `runCliAgent` emits the full accumulated stdout snapshot, not a delta, at [`src/agents/cli-runner.ts:303`](/Users/grimreaper/.hell/anima/src/agents/cli-runner.ts#L303) and [`src/agents/cli-runner.ts:320`](/Users/grimreaper/.hell/anima/src/agents/cli-runner.ts#L320). That combination is high risk for duplicated partial replies and stripped spacing in typing/stream consumers.
- The new runner’s lifecycle payloads are inconsistent by strategy. Direct paths emit `phase/end` with `status` only at [`src/agents/noxsoft-runner.ts:386`](/Users/grimreaper/.hell/anima/src/agents/noxsoft-runner.ts#L386) and [`src/agents/noxsoft-runner.ts:411`](/Users/grimreaper/.hell/anima/src/agents/noxsoft-runner.ts#L411); the CLI path emits `startedAt`, `endedAt`, and `aborted` at [`src/agents/noxsoft-runner.ts:469`](/Users/grimreaper/.hell/anima/src/agents/noxsoft-runner.ts#L469). Consumers currently look tolerant, but this is exactly the kind of post-cleanup runner drift that causes subtle regressions later.
- Existing tests still describe the old behavior, which strongly suggests verification was skipped. `channelsCapabilitiesCommand` tests still expect Slack/Teams output in [`src/commands/channels/capabilities.e2e.test.ts:83`](/Users/grimreaper/.hell/anima/src/commands/channels/capabilities.e2e.test.ts#L83), and Discord action tests still expect full implementations in [`src/agents/tools/discord-actions.e2e.test.ts:82`](/Users/grimreaper/.hell/anima/src/agents/tools/discord-actions.e2e.test.ts#L82), [`:300`](/Users/grimreaper/.hell/anima/src/agents/tools/discord-actions.e2e.test.ts#L300), and [`:577`](/Users/grimreaper/.hell/anima/src/agents/tools/discord-actions.e2e.test.ts#L577).

## Missing tests

- No test exercises the real exported control helpers in [`src/agents/pi-embedded.ts`](/Users/grimreaper/.hell/anima/src/agents/pi-embedded.ts). The surrounding suites mock those functions instead of validating actual abort/active/queue/compaction behavior, so the noop regression would slip through.
- [`src/agents/noxsoft-runner.test.ts:53`](/Users/grimreaper/.hell/anima/src/agents/noxsoft-runner.test.ts#L53) only covers strategy selection, auth-profile rotation, and one CLI delegation case. It does not cover streaming semantics, lifecycle event parity, media-only payloads, error-path event emission, or any compatibility with the old `pi-embedded` control surface.
- There is no verification tying the new runner cleanup to the runtime paths that depend on abort/settle semantics: reply interruption, manual stop, compaction, subagent steering, and gateway session termination.

## Recommended verification commands

```bash
pnpm vitest src/commands/channels/capabilities.e2e.test.ts
pnpm vitest src/agents/tools/discord-actions.e2e.test.ts
pnpm vitest src/agents/noxsoft-runner.test.ts
pnpm vitest src/auto-reply/reply/commands-compact.test.ts src/agents/subagent-announce.format.e2e.test.ts src/commands/agent.e2e.test.ts
pnpm test -- --runInBand src/gateway/server-methods/sessions.ts
```

I did not modify files or run the suite in this pass.
