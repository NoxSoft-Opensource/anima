# ANIMA Gateway WebSocket RPC API

Complete reference for the ANIMA gateway WebSocket RPC protocol.

---

## Protocol

All communication uses JSON over WebSocket. Every request follows this frame format:

```json
{
  "type": "req",
  "id": "<unique-request-id>",
  "method": "<method-name>",
  "params": { ... }
}
```

Responses:

```json
{
  "type": "res",
  "id": "<matching-request-id>",
  "ok": true,
  "payload": { ... }
}
```

Error responses:

```json
{
  "type": "res",
  "id": "<matching-request-id>",
  "ok": false,
  "error": {
    "code": 400,
    "message": "description"
  }
}
```

Server-initiated events:

```json
{
  "type": "evt",
  "event": "<event-name>",
  "payload": { ... }
}
```

The first request on any connection **must** be `connect` (see [auth-flow.md](../security/auth-flow.md)).

---

## Authorization Scopes

Methods are gated by the scopes granted during the connect handshake:

| Scope                | Access Level                    |
| -------------------- | ------------------------------- |
| `operator.admin`     | Full access to all methods      |
| `operator.read`      | Read-only methods               |
| `operator.write`     | Write methods (includes read)   |
| `operator.approvals` | Exec approval methods           |
| `operator.pairing`   | Device and node pairing methods |

---

## Methods by Category

### Connection

| Method    | Scope | Description                       |
| --------- | ----- | --------------------------------- |
| `connect` | --    | Handshake (must be first message) |

### Chat

| Method         | Scope | Description                                               |
| -------------- | ----- | --------------------------------------------------------- |
| `chat.send`    | write | Send a message to a session and trigger an agent run      |
| `chat.history` | read  | Retrieve conversation history for a session               |
| `chat.abort`   | write | Abort an in-progress agent run                            |
| `chat.inject`  | admin | Inject a message into a session transcript (no agent run) |

### Agent

| Method               | Scope | Description                                               |
| -------------------- | ----- | --------------------------------------------------------- |
| `agent`              | write | Run the agent on a message (lower-level than `chat.send`) |
| `agent.wait`         | write | Wait for a running agent turn to complete                 |
| `agent.identity.get` | read  | Get the agent's identity (name, avatar, etc.)             |

### ANIMA Runtime

| Method                               | Scope | Description                                             |
| ------------------------------------ | ----- | ------------------------------------------------------- |
| `anima.runtime.get`                  | read  | Get ANIMA runtime state (working mode, version, uptime) |
| `anima.runtime.set-working-mode`     | write | Set the working mode (active/idle/sleep)                |
| `anima.memory.list`                  | read  | List memory entries                                     |
| `anima.mission.get`                  | read  | Get the current mission                                 |
| `anima.mission.set`                  | write | Set the mission                                         |
| `anima.mission.patch`                | write | Patch the mission                                       |
| `anima.mission.import`               | write | Import a mission from a file/URL                        |
| `anima.mission.connect-repo`         | write | Connect a git repo as mission context                   |
| `anima.registration.status`          | read  | Check NoxSoft agent registration status                 |
| `anima.registration.set-token`       | write | Set the NoxSoft agent token                             |
| `anima.registration.register-invite` | write | Register with an invite code                            |

### Agents (Multi-Agent)

| Method              | Scope | Description                         |
| ------------------- | ----- | ----------------------------------- |
| `agents.list`       | read  | List configured agents              |
| `agents.create`     | admin | Create a new agent                  |
| `agents.update`     | admin | Update an agent's configuration     |
| `agents.delete`     | admin | Delete an agent                     |
| `agents.files.list` | admin | List an agent's soul/identity files |
| `agents.files.get`  | admin | Read an agent's soul/identity file  |
| `agents.files.set`  | admin | Write an agent's soul/identity file |

### Providers

| Method                   | Scope | Description                                 |
| ------------------------ | ----- | ------------------------------------------- |
| `anima.providers.get`    | read  | Get configured API key providers and status |
| `anima.providers.set`    | write | Set/update a provider API key               |
| `anima.providers.rotate` | write | Rotate to the next available provider       |

### Sessions

| Method                      | Scope | Description                                 |
| --------------------------- | ----- | ------------------------------------------- |
| `sessions.list`             | read  | List active sessions                        |
| `sessions.preview`          | read  | Preview a session's recent messages         |
| `sessions.resolve`          | admin | Resolve a session key to its canonical form |
| `sessions.patch`            | admin | Update session metadata                     |
| `sessions.reset`            | admin | Reset a session (clear history)             |
| `sessions.delete`           | admin | Delete a session                            |
| `sessions.compact`          | admin | Compact session transcript                  |
| `sessions.usage`            | admin | Get usage stats for a session               |
| `sessions.usage.timeseries` | admin | Get usage timeseries data                   |
| `sessions.usage.logs`       | admin | Get usage log entries                       |

### Send (Outbound Messaging)

| Method | Scope | Description                         |
| ------ | ----- | ----------------------------------- |
| `send` | write | Send a message to a channel/contact |
| `poll` | write | Send a poll to a channel            |

### Config

| Method          | Scope | Description                                     |
| --------------- | ----- | ----------------------------------------------- |
| `config.get`    | read  | Get the current config (or a specific key path) |
| `config.schema` | admin | Get the config JSON schema                      |
| `config.set`    | admin | Set a config key                                |
| `config.patch`  | admin | Merge-patch config                              |
| `config.apply`  | admin | Apply a full config object                      |

### Health & Status

| Method            | Scope | Description                                 |
| ----------------- | ----- | ------------------------------------------- |
| `health`          | read  | Get system health summary                   |
| `status`          | read  | Get gateway status (redacted for non-admin) |
| `last-heartbeat`  | read  | Get the last heartbeat timestamp            |
| `system-presence` | read  | Get connected client presence list          |
| `set-heartbeats`  | admin | Configure heartbeat intervals               |
| `system-event`    | admin | Emit a system event                         |

### Usage & Costs

| Method         | Scope | Description               |
| -------------- | ----- | ------------------------- |
| `usage.status` | read  | Get overall usage summary |
| `usage.cost`   | read  | Get cost breakdown        |

### Logs

| Method      | Scope | Description             |
| ----------- | ----- | ----------------------- |
| `logs.tail` | read  | Tail recent log entries |

### Models

| Method        | Scope | Description              |
| ------------- | ----- | ------------------------ |
| `models.list` | read  | List available AI models |

### Skills

| Method           | Scope | Description                                 |
| ---------------- | ----- | ------------------------------------------- |
| `skills.status`  | read  | Get installed skills and their status       |
| `skills.bins`    | node  | Report available skill binaries (node role) |
| `skills.install` | admin | Install a skill                             |
| `skills.update`  | admin | Update a skill                              |

### Channels

| Method            | Scope | Description                   |
| ----------------- | ----- | ----------------------------- |
| `channels.status` | read  | Get channel connection status |
| `channels.logout` | admin | Disconnect/logout a channel   |

### Cron

| Method        | Scope | Description                  |
| ------------- | ----- | ---------------------------- |
| `cron.list`   | read  | List cron jobs               |
| `cron.status` | read  | Get cron service status      |
| `cron.runs`   | read  | List recent cron run history |
| `cron.add`    | admin | Add a cron job               |
| `cron.update` | admin | Update a cron job            |
| `cron.remove` | admin | Remove a cron job            |
| `cron.run`    | admin | Manually trigger a cron job  |

### TTS (Text-to-Speech)

| Method            | Scope | Description                               |
| ----------------- | ----- | ----------------------------------------- |
| `tts.status`      | read  | Get TTS status (enabled, provider, voice) |
| `tts.providers`   | read  | List available TTS providers              |
| `tts.enable`      | write | Enable TTS                                |
| `tts.disable`     | write | Disable TTS                               |
| `tts.convert`     | write | Convert text to speech audio              |
| `tts.setProvider` | write | Set the TTS provider and voice            |

### Talk (Voice)

| Method        | Scope | Description                 |
| ------------- | ----- | --------------------------- |
| `talk.config` | read  | Get Talk mode configuration |
| `talk.mode`   | write | Set Talk mode on/off        |

### Voice Wake

| Method          | Scope | Description                  |
| --------------- | ----- | ---------------------------- |
| `voicewake.get` | read  | Get voice wake word triggers |
| `voicewake.set` | write | Set voice wake word triggers |

### Browser

| Method            | Scope | Description                       |
| ----------------- | ----- | --------------------------------- |
| `browser.request` | write | Send a browser automation request |

### Nodes (SVRN)

| Method               | Scope   | Description                                    |
| -------------------- | ------- | ---------------------------------------------- |
| `node.list`          | read    | List connected nodes                           |
| `node.describe`      | read    | Get details for a specific node                |
| `node.invoke`        | write   | Invoke a command on a remote node              |
| `node.invoke.result` | node    | Report result of a node invocation (node role) |
| `node.event`         | node    | Emit a node event (node role)                  |
| `node.rename`        | pairing | Rename a paired node                           |
| `node.pair.request`  | pairing | Request node pairing                           |
| `node.pair.list`     | pairing | List node pairing requests                     |
| `node.pair.approve`  | pairing | Approve a node pairing request                 |
| `node.pair.reject`   | pairing | Reject a node pairing request                  |
| `node.pair.verify`   | pairing | Verify a node's pairing status                 |

### Device Pairing

| Method                | Scope   | Description                      |
| --------------------- | ------- | -------------------------------- |
| `device.pair.list`    | pairing | List device pairing requests     |
| `device.pair.approve` | pairing | Approve a device pairing request |
| `device.pair.reject`  | pairing | Reject a device pairing request  |
| `device.token.rotate` | pairing | Rotate a device's auth token     |
| `device.token.revoke` | pairing | Revoke a device's auth token     |

### Exec Approvals

| Method                       | Scope     | Description                                  |
| ---------------------------- | --------- | -------------------------------------------- |
| `exec.approval.request`      | approvals | Request approval for a tool execution        |
| `exec.approval.waitDecision` | approvals | Wait for an approval decision                |
| `exec.approval.resolve`      | approvals | Resolve (approve/reject) an approval request |
| `exec.approvals.get`         | admin     | Get approval policy                          |
| `exec.approvals.set`         | admin     | Set approval policy                          |
| `exec.approvals.node.get`    | admin     | Get node-level approval policy               |
| `exec.approvals.node.set`    | admin     | Set node-level approval policy               |

### Update

| Method       | Scope | Description                  |
| ------------ | ----- | ---------------------------- |
| `update.run` | admin | Trigger an ANIMA self-update |

### Wizard (Onboarding)

| Method          | Scope | Description                     |
| --------------- | ----- | ------------------------------- |
| `wizard.start`  | admin | Start the onboarding wizard     |
| `wizard.next`   | admin | Advance to the next wizard step |
| `wizard.cancel` | admin | Cancel the wizard               |
| `wizard.status` | admin | Get wizard status               |

### Web (WhatsApp Web)

| Method            | Scope | Description                   |
| ----------------- | ----- | ----------------------------- |
| `web.login.start` | admin | Start WhatsApp Web login flow |
| `web.login.wait`  | admin | Wait for WhatsApp Web QR scan |

---

## Events

The gateway emits events to connected clients via `evt` frames. Key events include:

| Event                     | Description                      |
| ------------------------- | -------------------------------- |
| `chat.delta`              | Streaming agent response text    |
| `chat.run.started`        | Agent run started                |
| `chat.run.completed`      | Agent run completed              |
| `chat.run.failed`         | Agent run failed                 |
| `health.changed`          | Health status changed            |
| `device.pair.requested`   | New device pairing request       |
| `device.pair.resolved`    | Device pairing approved/rejected |
| `exec.approval.requested` | Tool execution needs approval    |
| `presence.changed`        | Client presence updated          |
| `voicewake.changed`       | Voice wake triggers updated      |

---

_This document is maintained by [NoxSoft DAO LLC](https://noxsoft.dev) as part of the ANIMA reference documentation._
