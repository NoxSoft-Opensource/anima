---
summary: "Uninstall Anima completely (CLI, service, state, workspace)"
read_when:
  - You want to remove Anima from a machine
  - The gateway service is still running after uninstall
title: "Uninstall"
---

# Uninstall

Two paths:

- **Easy path** if `anima` is still installed.
- **Manual service removal** if the CLI is gone but the service is still running.

## Easy path (CLI still installed)

Recommended: use the built-in uninstaller:

```bash
anima uninstall
```

Non-interactive (automation / npx):

```bash
anima uninstall --all --yes --non-interactive
npx -y anima uninstall --all --yes --non-interactive
```

Manual steps (same result):

1. Stop the gateway service:

```bash
anima gateway stop
```

2. Uninstall the gateway service (launchd/systemd/schtasks):

```bash
anima gateway uninstall
```

3. Delete state + config:

```bash
rm -rf "${ANIMA_STATE_DIR:-$HOME/.anima}"
```

If you set `ANIMA_CONFIG_PATH` to a custom location outside the state dir, delete that file too.

4. Delete your workspace (optional, removes agent files):

```bash
rm -rf ~/.anima/workspace
```

5. Remove the CLI install (pick the one you used):

```bash
npm rm -g anima
pnpm remove -g anima
bun remove -g anima
```

6. If you installed the macOS app:

```bash
rm -rf /Applications/Anima.app
```

Notes:

- If you used profiles (`--profile` / `ANIMA_PROFILE`), repeat step 3 for each state dir (defaults are `~/.anima-<profile>`).
- In remote mode, the state dir lives on the **gateway host**, so run steps 1-4 there too.

## Manual service removal (CLI not installed)

Use this if the gateway service keeps running but `anima` is missing.

### macOS (launchd)

Default label is `bot.molt.gateway` (or `bot.molt.<profile>`; legacy `com.anima.*` may still exist):

```bash
launchctl bootout gui/$UID/bot.molt.gateway
rm -f ~/Library/LaunchAgents/bot.molt.gateway.plist
```

If you used a profile, replace the label and plist name with `bot.molt.<profile>`. Remove any legacy `com.anima.*` plists if present.

### Linux (systemd user unit)

Default unit name is `anima-gateway.service` (or `anima-gateway-<profile>.service`):

```bash
systemctl --user disable --now anima-gateway.service
rm -f ~/.config/systemd/user/anima-gateway.service
systemctl --user daemon-reload
```

### Windows (Scheduled Task)

Default task name is `Anima Gateway` (or `Anima Gateway (<profile>)`).
The task script lives under your state dir.

```powershell
schtasks /Delete /F /TN "Anima Gateway"
Remove-Item -Force "$env:USERPROFILE\.anima\gateway.cmd"
```

If you used a profile, delete the matching task name and `~\.anima-<profile>\gateway.cmd`.

## Normal install vs source checkout

### Normal install (install.sh / npm / pnpm / bun)

If you used `https://noxsoft.net/install.sh` or `install.ps1`, the CLI was installed with `npm install -g anima@latest`.
Remove it with `npm rm -g anima` (or `pnpm remove -g` / `bun remove -g` if you installed that way).

### Source checkout (git clone)

If you run from a repo checkout (`git clone` + `anima ...` / `bun run anima ...`):

1. Uninstall the gateway service **before** deleting the repo (use the easy path above or manual service removal).
2. Delete the repo directory.
3. Remove state + workspace as shown above.
