---
summary: "CLI reference for `anima agents ready` (deploy a readiness subagent swarm)"
read_when:
  - You want ANIMA to run a coordinated readiness pass across architecture, security, UX, testing, reliability, and release
title: "agents ready"
---

# `anima agents ready`

Deploy a specialized subagent team to make ANIMA production-ready.

Related:

- Agents CLI: [agents](/cli/agents)
- Subagents tool behavior: [subagents](/tools/subagents)
- Session spawn API: [sessions_spawn](/tools/sessions-spawn)

## Examples

```bash
anima agents ready
anima agents ready --tracks security,testing,reliability
anima agents ready --objective "Stabilize gateway + daemon handoff"
anima agents ready --agent ops --deliver --reply-channel slack --reply-to "#release-war-room"
anima agents ready --dry-run
```

## Tracks

`--tracks` accepts a comma-separated subset of:

- `architecture`
- `security`
- `reliability`
- `ux`
- `testing`
- `release`

If omitted, all tracks run.

## Notes

- The command uses a systems-thinking orchestration prompt and asks the orchestrator to spawn one subagent per selected track.
- Default route is `--agent main` when no `--agent`, `--to`, or `--session-id` is provided.
- Default thinking level is `high` unless you pass `--thinking`.
