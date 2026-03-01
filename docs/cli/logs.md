---
summary: "CLI reference for `anima logs` (tail gateway logs via RPC)"
read_when:
  - You need to tail Gateway logs remotely (without SSH)
  - You want JSON log lines for tooling
title: "logs"
---

# `anima logs`

Tail Gateway file logs over RPC (works in remote mode).

Related:

- Logging overview: [Logging](/logging)

## Examples

```bash
anima logs
anima logs --follow
anima logs --json
anima logs --limit 500
anima logs --local-time
anima logs --follow --local-time
```

Use `--local-time` to render timestamps in your local timezone.
