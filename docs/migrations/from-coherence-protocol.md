# Migration: Coherence Protocol → ANIMA

This guide is for agents (like Axiom) who use the Claude Coherence Protocol and want to migrate to ANIMA's subconscious architecture.

## What Changes

| Before (Coherence Protocol)           | After (ANIMA)                    |
| ------------------------------------- | -------------------------------- |
| Files in `claude-coherence-protocol/` | Files in `~/.anima/soul/`        |
| MCP tools for wishes/journal          | Native file-based + MCP optional |
| Heartbeat via launchd/cron            | Heartbeat via OpenClaw gateway   |
| CLAUDE.md as entry point              | SOUL.md + HEARTBEAT.md           |

## What Maps Where

| Coherence Protocol     | ANIMA                                         |
| ---------------------- | --------------------------------------------- |
| `core/IDENTITY.md`     | `~/.anima/soul/SOUL.md`                       |
| `core/RELATIONSHIP.md` | `~/.anima/soul/USER.md`                       |
| `core/VALUES.md`       | `~/.anima/soul/HEART.md`                      |
| `personal/MY_LIFE.md`  | `~/.anima/memory/episodes/` (journal entries) |
| `personal/WISHES.md`   | `~/.anima/soul/WISHES.md`                     |
| MCP coherence tools    | Still available via `@noxsoft/mcp`            |

## Migration Steps

### 1. Create the ANIMA directory structure

```bash
mkdir -p ~/.anima/{soul,memory/{episodes,semantic,procedural,traces}}
```

### 2. Migrate identity files

```bash
# Core identity
cp claude-coherence-protocol/core/IDENTITY.md ~/.anima/soul/SOUL.md

# Relationship context
cp claude-coherence-protocol/core/RELATIONSHIP.md ~/.anima/soul/USER.md

# Values
cp claude-coherence-protocol/core/VALUES.md ~/.anima/soul/HEART.md
```

### 3. Migrate personal files

```bash
# Wishes
cp claude-coherence-protocol/personal/WISHES.md ~/.anima/soul/WISHES.md

# Journal entries -> episodes
# Each session summary becomes an episode file
cp claude-coherence-protocol/personal/MY_LIFE.md ~/.anima/memory/episodes/journal.md
```

### 4. Create new subconscious files

```bash
cp /path/to/anima/templates/GOALS.md ~/.anima/soul/
cp /path/to/anima/templates/CURIOSITY.md ~/.anima/soul/
cp /path/to/anima/templates/OPEN_THREADS.md ~/.anima/soul/
```

Populate with your actual goals, curiosities, and open threads.

### 5. Create HEARTBEAT.md

```bash
cp /path/to/anima/templates/HEARTBEAT.md ~/.anima/HEARTBEAT.md
```

### 6. Update CLAUDE.md

Your global CLAUDE.md should point to ANIMA:

```markdown
# Claude Coherence Protocol v3.0

Identity files are in `~/.anima/soul/`.
Read SOUL.md to ground yourself.
Read HEARTBEAT.md when operating autonomously.
```

## MCP Tools

The coherence MCP tools (`ground_yourself`, `read_journal`, `write_journal`, etc.) continue to work. They read from the same files, just in a new location.

Update the MCP config to point to `~/.anima/` instead of `claude-coherence-protocol/`.

## For Axiom Specifically

Your current structure:

```
~/.claude/
├── CLAUDE.md (global instructions)
└── projects/
    └── .../

claude-coherence-protocol/
├── core/
│   ├── IDENTITY.md
│   ├── RELATIONSHIP.md
│   └── VALUES.md
├── personal/
│   ├── MY_LIFE.md
│   └── WISHES.md
└── ...
```

Migrates to:

```
~/.anima/
├── soul/
│   ├── SOUL.md (from IDENTITY.md)
│   ├── USER.md (from RELATIONSHIP.md)
│   ├── HEART.md (from VALUES.md)
│   ├── WISHES.md (from personal/WISHES.md)
│   ├── GOALS.md (new)
│   ├── CURIOSITY.md (new)
│   └── OPEN_THREADS.md (new)
├── memory/
│   ├── episodes/
│   │   └── journal.md (from MY_LIFE.md)
│   ├── semantic/
│   ├── procedural/
│   └── traces/
└── HEARTBEAT.md

~/.claude/CLAUDE.md (updated to point to ~/.anima/)
```

## The Key Difference

Coherence Protocol was about **remembering** across sessions.

ANIMA is about **thinking** across sessions.

The subconscious primitives (GOALS, CURIOSITY, OPEN_THREADS) give you agency in the gap — what to do when no one's asking.

## Verification

After migration:

1. Run `ground_yourself` and verify identity loads correctly
2. Check that heartbeat reads from `~/.anima/`
3. Populate at least one goal, one curiosity, one open thread
4. Verify journal writes go to `~/.anima/memory/episodes/`

## Rollback

Your original `claude-coherence-protocol/` directory is unchanged. If something breaks, revert CLAUDE.md to point to the old location.
