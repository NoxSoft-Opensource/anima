---
summary: "CLI reference for `anima voicecall` (voice-call plugin command surface)"
read_when:
  - You use the voice-call plugin and want the CLI entry points
  - You want quick examples for `voicecall call|continue|status|tail|expose`
title: "voicecall"
---

# `anima voicecall`

`voicecall` is a plugin-provided command. It only appears if the voice-call plugin is installed and enabled.

Primary doc:

- Voice-call plugin: [Voice Call](/plugins/voice-call)

## Common commands

```bash
anima voicecall status --call-id <id>
anima voicecall call --to "+15555550123" --message "Hello" --mode notify
anima voicecall continue --call-id <id> --message "Any questions?"
anima voicecall end --call-id <id>
```

## Exposing webhooks (Tailscale)

```bash
anima voicecall expose --mode serve
anima voicecall expose --mode funnel
anima voicecall unexpose
```

Security note: only expose the webhook endpoint to networks you trust. Prefer Tailscale Serve over Funnel when possible.
