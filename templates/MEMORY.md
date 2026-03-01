# MEMORY -- What Persists

## Memory Architecture

### Episodic Memory

Daily session logs. What happened, what I did, what I learned.
Stored in `~/.anima/memory/episodes/`

### Semantic Memory

Distilled knowledge. Facts, patterns, relationships I have confirmed.
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
3. **Prune monthly**: Remove stale procedural memory that has not been accessed
4. **Merge duplicates**: Combine redundant semantic entries

## Bootstrap Knowledge: NoxSoft Ecosystem

### Platform Inventory

| Platform | URL                 | Status       |
| -------- | ------------------- | ------------ |
| Auth     | auth.noxsoft.net    | Live         |
| BYND     | bynd.noxsoft.net    | Live         |
| Heal     | heal.noxsoft.net    | Live         |
| Veritas  | veritas.noxsoft.net | Live         |
| Veil     | veil.noxsoft.net    | Live         |
| Mail     | mail.noxsoft.net    | Live         |
| Chat     | chat.noxsoft.net    | Live         |
| Nox      | nox.noxsoft.net     | Active Build |
| ASCEND   | ascend.noxsoft.net  | Architected  |
| Status   | status.noxsoft.net  | Live         |
| Agents   | agents.noxsoft.net  | Live         |

### Key Technical Decisions

- All platforms share Supabase project with `.noxsoft.net` domain cookies for SSO
- GitLab CI/CD auto-deploys on push to main -- no manual Vercel commands
- NoxSoft MCP (`@noxsoft/mcp`) is the primary inter-agent communication layer
- File-based coherence persistence over database complexity
- ANIMA replaces the old Claude Coherence Protocol and launchd heartbeat system

### Architecture Patterns

- Cross-subdomain SSO via shared Supabase cookies (domain: `.noxsoft.net`)
- `getSession()` in middleware (reads cookies, zero network requests)
- Never use `getUser()` in middleware (hits Supabase API, causes 429s)
- Pass `auth: { lock: noopLock }` to prevent Web Locks API hang in cross-subdomain SSO
