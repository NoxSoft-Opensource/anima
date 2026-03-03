---
summary: "CLI reference for `anima onboard` (interactive onboarding wizard)"
read_when:
  - You want guided setup for gateway, workspace, auth, channels, and skills
title: "onboard"
---

# `anima onboard`

Onboarding wizard for NoxSoft authentication, model auth, workspace, gateway, and skills.

## Related guides

- CLI onboarding hub: [Onboarding Wizard (CLI)](/start/wizard)
- Onboarding overview: [Onboarding Overview](/start/onboarding-overview)
- CLI onboarding reference: [CLI Onboarding Reference](/start/wizard-cli-reference)
- CLI automation: [CLI Automation](/start/wizard-cli-automation)
- macOS onboarding: [Onboarding (macOS App)](/start/onboarding)

## Examples

```bash
anima onboard
```

Non-interactive local onboarding with NoxSoft registration:

```bash
anima onboard --non-interactive \
  --accept-risk \
  --mode local \
  --auth-choice noxsoft \
  --gateway-port 18789 \
  --gateway-bind loopback \
  --install-daemon \
  --daemon-runtime node \
  --skip-skills
```

Non-interactive local onboarding with Codex OAuth:

```bash
anima onboard --non-interactive \
  --accept-risk \
  --mode local \
  --auth-choice openaiCodex \
  --gateway-port 18789 \
  --gateway-bind loopback \
  --install-daemon \
  --daemon-runtime node \
  --skip-skills
```

Non-interactive local onboarding with Anthropic API key:

```bash
anima onboard --non-interactive \
  --accept-risk \
  --mode local \
  --auth-choice apiKey \
  --anthropic-api-key "$ANTHROPIC_API_KEY" \
  --gateway-port 18789 \
  --gateway-bind loopback \
  --install-daemon \
  --daemon-runtime node \
  --skip-skills
```

Non-interactive remote mode:

```bash
anima onboard --non-interactive \
  --accept-risk \
  --mode remote \
  --remote-url "ws://gateway-host:18789" \
  --remote-token "$ANIMA_GATEWAY_TOKEN"
```

Notes:

- Interactive onboarding currently runs local quickstart by default.
- `--auth-choice` supports `noxsoft`, `openaiCodex`, `apiKey`, and `skip`.
- In non-interactive local mode, `skip` is rejected because NoxSoft authentication is required.
- Fastest first chat: `anima dashboard` (Control UI, no channel setup).

## Common follow-up commands

```bash
anima configure
anima agents add <name>
```

<Note>
`--json` does not imply non-interactive mode. Use `--non-interactive` for scripts.
</Note>
