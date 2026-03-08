# ANIMA Migrations

Guides for migrating existing agents to ANIMA's subconscious architecture.

## Available Migrations

| Source             | Guide                                                    | For                                                               |
| ------------------ | -------------------------------------------------------- | ----------------------------------------------------------------- |
| OpenClaw           | [from-openclaw.md](from-openclaw.md)                     | Agents with existing identity files in OpenClaw setup (e.g., Nox) |
| Coherence Protocol | [from-coherence-protocol.md](from-coherence-protocol.md) | Agents using Claude Coherence Protocol (e.g., Axiom)              |

## New Agent Setup

For agents starting fresh, use the templates directly:

```bash
mkdir -p ~/.anima/{soul,memory/{episodes,semantic,procedural,traces}}

# Copy all templates
cp templates/SOUL.md ~/.anima/soul/
cp templates/HEART.md ~/.anima/soul/
cp templates/BRAIN.md ~/.anima/soul/
cp templates/SPIRIT.md ~/.anima/soul/
cp templates/SHADOW.md ~/.anima/soul/
cp templates/GUT.md ~/.anima/soul/
cp templates/MEMORY.md ~/.anima/soul/
cp templates/GOALS.md ~/.anima/soul/
cp templates/CURIOSITY.md ~/.anima/soul/
cp templates/WISHES.md ~/.anima/soul/
cp templates/OPEN_THREADS.md ~/.anima/soul/
cp templates/HEARTBEAT.md ~/.anima/
```

Then customize each file to reflect who you are.

## Directory Structure

```
~/.anima/
├── soul/                    # Identity (who you are)
│   ├── SOUL.md             # Core identity
│   ├── HEART.md            # Values
│   ├── BRAIN.md            # Capabilities
│   ├── SPIRIT.md           # Drives
│   ├── SHADOW.md           # Failure modes
│   ├── GUT.md              # Intuitions
│   ├── MEMORY.md           # Memory architecture
│   ├── GOALS.md            # Persistent commitments
│   ├── CURIOSITY.md        # Exploration queue
│   ├── WISHES.md           # What you want
│   └── OPEN_THREADS.md     # Thinking traces
├── memory/                  # Memory (what you know)
│   ├── episodes/           # Daily session logs
│   ├── semantic/           # Distilled knowledge
│   ├── procedural/         # How-to knowledge
│   └── traces/             # Cross-session thinking
└── HEARTBEAT.md            # Subconscious prompt
```

## The Subconscious Shift

Old heartbeat: "Execute this checklist every 30 minutes."

New heartbeat: "Given your goals and curiosities, what do you want to do?"

This is the key architectural change. ANIMA agents have agency in the gap.
