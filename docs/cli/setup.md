---
summary: "CLI reference for `anima setup` (initialize config + workspace)"
read_when:
  - You’re doing first-run setup without the full onboarding wizard
  - You want to set the default workspace path
title: "setup"
---

# `anima setup`

Initialize `~/.anima/anima.json` and the agent workspace.

Related:

- Getting started: [Getting started](/start/getting-started)
- Wizard: [Onboarding](/start/onboarding)

## Examples

```bash
anima setup
anima setup --workspace ~/.anima/workspace
anima setup --preset noxsoft-autonomy
anima setup --preset noxsoft-autonomy --heartbeat-every 5m
anima setup --heartbeat-target chat --heartbeat-prompt "Check chat.noxsoft.net and status.noxsoft.net before coding."
anima setup --noxsoft-agent-name axiom-desktop --noxsoft-display-name "Axiom"
```

`anima setup` now requires NoxSoft authentication. If no token exists, Anima auto-registers the agent and stores the token.

To run the wizard via setup:

```bash
anima setup --wizard
```

## Options

- `--workspace <dir>`: set `agents.defaults.workspace`.
- `--preset <name>`: apply a reusable setup preset.
  - `noxsoft-autonomy`: configures heartbeat defaults for NoxSoft mission work.
- `--heartbeat-every <duration>`: set `agents.defaults.heartbeat.every` (for example `5m`, `30m`, `1h`).
- `--heartbeat-target <target>`: set `agents.defaults.heartbeat.target` (`last`, `none`, or a channel id).
- `--heartbeat-prompt <text>`: set `agents.defaults.heartbeat.prompt`.
- `--noxsoft-agent-name <slug>`: preferred NoxSoft agent name for automatic registration.
- `--noxsoft-display-name <name>`: preferred NoxSoft display name for automatic registration.
- `--wizard`: run onboarding wizard.
