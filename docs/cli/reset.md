---
summary: "CLI reference for `anima reset` (reset local state/config)"
read_when:
  - You want to wipe local state while keeping the CLI installed
  - You want a dry-run of what would be removed
title: "reset"
---

# `anima reset`

Reset local config/state (keeps the CLI installed).

```bash
anima reset
anima reset --dry-run
anima reset --scope config+creds+sessions --yes --non-interactive
```
