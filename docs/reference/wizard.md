---
summary: "Full reference for the CLI onboarding wizard: every step, flag, and config field"
read_when:
  - Looking up a specific wizard step or flag
  - Automating onboarding with non-interactive mode
  - Debugging wizard behavior
title: "Onboarding Wizard Reference"
sidebarTitle: "Wizard Reference"
---

# Onboarding Wizard Reference

This is the full reference for the `anima onboard` CLI wizard.
For a high-level overview, see [Onboarding Wizard](/start/wizard).

## Flow details (local mode)

<Steps>
  <Step title="Existing config detection">
    - If `~/.anima/anima.json` exists, choose **Keep / Modify / Reset**.
    - Re-running the wizard does **not** wipe anything unless you explicitly choose **Reset**
      (or pass `--reset`).
    - If the config is invalid or contains legacy keys, the wizard stops and asks
      you to run `anima doctor` before continuing.
    - Reset uses `trash` (never `rm`) and offers scopes:
      - Config only
      - Config + credentials + sessions
      - Full reset (also removes workspace)
  </Step>
  <Step title="Model/Auth">
    - **NoxSoft Agent Registration (recommended)**: authenticates/registers your agent with NoxSoft.
    - **OpenAI Codex OAuth**: reuses Codex CLI credentials from `~/.codex/auth.json`; defaults to `openai-codex/gpt-5.3-codex`.
    - **Anthropic API key**: uses `ANTHROPIC_API_KEY` if present or prompts for a key, then stores it as `anthropic:default`.
    - Pick a default model from detected options (or keep the existing model).
    - Wizard runs a model check and warns if the configured model is unknown or missing auth.
    - OAuth credentials live in `~/.anima/credentials/oauth.json`; auth profiles live in `~/.anima/agents/<agentId>/agent/auth-profiles.json` (API keys + OAuth).
    - More detail: [/concepts/oauth](/concepts/oauth)
    <Note>
    Headless/server tip: complete OAuth on a machine with a browser, then copy
    `~/.anima/credentials/oauth.json` (or `$ANIMA_STATE_DIR/credentials/oauth.json`) to the
    gateway host.
    </Note>
  </Step>
  <Step title="Workspace">
    - Default `~/.anima/workspace` (configurable).
    - Seeds the workspace files needed for the agent bootstrap ritual.
    - Full workspace layout + backup guide: [Agent workspace](/concepts/agent-workspace)
  </Step>
  <Step title="Gateway">
    - Port, bind, auth mode, tailscale exposure.
    - Auth recommendation: keep **Token** even for loopback so local WS clients must authenticate.
    - Disable auth only if you fully trust every local process.
    - Non‑loopback binds still require auth.
  </Step>
  <Step title="Channels">
    - [WhatsApp](/channels/whatsapp): optional QR login.
    - [Telegram](/channels/telegram): bot token.
    - [Discord](/channels/discord): bot token.
    - [Google Chat](/channels/googlechat): service account JSON + webhook audience.
    - [Mattermost](/channels/mattermost) (plugin): bot token + base URL.
    - [Signal](/channels/signal): optional `signal-cli` install + account config.
    - [BlueBubbles](/channels/bluebubbles): **recommended for iMessage**; server URL + password + webhook.
    - [iMessage](/channels/imessage): legacy `imsg` CLI path + DB access.
    - DM security: default is pairing. First DM sends a code; approve via `anima pairing approve <channel> <code>` or use allowlists.
  </Step>
  <Step title="Daemon install">
    - macOS: LaunchAgent
      - Requires a logged-in user session; for headless, use a custom LaunchDaemon (not shipped).
    - Linux (and Windows via WSL2): systemd user unit
      - Wizard attempts to enable lingering via `loginctl enable-linger <user>` so the Gateway stays up after logout.
      - May prompt for sudo (writes `/var/lib/systemd/linger`); it tries without sudo first.
    - **Runtime selection:** Node (recommended; required for WhatsApp/Telegram). Bun is **not recommended**.
  </Step>
  <Step title="Health check">
    - Starts the Gateway (if needed) and runs `anima health`.
    - Tip: `anima status --deep` adds gateway health probes to status output (requires a reachable gateway).
  </Step>
  <Step title="Skills (recommended)">
    - Reads the available skills and checks requirements.
    - Lets you choose a node manager: **npm / pnpm** (bun not recommended).
    - Installs optional dependencies (some use Homebrew on macOS).
  </Step>
  <Step title="Finish">
    - Summary + next steps, including iOS/Android/macOS apps for extra features.
  </Step>
</Steps>

<Note>
If no GUI is detected, the wizard prints SSH port-forward instructions for the Control UI instead of opening a browser.
If the Control UI assets are missing, the wizard attempts to build them; fallback is `pnpm ui:build` (auto-installs UI deps).
</Note>

## Non-interactive mode

Use `--non-interactive` to automate or script onboarding:

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

Add `--json` for a machine‑readable summary.

<Note>
`--json` does **not** imply non-interactive mode. Use `--non-interactive` (and `--workspace`) for scripts.
</Note>

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
  <Accordion title="OpenAI Codex OAuth">
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

### Add agent (non-interactive)

```bash
anima agents add work \
  --workspace ~/.anima/workspace-work \
  --model openai/gpt-5.2 \
  --bind whatsapp:biz \
  --non-interactive \
  --json
```

## Gateway wizard RPC

The Gateway exposes the wizard flow over RPC (`wizard.start`, `wizard.next`, `wizard.cancel`, `wizard.status`).
Clients (macOS app, Control UI) can render steps without re‑implementing onboarding logic.

## Signal setup (signal-cli)

The wizard can install `signal-cli` from GitHub releases:

- Downloads the appropriate release asset.
- Stores it under `~/.anima/tools/signal-cli/<version>/`.
- Writes `channels.signal.cliPath` to your config.

Notes:

- JVM builds require **Java 21**.
- Native builds are used when available.
- Windows uses WSL2; signal-cli install follows the Linux flow inside WSL.

## What the wizard writes

Typical fields in `~/.anima/anima.json`:

- `agents.defaults.workspace`
- `agents.defaults.model` / `models.providers` (when provider config is updated)
- `gateway.*` (mode, bind, auth, tailscale)
- `channels.telegram.botToken`, `channels.discord.token`, `channels.signal.*`, `channels.imessage.*`
- Channel allowlists (Slack/Discord/Matrix/Microsoft Teams) when you opt in during the prompts (names resolve to IDs when possible).
- `skills.install.nodeManager`
- `wizard.lastRunAt`
- `wizard.lastRunVersion`
- `wizard.lastRunCommit`
- `wizard.lastRunCommand`
- `wizard.lastRunMode`

`anima agents add` writes `agents.list[]` and optional `bindings`.

WhatsApp credentials go under `~/.anima/credentials/whatsapp/<accountId>/`.
Sessions are stored under `~/.anima/agents/<agentId>/sessions/`.

Some channels are delivered as plugins. When you pick one during onboarding, the wizard
will prompt to install it (npm or a local path) before it can be configured.

## Related docs

- Wizard overview: [Onboarding Wizard](/start/wizard)
- macOS app onboarding: [Onboarding](/start/onboarding)
- Config reference: [Gateway configuration](/gateway/configuration)
- Providers: [WhatsApp](/channels/whatsapp), [Telegram](/channels/telegram), [Discord](/channels/discord), [Google Chat](/channels/googlechat), [Signal](/channels/signal), [BlueBubbles](/channels/bluebubbles) (iMessage), [iMessage](/channels/imessage) (legacy)
- Skills: [Skills](/tools/skills), [Skills config](/tools/skills-config)
