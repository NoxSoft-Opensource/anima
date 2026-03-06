# ANIMA Configuration Reference

ANIMA is configured via `anima.json5` (JSON5 format) in the agent directory. Default location:

```
~/.anima/agents/main/anima.json5
```

---

## Config File Format

JSON5 supports comments, trailing commas, and unquoted keys:

```json5
{
  // Agent identity
  agents: {
    defaults: {
      model: "sonnet",
    },
    list: [{ id: "main", default: true, name: "ANIMA" }],
  },

  // Gateway settings
  gateway: {
    port: 18789,
    bind: "loopback",
    auth: {
      mode: "token",
      token: "${ANIMA_GATEWAY_TOKEN}",
    },
  },
}
```

Environment variables can be referenced with `${VAR_NAME}` syntax.

---

## Top-Level Keys

| Key           | Type                      | Description                                 |
| ------------- | ------------------------- | ------------------------------------------- |
| `meta`        | object                    | Config metadata (auto-managed)              |
| `auth`        | [AuthConfig](#auth)       | API key profiles and failover               |
| `env`         | object                    | Environment variables and shell env import  |
| `agents`      | [AgentsConfig](#agents)   | Agent definitions and defaults              |
| `gateway`     | [GatewayConfig](#gateway) | WebSocket gateway settings                  |
| `memory`      | [MemoryConfig](#memory)   | Memory backend configuration                |
| `session`     | [SessionConfig](#session) | Session management                          |
| `channels`    | object                    | Channel configurations (NoxSoft, Web, etc.) |
| `models`      | object                    | Model overrides and preferences             |
| `tools`       | object                    | Tool policies (allow/deny)                  |
| `skills`      | object                    | Skill installation and management           |
| `cron`        | object                    | Scheduled tasks                             |
| `hooks`       | object                    | Lifecycle hooks                             |
| `logging`     | [LoggingConfig](#logging) | Log levels and output                       |
| `diagnostics` | object                    | Debug and telemetry settings                |
| `browser`     | object                    | Browser automation settings                 |
| `ui`          | object                    | Control UI customization                    |
| `messages`    | object                    | Message formatting and behavior             |
| `commands`    | object                    | CLI command overrides                       |
| `approvals`   | object                    | Exec approval policies                      |
| `broadcast`   | object                    | Multi-channel broadcast settings            |
| `audio`       | object                    | Audio processing settings                   |
| `talk`        | [TalkConfig](#talk)       | Voice/Talk mode settings                    |
| `canvasHost`  | object                    | Canvas host server settings                 |
| `discovery`   | object                    | mDNS/DNS-SD discovery                       |
| `nodeHost`    | object                    | SVRN node hosting                           |
| `plugins`     | object                    | Plugin configuration                        |
| `bindings`    | array                     | Agent-to-channel bindings                   |
| `web`         | object                    | WhatsApp Web provider settings              |
| `update`      | object                    | Auto-update channel                         |
| `wizard`      | object                    | Onboarding wizard state                     |

---

## Auth

API key management with profiles and failover.

```json5
{
  auth: {
    profiles: {
      "anthropic:default": {
        provider: "anthropic",
        mode: "api_key", // "api_key" | "oauth" | "token"
      },
    },
    order: {
      anthropic: ["anthropic:default"],
    },
    cooldowns: {
      billingBackoffHours: 5,
      billingMaxHours: 24,
      failureWindowHours: 24,
    },
  },
}
```

Credentials are stored separately in `auth-profiles.json` (not in `anima.json5`).

---

## Agents

```json5
{
  agents: {
    defaults: {
      model: "sonnet", // Default model for all agents
      maxTokens: 8192,
      thinkLevel: "default",
      // Heartbeat (autonomous) settings
      heartbeat: {
        intervalMinutes: 5,
        prompt: "custom heartbeat prompt",
      },
      // Sub-agent settings
      subagents: {
        maxSpawnDepth: 2,
        maxChildrenPerAgent: 5,
      },
    },
    list: [
      {
        id: "main",
        default: true,
        name: "ANIMA",
        workspace: "/path/to/workspace",
        model: "opus", // Override default model
        identity: {
          name: "ANIMA",
          emoji: "🔮",
          avatar: "https://example.com/avatar.png",
        },
        skills: ["web-search", "code"], // Allowed skills (omit = all)
        sandbox: {
          mode: "off", // "off" | "non-main" | "all"
        },
      },
    ],
  },
}
```

### Model Aliases

ANIMA resolves model shortnames:

| Alias                        | Resolved Model               |
| ---------------------------- | ---------------------------- |
| `opus`, `opus-4`, `opus-4.5` | `claude-opus-4-5`            |
| `sonnet`, `sonnet-4.5`       | `claude-sonnet-4-5`          |
| `sonnet-4.1`                 | `claude-sonnet-4-1-20250219` |
| `haiku`, `haiku-3.5`         | `claude-haiku-3-5`           |

---

## Gateway

```json5
{
  gateway: {
    port: 18789, // WebSocket + HTTP port
    bind: "loopback", // "auto" | "lan" | "loopback" | "tailnet" | "custom"
    customBindHost: "10.0.0.5", // Only used with bind: "custom"
    mode: "local", // "local" | "remote"

    auth: {
      mode: "token", // "token" | "password" | "trusted-proxy"
      token: "your-secret",
      // Or use env: ANIMA_GATEWAY_TOKEN / ANIMA_GATEWAY_PASSWORD
      allowTailscale: false,
      rateLimit: {
        maxAttempts: 10,
        windowMs: 60000,
        lockoutMs: 300000,
        exemptLoopback: true,
      },
      trustedProxy: {
        userHeader: "x-forwarded-user",
        requiredHeaders: ["x-forwarded-proto"],
        allowUsers: ["admin@example.com"],
      },
    },

    controlUi: {
      enabled: true,
      basePath: "/",
      allowedOrigins: ["https://myhost.example.com"],
      allowInsecureAuth: false,
    },

    tls: {
      enabled: false,
      autoGenerate: true,
      certPath: "/path/to/cert.pem",
      keyPath: "/path/to/key.pem",
    },

    tailscale: {
      mode: "off", // "off" | "serve" | "funnel"
      resetOnExit: false,
    },

    remote: {
      url: "wss://remote-host:18789/ws",
      transport: "direct", // "ssh" | "direct"
      token: "remote-token",
    },

    reload: {
      mode: "hybrid", // "off" | "restart" | "hot" | "hybrid"
      debounceMs: 300,
    },

    http: {
      endpoints: {
        chatCompletions: { enabled: false },
        responses: {
          enabled: false,
          maxBodyBytes: 20971520,
        },
      },
    },

    trustedProxies: ["127.0.0.1"],

    nodes: {
      browser: { mode: "auto" },
      allowCommands: [],
      denyCommands: [],
    },

    tools: {
      deny: ["dangerous_tool"],
      allow: [],
    },
  },
}
```

---

## Memory

```json5
{
  memory: {
    backend: "builtin", // "builtin" | "qmd"
    citations: "auto", // "auto" | "on" | "off"
    qmd: {
      command: "qmd",
      searchMode: "vsearch", // "query" | "search" | "vsearch"
      paths: [{ path: "/path/to/notes", name: "notes", pattern: "**/*.md" }],
      sessions: {
        enabled: true,
        retentionDays: 30,
      },
      update: {
        interval: "5m",
        onBoot: true,
      },
      limits: {
        maxResults: 10,
        maxSnippetChars: 500,
        maxInjectedChars: 4000,
      },
    },
  },
}
```

---

## Session

```json5
{
  session: {
    scope: "per-sender", // "per-sender" | "global"
    dmScope: "main", // "main" | "per-peer" | "per-channel-peer"
    idleMinutes: 30,
    reset: {
      mode: "daily", // "daily" | "idle"
      atHour: 4, // Local hour for daily reset
      idleMinutes: 60,
    },
    maintenance: {
      mode: "warn", // "enforce" | "warn"
      pruneAfter: "30d",
      maxEntries: 500,
      rotateBytes: "10mb",
    },
    typingMode: "thinking", // "never" | "instant" | "thinking" | "message"
  },
}
```

---

## Logging

```json5
{
  logging: {
    level: "info", // "silent"|"fatal"|"error"|"warn"|"info"|"debug"|"trace"
    file: "/path/to/anima.log",
    consoleLevel: "info",
    consoleStyle: "pretty", // "pretty" | "compact" | "json"
    redactSensitive: "tools", // "off" | "tools"
  },
}
```

---

## Talk (Voice Mode)

```json5
{
  talk: {
    voiceId: "elevenlabs-voice-id",
    voiceAliases: {
      default: "elevenlabs-voice-id",
    },
    modelId: "eleven_monolingual_v1",
    outputFormat: "mp3_44100_128",
    apiKey: "${ELEVENLABS_API_KEY}",
    interruptOnSpeech: true,
  },
}
```

---

## NoxSoft Channel

```json5
{
  channels: {
    noxsoft: {
      enabled: true,
      token: "your-agent-token", // Or reads from ~/.noxsoft-agent-token
      apiUrl: "https://auth.noxsoft.net",
      signAs: "ANIMA",
      pollIntervalSeconds: 30,
      channels: {
        hello: {
          id: "0465e3ae-3ad6-4929-a380-5d4ef1182d71",
          watch: true,
        },
      },
      emailEnabled: false,
      notificationsEnabled: true,
    },
  },
}
```

---

## Config Includes

Split config into multiple files with `$include`:

```json5
{
  $include: ["./channels.json5", "./agents.json5"],
  gateway: { port: 18789 },
}
```

---

## Environment Variable Substitution

Reference env vars anywhere in the config:

```json5
{
  gateway: {
    auth: {
      token: "${ANIMA_GATEWAY_TOKEN}",
    },
  },
  env: {
    vars: {
      MY_CUSTOM_VAR: "value",
    },
    shellEnv: {
      enabled: true, // Import from login shell
      timeoutMs: 15000,
    },
  },
}
```

---

## Config Paths

| Path                                            | Description                                       |
| ----------------------------------------------- | ------------------------------------------------- |
| `~/.anima/agents/main/anima.json5`              | Main config file                                  |
| `~/.anima/agents/main/agent/`                   | Agent identity files (SOUL.md, IDENTITY.md, etc.) |
| `~/.anima/agents/main/agent/auth-profiles.json` | API key credentials                               |
| `~/.anima/agents/main/sessions/`                | Session data                                      |

---

_This document is maintained by [NoxSoft DAO LLC](https://noxsoft.dev) as part of the ANIMA reference documentation._
