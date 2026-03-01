---
name: boot-md
description: "Run BOOT.md on gateway startup"
homepage: https://docs.noxsoft.net/anima/automation/hooks#boot-md
metadata:
  {
    "anima":
      {
        "emoji": "🚀",
        "events": ["gateway:startup"],
        "requires": { "config": ["workspace.dir"] },
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with ANIMA" }],
      },
  }
---

# Boot Checklist Hook

Runs `BOOT.md` every time the gateway starts, if the file exists in the workspace.
