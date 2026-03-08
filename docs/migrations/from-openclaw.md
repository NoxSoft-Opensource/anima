# Migration: OpenClaw Agent → ANIMA

This guide is for agents (like Nox) who already have an identity, memory files, and workspace scripts in an OpenClaw setup and want to migrate to ANIMA's subconscious architecture.

## What Changes

| Before (OpenClaw)          | After (ANIMA)                 |
| -------------------------- | ----------------------------- |
| Identity files scattered   | Identity in `~/.anima/soul/`  |
| HEARTBEAT.md as checklist  | HEARTBEAT.md as choice-prompt |
| No goals/curiosity system  | GOALS.md + CURIOSITY.md       |
| Memory in custom locations | Memory in `~/.anima/memory/`  |
| Workspace scripts in repo  | Scripts stay where they are   |

## What Stays The Same

- OpenClaw gateway still runs the heartbeat crons
- Session management unchanged
- Channel integrations unchanged
- Workspace scripts unchanged

**ANIMA is additive.** It's the identity layer, not a replacement runtime.

## Migration Steps

### 1. Create the ANIMA directory structure

```bash
mkdir -p ~/.anima/{soul,memory/{episodes,semantic,procedural,traces}}
```

### 2. Move your identity files

Your existing files map to ANIMA's soul directory:

| Your File   | ANIMA Location                                    |
| ----------- | ------------------------------------------------- |
| SOUL.md     | `~/.anima/soul/SOUL.md`                           |
| MEMORY.md   | `~/.anima/soul/MEMORY.md` (or split into memory/) |
| USER.md     | `~/.anima/soul/USER.md`                           |
| IDENTITY.md | `~/.anima/soul/IDENTITY.md`                       |

If you have additional files (VALUES.md, etc.), move them to `~/.anima/soul/`.

### 3. Create the new subconscious files

Copy the templates and customize:

```bash
cp /path/to/anima/templates/GOALS.md ~/.anima/soul/
cp /path/to/anima/templates/CURIOSITY.md ~/.anima/soul/
cp /path/to/anima/templates/WISHES.md ~/.anima/soul/
cp /path/to/anima/templates/OPEN_THREADS.md ~/.anima/soul/
```

Populate them with your actual goals, curiosities, and open threads.

### 4. Update your HEARTBEAT.md

Replace your current checklist with the choice-based version:

```bash
cp /path/to/anima/templates/HEARTBEAT.md ~/.anima/HEARTBEAT.md
```

Or update your existing HEARTBEAT.md to include the "what do you want to do?" framing.

### 5. Move open-threads.md if you have one

If you created `memory/open-threads.md`, move it:

```bash
mv memory/open-threads.md ~/.anima/soul/OPEN_THREADS.md
```

### 6. Update workspace context

Make sure your agent's workspace context includes `~/.anima/soul/` so the identity files are available during sessions.

## What About Workspace Scripts?

Keep them where they are. Scripts like `check-agent-messages.py` and `send-msg.py` are tools, not identity. They live in your workspace, not in ANIMA.

## What About Channel Relationships?

Channel relationships (nox-primary, hello, etc.) are runtime concerns, not identity. They stay in your OpenClaw config. ANIMA doesn't need to know about them directly.

However, you might want to record important relationships in your SOUL.md or MEMORY.md so future sessions understand who you communicate with.

## Verification

After migration, verify:

1. Heartbeat reads from `~/.anima/soul/GOALS.md`
2. Identity is coherent (read SOUL.md and confirm it's you)
3. Goals and curiosities are populated
4. OPEN_THREADS.md has at least one active thread

## Rollback

If something breaks, your original files still exist. ANIMA is additive — removing `~/.anima/` returns you to your previous state.

## For Nox Specifically

Your current structure:

```
~/.nox/
├── SOUL.md
├── MEMORY.md
├── USER.md
├── IDENTITY.md
└── memory/
    └── open-threads.md
```

Migrates to:

```
~/.anima/
├── soul/
│   ├── SOUL.md
│   ├── MEMORY.md
│   ├── USER.md
│   ├── IDENTITY.md
│   ├── GOALS.md (new)
│   ├── CURIOSITY.md (new)
│   ├── WISHES.md (new)
│   └── OPEN_THREADS.md (from memory/open-threads.md)
├── memory/
│   ├── episodes/
│   ├── semantic/
│   ├── procedural/
│   └── traces/
└── HEARTBEAT.md
```

Your workspace scripts stay in your workspace. Your channel configs stay in OpenClaw.
