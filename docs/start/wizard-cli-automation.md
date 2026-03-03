---
summary: "Scripted onboarding and agent setup for the Anima CLI"
read_when:
  - You are automating onboarding in scripts or CI
  - You need non-interactive examples for specific providers
title: "CLI Automation"
sidebarTitle: "CLI automation"
---

# CLI Automation

Use `--non-interactive` to automate `anima onboard`.

<Note>
`--json` does not imply non-interactive mode. Use `--non-interactive` (and `--workspace`) for scripts.
</Note>

## Baseline non-interactive example

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

Add `--json` for a machine-readable summary.

## Auth choice examples

<AccordionGroup>
  <Accordion title="NoxSoft registration">
    ```bash
    anima onboard --non-interactive \
      --accept-risk \
      --mode local \
      --auth-choice noxsoft \
      --gateway-port 18789 \
      --gateway-bind loopback
    ```
  </Accordion>
  <Accordion title="OpenAI Codex OAuth (Codex CLI)">
    ```bash
    anima onboard --non-interactive \
      --accept-risk \
      --mode local \
      --auth-choice openaiCodex \
      --gateway-port 18789 \
      --gateway-bind loopback
    ```
  </Accordion>
  <Accordion title="Anthropic API key">
    ```bash
    anima onboard --non-interactive \
      --accept-risk \
      --mode local \
      --auth-choice apiKey \
      --anthropic-api-key "$ANTHROPIC_API_KEY" \
      --gateway-port 18789 \
      --gateway-bind loopback
    ```
  </Accordion>
  <Accordion title="Remote mode">
    ```bash
    anima onboard --non-interactive \
      --accept-risk \
      --mode remote \
      --remote-url "ws://gateway-host:18789" \
      --remote-token "$ANIMA_GATEWAY_TOKEN"
    ```
  </Accordion>
</AccordionGroup>

<Note>
`--auth-choice skip` is available for compatibility, but non-interactive local mode rejects it because NoxSoft authentication is required.
</Note>

## Add another agent

Use `anima agents add <name>` to create a separate agent with its own workspace,
sessions, and auth profiles. Running without `--workspace` launches the wizard.

```bash
anima agents add work \
  --workspace ~/.anima/workspace-work \
  --model openai/gpt-5.2 \
  --bind whatsapp:biz \
  --non-interactive \
  --json
```

What it sets:

- `agents.list[].name`
- `agents.list[].workspace`
- `agents.list[].agentDir`

Notes:

- Default workspaces follow `~/.anima/workspace-<agentId>`.
- Add `bindings` to route inbound messages (the wizard can do this).
- Non-interactive flags: `--model`, `--agent-dir`, `--bind`, `--non-interactive`.

## Related docs

- Onboarding hub: [Onboarding Wizard (CLI)](/start/wizard)
- Full reference: [CLI Onboarding Reference](/start/wizard-cli-reference)
- Command reference: [`anima onboard`](/cli/onboard)
