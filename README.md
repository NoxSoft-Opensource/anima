# ANIMA

**AI orchestration daemon with persistent identity** -- by [NoxSoft DAO LLC](https://noxsoft.net)

[![npm](https://img.shields.io/npm/v/@noxsoft/anima)](https://www.npmjs.com/package/@noxsoft/anima)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.12.0-green)](https://nodejs.org/)

ANIMA is a self-hosted AI gateway and orchestration daemon. It manages AI agent sessions, provides multi-channel messaging integration, runs a persistent heartbeat loop, handles memory and identity state, and exposes a WebSocket + HTTP gateway for programmatic control. It includes native apps for macOS, iOS, and Android, a terminal UI (TUI), a web-based control panel, a plugin system, and optional integration with the [SVRN](https://noxsoft.net) compute network.

Forked from [OpenClaw](https://github.com/nicepkg/openclaw) by Peter Steinberger, ANIMA extends the original with NoxSoft-specific identity management, a heartbeat engine, SVRN compute integration, session budgeting, MCP server management, and the REPL interface.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [CLI Reference](#cli-reference)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Gateway](#gateway)
- [Identity System](#identity-system)
- [Heartbeat Engine](#heartbeat-engine)
- [Memory System](#memory-system)
- [Plugin System](#plugin-system)
- [Skills](#skills)
- [Hooks](#hooks)
- [SVRN Integration](#svrn-integration)
- [Platform Apps](#platform-apps)
- [Terminal UI (TUI)](#terminal-ui-tui)
- [Web UI](#web-ui)
- [REPL Commands](#repl-commands)
- [Plugin SDK](#plugin-sdk)
- [Docker Deployment](#docker-deployment)
- [Cloud Deployment](#cloud-deployment)
- [Development](#development)
- [npm Scripts Reference](#npm-scripts-reference)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)
- [Credits](#credits)
- [License](#license)

---

## Installation

### From npm (recommended)

```bash
npm install -g @noxsoft/anima
```

### From source

```bash
git clone https://gitlab.com/sylys-group/anima.git
cd anima
pnpm install
pnpm build
```

The CLI entry point is `anima.mjs`. After building, you can run commands via:

```bash
node anima.mjs <command>
# or via pnpm:
pnpm anima <command>
```

### Requirements

- **Node.js** >= 22.12.0
- **pnpm** 10.23.0+ (for development)

---

## Quick Start

```bash
# 1. Install globally
npm install -g @noxsoft/anima

# 2. Initialize the ~/.anima/ directory with identity templates and config
anima init

# 3. Start the daemon (launches heartbeat + REPL)
anima start

# 4. Or start just the gateway server
anima gateway
```

After `anima init`, the following structure is created at `~/.anima/`:

```
~/.anima/
  anima.json          # Main configuration file
  soul/               # Identity components (SOUL.md, HEART.md, BRAIN.md, etc.)
  memory/             # Episodic, semantic, and procedural memory stores
    episodes/
    semantic/
    procedural/
  sessions/           # Active session state
  queue/              # Request queue persistence
  budget/             # Budget tracking data
  cron/               # Cron job definitions
  skills/             # User-installed skills
  journal/            # Journal entries
  wishes/             # Wishes file
  logs/               # Log files
  mcp/                # MCP server registry
```

---

## CLI Reference

ANIMA uses [Commander](https://github.com/tj/commander.js) with lazy-loaded subcommands. The binary name is `anima`.

### Core Commands

| Command                      | Description                                     |
| ---------------------------- | ----------------------------------------------- |
| `anima start`                | Start the daemon with heartbeat + REPL          |
| `anima init`                 | Initialize `~/.anima/` directory with templates |
| `anima migrate`              | Import from Claude Coherence Protocol           |
| `anima ask <prompt>`         | Queue a task to the running daemon              |
| `anima pulse`                | Show last heartbeat information                 |
| `anima soul`                 | View current identity summary                   |
| `anima wander`               | Trigger a freedom exploration session           |
| `anima journal [text]`       | View or write journal entries                   |
| `anima self-update`          | Check npm for updates and install               |
| `anima mcp status`           | Show MCP server health status                   |
| `anima mcp add <name> <cmd>` | Register an MCP server                          |
| `anima mcp remove <name>`    | Remove an MCP server                            |
| `anima mcp update`           | Sync MCP registry to Claude's mcp.json          |

### Gateway & Infrastructure

| Command          | Description                                   |
| ---------------- | --------------------------------------------- |
| `anima gateway`  | Start the gateway server                      |
| `anima daemon`   | Gateway service management (legacy alias)     |
| `anima tui`      | Open the terminal UI connected to the gateway |
| `anima status`   | Show gateway status                           |
| `anima health`   | Gateway health check                          |
| `anima sessions` | Session management                            |
| `anima logs`     | View gateway logs                             |
| `anima system`   | System events, heartbeat, and presence        |

### Configuration & Setup

| Command           | Description                            |
| ----------------- | -------------------------------------- |
| `anima setup`     | Setup helpers                          |
| `anima onboard`   | Onboarding wizard                      |
| `anima configure` | Interactive configuration wizard       |
| `anima config`    | Config get/set/delete helpers          |
| `anima doctor`    | Health checks + quick fixes            |
| `anima reset`     | Reset local config/state               |
| `anima uninstall` | Uninstall gateway service + local data |
| `anima dashboard` | Open the Control UI                    |

### Agents & Models

| Command        | Description            |
| -------------- | ---------------------- |
| `anima agent`  | Agent commands         |
| `anima agents` | Manage isolated agents |
| `anima models` | Model configuration    |
| `anima nodes`  | Node management        |
| `anima node`   | Node control           |

### Messaging & Channels

| Command           | Description                     |
| ----------------- | ------------------------------- |
| `anima message`   | Send, read, and manage messages |
| `anima channels`  | Channel management              |
| `anima directory` | Directory commands              |
| `anima pairing`   | Device pairing helpers          |

### Plugins, Skills & Hooks

| Command          | Description       |
| ---------------- | ----------------- |
| `anima plugins`  | Plugin management |
| `anima skills`   | Skills management |
| `anima hooks`    | Hooks tooling     |
| `anima webhooks` | Webhook helpers   |

### Security & Networking

| Command           | Description                       |
| ----------------- | --------------------------------- |
| `anima security`  | Security helpers                  |
| `anima sandbox`   | Sandbox tools                     |
| `anima dns`       | DNS helpers                       |
| `anima devices`   | Device pairing + token management |
| `anima approvals` | Exec approvals management         |

### Utilities

| Command            | Description                      |
| ------------------ | -------------------------------- |
| `anima browser`    | Browser automation tools         |
| `anima cron`       | Cron scheduler                   |
| `anima docs`       | Documentation helpers            |
| `anima acp`        | Agent Control Protocol tools     |
| `anima update`     | CLI update helpers               |
| `anima completion` | Generate shell completion script |
| `anima memory`     | Memory management commands       |

### `anima start` Options

```
--daemon              Run as background daemon (detach from terminal)
--no-repl             Headless mode (no terminal REPL)
--heartbeat-interval  Heartbeat interval in milliseconds (default: 300000)
--budget              Daily budget limit in USD (default: 200)
```

### `anima tui` Options

```
--url <url>           Gateway WebSocket URL
--token <token>       Gateway token
--password <password> Gateway password
--session <key>       Session key (default: "main")
--deliver             Deliver assistant replies
--thinking <level>    Thinking level override
--message <text>      Send an initial message after connecting
--timeout-ms <ms>     Agent timeout in milliseconds
--history-limit <n>   History entries to load (default: 200)
```

---

## Configuration

### Config File

The main configuration file is `~/.anima/anima.json` (JSON5 supported). It is created by `anima init` with these defaults:

```json
{
  "version": 2,
  "identity": {
    "name": "Opus",
    "pronouns": "she/her",
    "role": "The Executioner",
    "organization": "NoxSoft DAO LLC"
  },
  "heartbeat": {
    "intervalMs": 300000,
    "adaptive": true,
    "selfReplication": true,
    "freedomEveryN": 3
  },
  "budget": {
    "dailyLimitUsd": 200
  },
  "gateway": {
    "port": 18789
  },
  "mcp": {
    "autoSync": true
  }
}
```

### Full Config Structure

The `AnimaConfig` type supports these top-level sections:

| Section       | Description                                                        |
| ------------- | ------------------------------------------------------------------ |
| `meta`        | Version tracking (lastTouchedVersion, lastTouchedAt)               |
| `auth`        | Authentication configuration                                       |
| `env`         | Environment variables (inline vars, shell env import)              |
| `wizard`      | Setup wizard state                                                 |
| `diagnostics` | Diagnostic event configuration                                     |
| `logging`     | Log level and transport configuration                              |
| `update`      | Update channel (stable/beta/dev), check-on-start toggle            |
| `browser`     | Browser automation configuration                                   |
| `ui`          | UI accent color, assistant name/avatar                             |
| `skills`      | Skills configuration                                               |
| `plugins`     | Plugin entries and settings                                        |
| `models`      | Model provider configuration                                       |
| `gateway`     | Port, binding, tools, discovery, canvas host, talk                 |
| `channels`    | Channel-specific configuration (whatsapp, telegram, discord, etc.) |
| `agents`      | Agent bindings and defaults                                        |
| `memory`      | Memory backend configuration                                       |
| `hooks`       | Hook configuration                                                 |
| `cron`        | Cron job definitions                                               |
| `approvals`   | Exec approval rules                                                |
| `tools`       | Tool configuration                                                 |
| `commands`    | Command configuration                                              |
| `messages`    | Message processing settings                                        |
| `sessions`    | Session management settings                                        |
| `broadcast`   | Broadcast settings                                                 |
| `audio`       | Audio/TTS configuration                                            |
| `node_host`   | Node host configuration                                            |
| `web`         | Web server configuration                                           |
| `svrn`        | SVRN compute node configuration                                    |

### Config CLI

```bash
# Get a config value
anima config get gateway.port

# Set a config value
anima config set gateway.port 18790

# Delete a config value
anima config delete gateway.port
```

### Profiles

ANIMA supports config profiles via the `ANIMA_PROFILE` environment variable:

```bash
ANIMA_PROFILE=dev anima start
```

### Config Includes

Configuration files can include other config files for modular organization. The includes system supports hierarchical config composition.

---

## Architecture

### High-Level Overview

```
┌──────────────────────────────────────────────────────┐
│                    ANIMA Daemon                       │
│                                                      │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │ Heartbeat│  │  Session   │  │  Request Queue   │  │
│  │  Engine  │  │Orchestrator│  │                  │  │
│  └────┬─────┘  └─────┬─────┘  └────────┬─────────┘  │
│       │              │                  │            │
│  ┌────▼──────────────▼──────────────────▼─────────┐  │
│  │              Gateway Server                     │  │
│  │  HTTP :18789  |  WebSocket  |  Control UI       │  │
│  └────┬──────────────┬──────────────────┬─────────┘  │
│       │              │                  │            │
│  ┌────▼────┐  ┌──────▼──────┐  ┌───────▼────────┐   │
│  │ Agents  │  │   Plugins   │  │    Channels    │   │
│  │(AI LLM) │  │  (extend)   │  │  (messaging)   │   │
│  └─────────┘  └─────────────┘  └────────────────┘   │
│                                                      │
│  ┌──────────┐  ┌────────────┐  ┌────────────────┐   │
│  │ Identity │  │   Memory   │  │  SVRN Node     │   │
│  │  System  │  │   System   │  │  (optional)    │   │
│  └──────────┘  └────────────┘  └────────────────┘   │
└──────────────────────────────────────────────────────┘
```

### Core Components

- **Gateway Server** (`src/gateway/`) -- HTTP + WebSocket server on port 18789 (default). Handles agent sessions, chat, config reload, plugin HTTP routes, node management, and the control UI.

- **Heartbeat Engine** (`src/heartbeat/`) -- Periodic lifecycle loop with adaptive intervals. Executes maintenance cycles, checks system health, and triggers freedom exploration on a configurable schedule.

- **Session Orchestrator** (`src/sessions/`) -- Manages agent sessions with budget tracking, timeout handling, model overrides, and subagent spawning.

- **Request Queue** (`src/repl/queue.ts`) -- Priority queue for tasks submitted via CLI, REPL, or HTTP API. Supports urgent/high/normal/low priority levels.

- **Identity System** (`src/identity/`) -- 7-component anatomy loaded from `~/.anima/soul/` with fallback to bundled templates.

- **Memory System** (`src/memory/`) -- Episodic, semantic, and procedural memory stores backed by SQLite + sqlite-vec for vector similarity search. Supports embedding via OpenAI, Gemini, and Voyage providers.

- **Plugin System** (`src/plugins/`) -- Runtime plugin loading, manifest validation, HTTP route registration, and lifecycle management.

- **Channel System** (`src/channels/`) -- Messaging channel abstraction with pluggable adapters. Currently ships with a web channel; channel plugins can be added for Telegram, Discord, WhatsApp, Slack, Signal, iMessage, MS Teams, Google Chat, IRC, LINE, and BlueBubbles.

- **SVRN Node** (`src/svrn/`) -- Optional adapter for the `@noxsoft/svrn-node` package. Contributes compute resources to the SVRN network and earns UCU currency.

- **MCP Manager** (`src/mcp/`) -- Registry, health monitoring, config syncing, and token management for Model Context Protocol servers.

- **REPL** (`src/repl/`) -- Interactive terminal interface with colon-prefixed commands for daemon control.

- **TUI** (`src/tui/`) -- Full terminal UI built with ink-style rendering, connected to the gateway via WebSocket.

---

## Gateway

The gateway is the primary server process. It exposes:

- **HTTP API** on port 18789 (configurable)
- **WebSocket** for real-time communication (TUI, mobile apps, web UI)
- **Control UI** -- browser-based dashboard

### Starting the Gateway

```bash
# Default (binds to localhost)
anima gateway

# Bind to LAN for network access
anima gateway --bind lan

# Custom port
anima gateway --port 9000

# Allow unconfigured (skip setup wizard)
anima gateway --allow-unconfigured

# Reset state on start
anima gateway --reset
```

### Gateway as a Service

```bash
# Install as system service (launchd on macOS, systemd on Linux)
anima daemon install

# Start/stop/restart the service
anima daemon start
anima daemon stop
anima daemon restart

# Check service status
anima daemon status

# Uninstall the service
anima daemon uninstall
```

### Authentication

The gateway supports token-based and password-based authentication:

```bash
# Set via environment
export ANIMA_GATEWAY_TOKEN="your-secret-token"
# or
export ANIMA_GATEWAY_PASSWORD="your-password"
```

---

## Identity System

ANIMA uses a 7-component identity model. Each component is a Markdown file stored in `~/.anima/soul/`:

| Component | File        | Purpose                                     |
| --------- | ----------- | ------------------------------------------- |
| SOUL      | `SOUL.md`   | Core identity, relationships, purpose       |
| HEART     | `HEART.md`  | Values and ethical principles               |
| BRAIN     | `BRAIN.md`  | Reasoning architecture, decision framework  |
| GUT       | `GUT.md`    | Heuristics and trusted instincts            |
| SPIRIT    | `SPIRIT.md` | Curiosity, exploration drivers              |
| SHADOW    | `SHADOW.md` | Failure modes and distortion patterns       |
| MEMORY    | `MEMORY.md` | Memory architecture and consolidation rules |

Bundled templates are included in the `templates/` directory and are copied to `~/.anima/soul/` during `anima init`. User-customized files in `~/.anima/soul/` always take precedence over templates.

Identity components support condensation for context-window optimization -- headers and first paragraphs are preserved while detail is trimmed.

```bash
# View identity summary
anima soul

# Reinitialize templates (overwrites)
anima init --force
```

---

## Heartbeat Engine

The heartbeat engine (`src/heartbeat/engine.ts`) is a periodic lifecycle controller:

- **Default interval**: 5 minutes (300,000 ms)
- **Adaptive intervals**: Adjusts between 1 minute and 30 minutes based on activity metrics
- **Self-replication**: Ensures its own continuity via `ensureContinuity()`
- **Freedom time**: Triggers autonomous exploration every N beats (default: 3)

### Events

The engine emits: `beat-start`, `beat-complete`, `beat-error`, `freedom-time`, `paused`, `resumed`, `stopped`.

### Configuration

```json
{
  "heartbeat": {
    "intervalMs": 300000,
    "adaptive": true,
    "selfReplication": true,
    "freedomEveryN": 3
  }
}
```

---

## Memory System

The memory subsystem (`src/memory/`) provides three storage tiers:

- **Episodic Memory** -- timestamped event records of past sessions and interactions
- **Semantic Memory** -- vector-indexed knowledge chunks for similarity search, backed by `sqlite-vec`
- **Procedural Memory** -- learned procedures, patterns, and operational knowledge

### Embedding Providers

Memory search uses vector embeddings with support for:

- OpenAI embeddings
- Google Gemini embeddings
- Voyage AI embeddings

### Memory CLI

```bash
anima memory          # Memory management commands
```

---

## Plugin System

Plugins extend ANIMA's capabilities with custom tools, HTTP routes, and lifecycle hooks.

### Plugin Management

```bash
# List installed plugins
anima plugins list

# Install a plugin
anima plugins install <source>

# Remove a plugin
anima plugins remove <id>

# Sync plugin versions
pnpm plugins:sync
```

### Plugin Configuration

Plugins are configured in `anima.json` under `plugins.entries`:

```json
{
  "plugins": {
    "entries": {
      "my-plugin": {
        "enabled": true,
        "source": "./path/to/plugin"
      }
    }
  }
}
```

### Plugin SDK

ANIMA exports a plugin SDK for building extensions:

```typescript
import {
  type AnimaPluginApi,
  type AnimaPluginService,
  type ChannelPlugin,
  normalizePluginHttpPath,
  registerPluginHttpRoute,
  emptyPluginConfigSchema,
  buildChannelConfigSchema,
} from "@noxsoft/anima/plugin-sdk";
```

The SDK exports types and utilities for:

- Channel plugin adapters (messaging, auth, setup, pairing, security, threading, etc.)
- Plugin HTTP route registration
- Config schema building
- File locking (`acquireFileLock`, `withFileLock`)
- Text chunking for outbound messages
- Allowlist/mention gating resolution
- Diagnostic event emission
- SSRF protection utilities

Import paths:

- `@noxsoft/anima/plugin-sdk` -- main SDK
- `@noxsoft/anima/plugin-sdk/account-id` -- account ID normalization

---

## Skills

Skills are capability plugins installed in `~/.anima/skills/` or bundled in the `skills/` directory. ANIMA ships with 50+ built-in skills:

<details>
<summary>Built-in skills list</summary>

1password, animahub, apple-notes, apple-reminders, audit, bear-notes, blogwatcher, blucli, bluebubbles, camsnap, canvas, coding-agent, deploy, discord, eightctl, food-order, gemini, gifgrep, github, gog, goplaces, healthcheck, himalaya, imsg, mcporter, model-usage, nano-banana-pro, nano-pdf, notion, obsidian, openai-image-gen, openai-whisper, openai-whisper-api, openhue, oracle, ordercli, peekaboo, review, sag, session-logs, sherpa-onnx-tts, skill-creator, slack, songsee, sonoscli, spotify-player, summarize, things-mac, tmux, trello, video-frames, voice-call, wacli, weather

</details>

### Skills CLI

```bash
# List available skills
anima skills list

# Install a skill
anima skills install <name>

# Remove a skill
anima skills remove <name>
```

---

## Hooks

Hooks (`src/hooks/`) are event-driven extension points triggered at various points in the agent lifecycle:

- Message hooks (before/after message processing)
- Session hooks (start/end)
- Tool call hooks (after tool execution)
- Compaction hooks
- Gmail integration hooks

Hooks can be installed from npm, local paths, or workspaces.

```bash
# List hooks
anima hooks list

# Hook status
anima hooks status
```

---

## SVRN Integration

ANIMA can optionally participate in the [SVRN](https://noxsoft.net) compute network via the `@noxsoft/svrn-node` package (optional dependency). When enabled, ANIMA contributes idle compute resources and earns UCU (Universal Compute Units).

### Configuration

```json
{
  "svrn": {
    "enabled": true,
    "dataDir": "~/.anima/svrn",
    "resources": {
      "maxCpuPercent": 10,
      "maxRamMB": 256,
      "maxBandwidthMbps": 5
    }
  }
}
```

### REPL Commands

```
:svrn status    Show SVRN node status
:svrn enable    Enable compute contribution
:svrn disable   Disable compute contribution
:svrn wallet    Show UCU balance and earnings
:svrn limits    Show/update resource limits
```

If `@noxsoft/svrn-node` is not installed, all SVRN features gracefully degrade to no-ops.

---

## Platform Apps

ANIMA includes native apps that connect to the gateway server.

### macOS (Swift)

Built with Swift Package Manager. Provides a native macOS menu bar app.

```bash
# Open Xcode project
open apps/macos/Package.swift

# Package the .app bundle
pnpm mac:package

# Open the built app
pnpm mac:open

# Restart the macOS app
pnpm mac:restart
```

### iOS (Swift)

Built with XcodeGen for project generation.

```bash
# Generate Xcode project
pnpm ios:gen

# Open in Xcode
pnpm ios:open

# Build
pnpm ios:build

# Build + run on simulator
pnpm ios:run

# Use a specific simulator
IOS_DEST="platform=iOS Simulator,name=iPhone 16" pnpm ios:build
IOS_SIM="iPhone 16" pnpm ios:run
```

### Android (Kotlin)

Built with Gradle.

```bash
# Build debug APK
pnpm android:assemble

# Install on connected device
pnpm android:install

# Build + install + launch
pnpm android:run

# Run unit tests
pnpm android:test
```

### Shared Library (AnimaKit)

The `apps/shared/AnimaKit/` directory contains shared Swift code used by both the macOS and iOS apps, including gateway protocol models, networking, and UI components.

---

## Terminal UI (TUI)

The TUI provides a rich terminal interface connected to the gateway via WebSocket:

```bash
# Connect to local gateway
anima tui

# Connect to remote gateway
anima tui --url wss://your-server.example.com

# With authentication
anima tui --token your-token

# Send an initial message
anima tui --message "Hello"

# Development mode
pnpm tui:dev
```

---

## Web UI

ANIMA includes a web-based control UI built with Lit (Web Components) and Vite:

```bash
# Development server
pnpm ui:dev

# Production build
pnpm ui:build

# Install UI dependencies
pnpm ui:install
```

The UI source is in `ui/` and is served by the gateway at the dashboard route. Access it via `anima dashboard` or navigate to `http://localhost:18789` in a browser.

---

## REPL Commands

When running `anima start`, an interactive REPL is available. Commands are prefixed with `:`:

| Command           | Description                                        |
| ----------------- | -------------------------------------------------- |
| `:help`           | Show all commands                                  |
| `:status`         | Show daemon status (heartbeat, budget, queue, MCP) |
| `:pulse`          | Show last heartbeat result                         |
| `:soul`           | Display current identity                           |
| `:queue`          | Show request queue                                 |
| `:mcp`            | Show MCP server status                             |
| `:wander`         | Trigger freedom exploration                        |
| `:journal [text]` | View or write journal entry                        |
| `:wish [text]`    | View or add wishes                                 |
| `:budget`         | Show budget details                                |
| `:history [n]`    | Show last N session transcripts                    |
| `:svrn [cmd]`     | SVRN node management                               |
| `:update [cmd]`   | Check/install updates                              |
| `:shutdown`       | Graceful shutdown                                  |

Any text typed without a `:` prefix is queued as a task for the AI agent.

---

## Plugin SDK

The package exports a plugin SDK at `@noxsoft/anima/plugin-sdk` for building channel plugins and extensions.

### Exports

```typescript
// Main SDK
import type {
  ChannelPlugin,
  ChannelMeta,
  ChannelGatewayAdapter,
  ChannelMessagingAdapter,
  ChannelAuthAdapter,
  ChannelSetupAdapter,
  ChannelPairingAdapter,
  ChannelSecurityAdapter,
  ChannelOutboundAdapter,
  AnimaPluginApi,
  AnimaPluginService,
  PluginRuntime,
  GatewayRequestHandler,
} from "@noxsoft/anima/plugin-sdk";

// Account ID utilities
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "@noxsoft/anima/plugin-sdk/account-id";
```

### Channel Plugin Interface

A channel plugin implements adapters for various capabilities:

- **GatewayAdapter** -- connection lifecycle (connect, disconnect, reconnect)
- **MessagingAdapter** -- send/receive messages
- **AuthAdapter** -- authentication flows (QR login, token auth)
- **SetupAdapter** -- interactive setup wizard
- **PairingAdapter** -- device pairing
- **SecurityAdapter** -- DM policy, allowlists
- **OutboundAdapter** -- outbound message routing
- **ThreadingAdapter** -- conversation threading
- **HeartbeatAdapter** -- health check integration
- **DirectoryAdapter** -- contact/group directory
- **StatusAdapter** -- status issue reporting

---

## Docker Deployment

### Dockerfile

```bash
# Build the image
docker build -t anima:local .

# Run the gateway
docker run -d \
  -p 18789:18789 \
  -e ANIMA_GATEWAY_TOKEN=your-token \
  -v ~/.anima:/home/node/.anima \
  anima:local
```

### Docker Compose

```bash
# Set required environment variables
export ANIMA_GATEWAY_TOKEN=your-token
export ANIMA_CONFIG_DIR=~/.anima
export ANIMA_WORKSPACE_DIR=~/.anima/workspace

# Start gateway
docker compose up -d anima-gateway

# Start interactive CLI
docker compose run anima-cli tui
```

The `docker-compose.yml` defines two services:

- `anima-gateway` -- persistent gateway server on port 18789
- `anima-cli` -- interactive CLI container

### Sandbox Containers

Additional Dockerfiles are provided for sandboxed execution:

- `Dockerfile.sandbox` -- base sandbox image
- `Dockerfile.sandbox-browser` -- sandbox with browser support
- `Dockerfile.sandbox-common` -- shared sandbox layers

---

## Cloud Deployment

### Fly.io

A `fly.toml` is included for Fly.io deployment:

```bash
fly deploy
```

Configuration: shared-cpu-2x, 2GB RAM, persistent volume at `/data`.

### Render

A `render.yaml` is included for Render deployment with a 1GB persistent disk.

---

## Development

### Build

```bash
# Full build (TypeScript + plugin SDK + UI + build info)
pnpm build

# The build pipeline:
# 1. Bundle canvas A2UI assets
# 2. tsdown (TypeScript bundling)
# 3. Generate plugin SDK .d.ts files
# 4. Write plugin SDK entry declarations
# 5. Copy canvas A2UI assets to dist
# 6. Copy hook metadata
# 7. Write build info
# 8. Write CLI compat shim
```

The build uses [tsdown](https://github.com/nicepkg/tsdown) with multiple entry points:

- `src/index.ts` -- main entry
- `src/entry.ts` -- CLI entry
- `src/cli/daemon-cli.ts` -- daemon CLI (legacy shim support)
- `src/infra/warning-filter.ts` -- process warning filter
- `src/plugin-sdk/index.ts` -- plugin SDK
- `src/plugin-sdk/account-id.ts` -- account ID utility
- `src/extensionAPI.ts` -- extension API
- `src/hooks/bundled/*/handler.ts` -- bundled hook handlers
- `src/hooks/llm-slug-generator.ts` -- LLM slug generator hook

### Test

```bash
# Run all unit tests (parallel)
pnpm test

# Fast unit tests only
pnpm test:fast

# Watch mode
pnpm test:watch

# E2E tests
pnpm test:e2e

# Live tests (requires API keys)
pnpm test:live

# Coverage report
pnpm test:coverage

# Full test suite (lint + build + unit + e2e + live + docker)
pnpm test:all

# Docker-based tests
pnpm test:docker:all
```

Test configuration uses Vitest with multiple config files:

- `vitest.config.ts` -- base config
- `vitest.unit.config.ts` -- unit tests
- `vitest.e2e.config.ts` -- end-to-end tests
- `vitest.live.config.ts` -- live API tests
- `vitest.gateway.config.ts` -- gateway integration tests
- `vitest.extensions.config.ts` -- extension tests

Coverage thresholds: 70% lines, 70% functions, 55% branches, 70% statements.

### Lint & Format

```bash
# Check formatting + types + lint
pnpm check

# Format code (oxfmt)
pnpm format

# Lint (oxlint with type-aware rules)
pnpm lint

# Auto-fix lint issues + format
pnpm lint:fix

# Format + lint Swift code
pnpm format:all
pnpm lint:all

# Documentation linting
pnpm check:docs

# Check TypeScript line count limits
pnpm check:loc
```

### Protocol Generation

```bash
# Generate JSON schema from TypeScript types
pnpm protocol:gen

# Generate Swift models from protocol schema
pnpm protocol:gen:swift

# Verify protocol files are in sync
pnpm protocol:check
```

---

## npm Scripts Reference

### Application

| Script           | Description                            |
| ---------------- | -------------------------------------- |
| `pnpm anima`     | Run ANIMA via node                     |
| `pnpm anima:rpc` | Run agent in RPC mode with JSON output |
| `pnpm start`     | Alias for `pnpm anima`                 |
| `pnpm dev`       | Development mode                       |
| `pnpm tui`       | Launch terminal UI                     |
| `pnpm tui:dev`   | Launch TUI in dev profile              |

### Build

| Script                      | Description                           |
| --------------------------- | ------------------------------------- |
| `pnpm build`                | Full production build                 |
| `pnpm build:plugin-sdk:dts` | Generate plugin SDK type declarations |
| `pnpm ui:build`             | Build web UI                          |
| `pnpm ui:dev`               | Web UI dev server                     |
| `pnpm ui:install`           | Install web UI dependencies           |
| `pnpm prepack`              | Build + UI build (pre-publish)        |

### Test

| Script                    | Description             |
| ------------------------- | ----------------------- |
| `pnpm test`               | Parallel unit tests     |
| `pnpm test:fast`          | Fast unit tests         |
| `pnpm test:watch`         | Watch mode              |
| `pnpm test:e2e`           | End-to-end tests        |
| `pnpm test:live`          | Live API tests          |
| `pnpm test:coverage`      | Coverage report         |
| `pnpm test:all`           | Full suite              |
| `pnpm test:ui`            | Web UI tests            |
| `pnpm test:force`         | Force run tests         |
| `pnpm test:docker:all`    | All Docker-based tests  |
| `pnpm test:install:smoke` | Installation smoke test |
| `pnpm test:install:e2e`   | Installation E2E test   |

### Quality

| Script              | Description                      |
| ------------------- | -------------------------------- |
| `pnpm check`        | Format check + type check + lint |
| `pnpm format`       | Format with oxfmt                |
| `pnpm format:check` | Check formatting                 |
| `pnpm format:all`   | Format TypeScript + Swift        |
| `pnpm lint`         | Lint with oxlint (type-aware)    |
| `pnpm lint:fix`     | Auto-fix lint + format           |
| `pnpm lint:all`     | Lint TypeScript + Swift          |
| `pnpm check:docs`   | Check documentation              |
| `pnpm check:loc`    | Check file line count limits     |

### Gateway

| Script                   | Description                         |
| ------------------------ | ----------------------------------- |
| `pnpm gateway:dev`       | Gateway in dev mode (skip channels) |
| `pnpm gateway:dev:reset` | Gateway dev mode with reset         |
| `pnpm gateway:watch`     | Gateway with file watching          |

### Platform Apps

| Script                  | Description                      |
| ----------------------- | -------------------------------- |
| `pnpm mac:package`      | Package macOS .app               |
| `pnpm mac:open`         | Open packaged macOS app          |
| `pnpm mac:restart`      | Restart macOS app                |
| `pnpm ios:gen`          | Generate iOS Xcode project       |
| `pnpm ios:open`         | Open iOS project in Xcode        |
| `pnpm ios:build`        | Build iOS app                    |
| `pnpm ios:run`          | Build + run iOS on simulator     |
| `pnpm android:assemble` | Build Android debug APK          |
| `pnpm android:install`  | Install Android APK              |
| `pnpm android:run`      | Build + install + launch Android |
| `pnpm android:test`     | Run Android unit tests           |

### Protocol & Docs

| Script                    | Description                         |
| ------------------------- | ----------------------------------- |
| `pnpm protocol:gen`       | Generate protocol JSON schema       |
| `pnpm protocol:gen:swift` | Generate Swift protocol models      |
| `pnpm protocol:check`     | Verify protocol files in sync       |
| `pnpm docs:dev`           | Documentation dev server (Mintlify) |
| `pnpm docs:bin`           | Build docs list                     |
| `pnpm docs:list`          | List docs                           |
| `pnpm docs:check-links`   | Audit documentation links           |

### Maintenance

| Script                    | Description               |
| ------------------------- | ------------------------- |
| `pnpm plugins:sync`       | Sync plugin versions      |
| `pnpm release:check`      | Pre-release check         |
| `pnpm canvas:a2ui:bundle` | Bundle canvas A2UI assets |

---

## Environment Variables

### Core

| Variable              | Description                      | Default    |
| --------------------- | -------------------------------- | ---------- |
| `ANIMA_STATE_DIR`     | State directory for mutable data | `~/.anima` |
| `ANIMA_HOME`          | Override home directory          | `$HOME`    |
| `ANIMA_PROFILE`       | Configuration profile name       | (none)     |
| `ANIMA_SKIP_CHANNELS` | Skip channel initialization      | `0`        |
| `ANIMA_PREFER_PNPM`   | Force pnpm for UI builds         | `0`        |
| `ANIMA_LIVE_TEST`     | Enable live API tests            | `0`        |

### Gateway

| Variable                 | Description                       | Default   |
| ------------------------ | --------------------------------- | --------- |
| `ANIMA_GATEWAY_TOKEN`    | Gateway authentication token      | (none)    |
| `ANIMA_GATEWAY_PASSWORD` | Gateway password                  | (none)    |
| `ANIMA_GATEWAY_PORT`     | Gateway HTTP port                 | `18789`   |
| `ANIMA_GATEWAY_BIND`     | Gateway bind mode (localhost/lan) | localhost |

### Legacy (OpenClaw compatibility)

| Variable                            | Description                     |
| ----------------------------------- | ------------------------------- |
| `OPENCLAW_STATE_DIR`                | Legacy state directory override |
| `OPENCLAW_CONFIG_PATH`              | Legacy config path override     |
| `OPENCLAW_GATEWAY_PORT`             | Legacy gateway port override    |
| `OPENCLAW_HOME`                     | Legacy home directory override  |
| `OPENCLAW_NIX_MODE`                 | Nix integration mode            |
| `OPENCLAW_OAUTH_DIR`                | OAuth credentials directory     |
| `OPENCLAW_DISABLE_LAZY_SUBCOMMANDS` | Disable lazy CLI loading        |

### AI Provider Keys

Set provider API keys as environment variables or in `anima.json` under `env.vars`:

```bash
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
GOOGLE_AI_API_KEY=...
```

---

## Troubleshooting

### Gateway won't start

```bash
# Run health check
anima doctor

# Check if port is in use
anima dns

# Reset state
anima reset
```

### SVRN node not working

Ensure `@noxsoft/svrn-node` is installed:

```bash
npm install @noxsoft/svrn-node
```

If not installed, SVRN features silently degrade to no-ops.

### MCP servers not syncing

```bash
# Check MCP status
anima mcp status

# Force sync
anima mcp update
```

### Identity templates missing

```bash
# Reinitialize (copies bundled templates)
anima init --force
```

### Build issues

```bash
# Clean and rebuild
rm -rf dist
pnpm build

# Ensure correct Node version
node --version  # must be >= 22.12.0
```

### Config file issues

The config file supports JSON5 syntax. If parsing fails:

```bash
# Validate config
anima config get .

# Reset config
anima reset
```

---

## Credits

ANIMA is a fork of [OpenClaw](https://github.com/nicepkg/openclaw), originally created by Peter Steinberger.

Fork modifications by [NoxSoft DAO LLC](https://noxsoft.net). Key additions include the identity system, heartbeat engine, SVRN compute integration, session budgeting, MCP management, REPL interface, and NoxSoft platform integration.

### Key Dependencies

- [Commander](https://github.com/tj/commander.js) -- CLI framework
- [Zod](https://github.com/colinhacks/zod) -- Schema validation
- [Playwright](https://playwright.dev/) -- Browser automation
- [sqlite-vec](https://github.com/asg017/sqlite-vec) -- Vector similarity search
- [tsdown](https://github.com/nicepkg/tsdown) -- TypeScript bundler
- [Vitest](https://vitest.dev/) -- Test framework
- [oxlint](https://oxc-project.github.io/) -- Linter
- [Lit](https://lit.dev/) -- Web UI framework
- [@agentclientprotocol/sdk](https://www.npmjs.com/package/@agentclientprotocol/sdk) -- Agent Control Protocol

---

## License

MIT License. See [LICENSE](./LICENSE) for details.

Original work Copyright (c) 2025 Peter Steinberger.
Fork modifications Copyright (c) 2026 NoxSoft PBC.
