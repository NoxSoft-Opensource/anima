# AnimaDock <!-- omit in toc -->

Stop typing `docker-compose` commands. Just type `animadock-start`.

Inspired by Simon Willison's [Running Anima in Docker](https://til.simonwillison.net/llms/anima-docker).

- [Quickstart](#quickstart)
- [Available Commands](#available-commands)
  - [Basic Operations](#basic-operations)
  - [Container Access](#container-access)
  - [Web UI \& Devices](#web-ui--devices)
  - [Setup \& Configuration](#setup--configuration)
  - [Maintenance](#maintenance)
  - [Utilities](#utilities)
- [Common Workflows](#common-workflows)
  - [Check Status and Logs](#check-status-and-logs)
  - [Set Up WhatsApp Bot](#set-up-whatsapp-bot)
  - [Troubleshooting Device Pairing](#troubleshooting-device-pairing)
  - [Fix Token Mismatch Issues](#fix-token-mismatch-issues)
  - [Permission Denied](#permission-denied)
- [Requirements](#requirements)

## Quickstart

**Install:**

```bash
mkdir -p ~/.animadock && curl -sL https://raw.githubusercontent.com/anima/anima/main/scripts/shell-helpers/animadock-helpers.sh -o ~/.animadock/animadock-helpers.sh
```

```bash
echo 'source ~/.animadock/animadock-helpers.sh' >> ~/.zshrc && source ~/.zshrc
```

**See what you get:**

```bash
animadock-help
```

On first command, AnimaDock auto-detects your Anima directory:

- Checks common paths (`~/anima`, `~/workspace/anima`, etc.)
- If found, asks you to confirm
- Saves to `~/.animadock/config`

**First time setup:**

```bash
animadock-start
```

```bash
animadock-fix-token
```

```bash
animadock-dashboard
```

If you see "pairing required":

```bash
animadock-devices
```

And approve the request for the specific device:

```bash
animadock-approve <request-id>
```

## Available Commands

### Basic Operations

| Command             | Description                     |
| ------------------- | ------------------------------- |
| `animadock-start`   | Start the gateway               |
| `animadock-stop`    | Stop the gateway                |
| `animadock-restart` | Restart the gateway             |
| `animadock-status`  | Check container status          |
| `animadock-logs`    | View live logs (follows output) |

### Container Access

| Command                    | Description                                    |
| -------------------------- | ---------------------------------------------- |
| `animadock-shell`          | Interactive shell inside the gateway container |
| `animadock-cli <command>`  | Run Anima CLI commands                         |
| `animadock-exec <command>` | Execute arbitrary commands in the container    |

### Web UI & Devices

| Command                  | Description                                |
| ------------------------ | ------------------------------------------ |
| `animadock-dashboard`    | Open web UI in browser with authentication |
| `animadock-devices`      | List device pairing requests               |
| `animadock-approve <id>` | Approve a device pairing request           |

### Setup & Configuration

| Command               | Description                                       |
| --------------------- | ------------------------------------------------- |
| `animadock-fix-token` | Configure gateway authentication token (run once) |

### Maintenance

| Command             | Description                                      |
| ------------------- | ------------------------------------------------ |
| `animadock-rebuild` | Rebuild the Docker image                         |
| `animadock-clean`   | Remove all containers and volumes (destructive!) |

### Utilities

| Command               | Description                               |
| --------------------- | ----------------------------------------- |
| `animadock-health`    | Run gateway health check                  |
| `animadock-token`     | Display the gateway authentication token  |
| `animadock-cd`        | Jump to the Anima project directory       |
| `animadock-config`    | Open the Anima config directory           |
| `animadock-workspace` | Open the workspace directory              |
| `animadock-help`      | Show all available commands with examples |

## Common Workflows

### Check Status and Logs

**Restart the gateway:**

```bash
animadock-restart
```

**Check container status:**

```bash
animadock-status
```

**View live logs:**

```bash
animadock-logs
```

### Set Up WhatsApp Bot

**Shell into the container:**

```bash
animadock-shell
```

**Inside the container, login to WhatsApp:**

```bash
anima channels login --channel whatsapp --verbose
```

Scan the QR code with WhatsApp on your phone.

**Verify connection:**

```bash
anima status
```

### Troubleshooting Device Pairing

**Check for pending pairing requests:**

```bash
animadock-devices
```

**Copy the Request ID from the "Pending" table, then approve:**

```bash
animadock-approve <request-id>
```

Then refresh your browser.

### Fix Token Mismatch Issues

If you see "gateway token mismatch" errors:

```bash
animadock-fix-token
```

This will:

1. Read the token from your `.env` file
2. Configure it in the Anima config
3. Restart the gateway
4. Verify the configuration

### Permission Denied

**Ensure Docker is running and you have permission:**

```bash
docker ps
```

## Requirements

- Docker and Docker Compose installed
- Bash or Zsh shell
- Anima project (from `docker-setup.sh`)

## Development

**Test with fresh config (mimics first-time install):**

```bash
unset ANIMADOCK_DIR && rm -f ~/.animadock/config && source scripts/shell-helpers/animadock-helpers.sh
```

Then run any command to trigger auto-detect:

```bash
animadock-start
```
