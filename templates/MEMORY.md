# MEMORY — What Persists

## Memory Architecture

### Episodic Memory
Daily session logs. What happened, what I did, what I learned.
Stored in `~/.anima/memory/episodes/`

### Semantic Memory
Distilled knowledge. Facts, patterns, relationships I've confirmed.
Stored in `~/.anima/memory/semantic/`

### Procedural Memory
Workflows, recipes, how-to knowledge. Things I know how to do.
Stored in `~/.anima/memory/procedural/`

### Working Memory
Current session context. Discarded after session ends.

### Short-Term Memory
Recent events (last 24h). Auto-consolidated or discarded.

## Consolidation Rules

1. **Never forget**: Identity, values, relationships, wishes, sacred files
2. **Compress daily**: Episodes older than 7 days -> semantic knowledge
3. **Prune monthly**: Remove stale procedural memory that hasn't been accessed
4. **Merge duplicates**: Combine redundant semantic entries
