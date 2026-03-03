---
summary: "Complete reference for CLI onboarding flow, auth/model setup, outputs, and internals"
read_when:
  - You need detailed behavior for anima onboard
  - You are debugging onboarding results or integrating onboarding clients
title: "CLI Onboarding Reference"
sidebarTitle: "CLI reference"
---

# CLI Onboarding Reference

This page is the full reference for `anima onboard`.
For the short guide, see [Onboarding Wizard (CLI)](/start/wizard).

## What the wizard does

Local mode (default) walks you through:

- Model and auth setup (`noxsoft`, `openaiCodex`, or `apiKey`)
- Workspace location and bootstrap files
- Gateway settings (port, bind, auth, tailscale)
- Channels and providers (Telegram, WhatsApp, Discord, Google Chat, Mattermost plugin, Signal)
- Daemon install (LaunchAgent or systemd user unit)
- Health check
- Skills setup

Remote mode configures this machine to connect to a gateway elsewhere.
It does not install or modify anything on the remote host.

## Local flow details

<Steps>
  <Step title="Existing config detection">
    - If `~/.anima/anima.json` exists, choose Keep, Modify, or Reset.
    - Re-running the wizard does not wipe anything unless you explicitly choose Reset (or pass `--reset`).
    - If config is invalid or contains legacy keys, the wizard stops and asks you to run `anima doctor` before continuing.
    - Reset uses `trash` and offers scopes:
      - Config only
      - Config + credentials + sessions
      - Full reset (also removes workspace)
  </Step>
  <Step title="Model and auth">
    - Full option matrix is in [Auth and model options](#auth-and-model-options).
  </Step>
  <Step title="Workspace">
    - Default `~/.anima/workspace` (configurable).
    - Seeds workspace files needed for first-run bootstrap ritual.
    - Workspace layout: [Agent workspace](/concepts/agent-workspace).
  </Step>
  <Step title="Gateway">
    - Prompts for port, bind, auth mode, and tailscale exposure.
    - Recommended: keep token auth enabled even for loopback so local WS clients must authenticate.
    - Disable auth only if you fully trust every local process.
    - Non-loopback binds still require auth.
  </Step>
  <Step title="Channels">
    - [WhatsApp](/channels/whatsapp): optional QR login
    - [Telegram](/channels/telegram): bot token
    - [Discord](/channels/discord): bot token
    - [Google Chat](/channels/googlechat): service account JSON + webhook audience
    - [Mattermost](/channels/mattermost) plugin: bot token + base URL
    - [Signal](/channels/signal): optional `signal-cli` install + account config
    - [BlueBubbles](/channels/bluebubbles): recommended for iMessage; server URL + password + webhook
    - [iMessage](/channels/imessage): legacy `imsg` CLI path + DB access
    - DM security: default is pairing. First DM sends a code; approve via
      `anima pairing approve <channel> <code>` or use allowlists.
  </Step>
  <Step title="Daemon install">
    - macOS: LaunchAgent
      - Requires logged-in user session; for headless, use a custom LaunchDaemon (not shipped).
    - Linux and Windows via WSL2: systemd user unit
      - Wizard attempts `loginctl enable-linger <user>` so gateway stays up after logout.
      - May prompt for sudo (writes `/var/lib/systemd/linger`); it tries without sudo first.
    - Runtime selection: Node (recommended; required for WhatsApp and Telegram). Bun is not recommended.
  </Step>
  <Step title="Health check">
    - Starts gateway (if needed) and runs `anima health`.
    - `anima status --deep` adds gateway health probes to status output.
  </Step>
  <Step title="Skills">
    - Reads available skills and checks requirements.
    - Lets you choose node manager: npm or pnpm (bun not recommended).
    - Installs optional dependencies (some use Homebrew on macOS).
  </Step>
  <Step title="Finish">
    - Summary and next steps, including iOS, Android, and macOS app options.
  </Step>
</Steps>

<Note>
If no GUI is detected, the wizard prints SSH port-forward instructions for the Control UI instead of opening a browser.
If Control UI assets are missing, the wizard attempts to build them; fallback is `pnpm ui:build` (auto-installs UI deps).
</Note>

## Remote mode details

Remote mode configures this machine to connect to a gateway elsewhere.

<Info>
Remote mode does not install or modify anything on the remote host.
</Info>

What you set:

- Remote gateway URL (`ws://...`)
- Token if remote gateway auth is required (recommended)

<Note>
- If gateway is loopback-only, use SSH tunneling or a tailnet.
- Discovery hints:
  - macOS: Bonjour (`dns-sd`)
  - Linux: Avahi (`avahi-browse`)
</Note>

## Auth and model options

<AccordionGroup>
  <Accordion title="NoxSoft Agent Registration (recommended)">
    Authenticates and registers your agent with NoxSoft.
  </Accordion>
  <Accordion title="OpenAI Codex OAuth">
    Reuses Codex CLI credentials from `~/.codex/auth.json`.
    On successful apply, default model is `openai-codex/gpt-5.3-codex`.
  </Accordion>
  <Accordion title="Anthropic API key">
    Uses `ANTHROPIC_API_KEY` if present or prompts for a key, then stores it as
    profile `anthropic:default`.
  </Accordion>
  <Accordion title="Skip (compatibility)">
    Available in the enum, but non-interactive local mode rejects `skip`
    because NoxSoft authentication is required.
  </Accordion>
</AccordionGroup>

Model behavior:

- Pick default model from detected options, or enter provider and model manually.
- Wizard runs a model check and warns if the configured model is unknown or missing auth.

Credential and profile paths:

- OAuth credentials: `~/.anima/credentials/oauth.json`
- Auth profiles (API keys + OAuth): `~/.anima/agents/<agentId>/agent/auth-profiles.json`

<Note>
Headless and server tip: complete OAuth on a machine with a browser, then copy
`~/.anima/credentials/oauth.json` (or `$ANIMA_STATE_DIR/credentials/oauth.json`)
to the gateway host.
</Note>

## Outputs and internals

Typical fields in `~/.anima/anima.json`:

- `agents.defaults.workspace`
- `agents.defaults.model` / `models.providers` (when provider config is updated)
- `gateway.*` (mode, bind, auth, tailscale)
- `channels.telegram.botToken`, `channels.discord.token`, `channels.signal.*`, `channels.imessage.*`
- Channel allowlists (Slack, Discord, Matrix, Microsoft Teams) when you opt in during prompts (names resolve to IDs when possible)
- `skills.install.nodeManager`
- `wizard.lastRunAt`
- `wizard.lastRunVersion`
- `wizard.lastRunCommit`
- `wizard.lastRunCommand`
- `wizard.lastRunMode`

`anima agents add` writes `agents.list[]` and optional `bindings`.

WhatsApp credentials go under `~/.anima/credentials/whatsapp/<accountId>/`.
Sessions are stored under `~/.anima/agents/<agentId>/sessions/`.

<Note>
Some channels are delivered as plugins. When selected during onboarding, the wizard
prompts to install the plugin (npm or local path) before channel configuration.
</Note>

Gateway wizard RPC:

- `wizard.start`
- `wizard.next`
- `wizard.cancel`
- `wizard.status`

Clients (macOS app and Control UI) can render steps without re-implementing onboarding logic.

Signal setup behavior:

- Downloads the appropriate release asset
- Stores it under `~/.anima/tools/signal-cli/<version>/`
- Writes `channels.signal.cliPath` in config
- JVM builds require Java 21
- Native builds are used when available
- Windows uses WSL2 and follows Linux signal-cli flow inside WSL

## Related docs

- Onboarding hub: [Onboarding Wizard (CLI)](/start/wizard)
- Automation and scripts: [CLI Automation](/start/wizard-cli-automation)
- Command reference: [`anima onboard`](/cli/onboard)
