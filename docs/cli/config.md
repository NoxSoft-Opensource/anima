---
summary: "CLI reference for `anima config` (get/set/unset config values)"
read_when:
  - You want to read or edit config non-interactively
title: "config"
---

# `anima config`

Config helpers: get/set/unset values by path. Run without a subcommand to open
the configure wizard (same as `anima configure`).

## Examples

```bash
anima config get browser.executablePath
anima config set browser.executablePath "/usr/bin/google-chrome"
anima config set agents.defaults.heartbeat.every "2h"
anima config set agents.list[0].tools.exec.node "node-id-or-name"
anima config unset tools.web.search.apiKey
```

## Paths

Paths use dot or bracket notation:

```bash
anima config get agents.defaults.workspace
anima config get agents.list[0].id
```

Use the agent list index to target a specific agent:

```bash
anima config get agents.list
anima config set agents.list[1].tools.exec.node "node-id-or-name"
```

## Values

Values are parsed as JSON5 when possible; otherwise they are treated as strings.
Use `--json` to require JSON5 parsing.

```bash
anima config set agents.defaults.heartbeat.every "0m"
anima config set gateway.port 19001 --json
anima config set channels.whatsapp.groups '["*"]' --json
```

Restart the gateway after edits.
