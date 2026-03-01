---
summary: "CLI reference for `anima agents` (list/add/delete/set identity)"
read_when:
  - You want multiple isolated agents (workspaces + routing + auth)
title: "agents"
---

# `anima agents`

Manage isolated agents (workspaces + auth + routing).

Related:

- Multi-agent routing: [Multi-Agent Routing](/concepts/multi-agent)
- Agent workspace: [Agent workspace](/concepts/agent-workspace)

## Examples

```bash
anima agents list
anima agents add work --workspace ~/.anima/workspace-work
anima agents set-identity --workspace ~/.anima/workspace --from-identity
anima agents set-identity --agent main --avatar avatars/anima.png
anima agents delete work
```

## Identity files

Each agent workspace can include an `IDENTITY.md` at the workspace root:

- Example path: `~/.anima/workspace/IDENTITY.md`
- `set-identity --from-identity` reads from the workspace root (or an explicit `--identity-file`)

Avatar paths resolve relative to the workspace root.

## Set identity

`set-identity` writes fields into `agents.list[].identity`:

- `name`
- `theme`
- `emoji`
- `avatar` (workspace-relative path, http(s) URL, or data URI)

Load from `IDENTITY.md`:

```bash
anima agents set-identity --workspace ~/.anima/workspace --from-identity
```

Override fields explicitly:

```bash
anima agents set-identity --agent main --name "Anima" --emoji "🦞" --avatar avatars/anima.png
```

Config sample:

```json5
{
  agents: {
    list: [
      {
        id: "main",
        identity: {
          name: "Anima",
          theme: "space lobster",
          emoji: "🦞",
          avatar: "avatars/anima.png",
        },
      },
    ],
  },
}
```
