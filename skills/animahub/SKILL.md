---
name: animahub
description: Use the AnimaHub CLI to search, install, update, and publish agent skills from animahub.com. Use when you need to fetch new skills on the fly, sync installed skills to latest or a specific version, or publish new/updated skill folders with the npm-installed animahub CLI.
metadata:
  {
    "anima":
      {
        "requires": { "bins": ["animahub"] },
        "install":
          [
            {
              "id": "node",
              "kind": "node",
              "package": "animahub",
              "bins": ["animahub"],
              "label": "Install AnimaHub CLI (npm)",
            },
          ],
      },
  }
---

# AnimaHub CLI

Install

```bash
npm i -g animahub
```

Auth (publish)

```bash
animahub login
animahub whoami
```

Search

```bash
animahub search "postgres backups"
```

Install

```bash
animahub install my-skill
animahub install my-skill --version 1.2.3
```

Update (hash-based match + upgrade)

```bash
animahub update my-skill
animahub update my-skill --version 1.2.3
animahub update --all
animahub update my-skill --force
animahub update --all --no-input --force
```

List

```bash
animahub list
```

Publish

```bash
animahub publish ./my-skill --slug my-skill --name "My Skill" --version 1.2.0 --changelog "Fixes + docs"
```

Notes

- Default registry: https://animahub.com (override with ANIMAHUB_REGISTRY or --registry)
- Default workdir: cwd (falls back to Anima workspace); install dir: ./skills (override with --workdir / --dir / ANIMAHUB_WORKDIR)
- Update command hashes local files, resolves matching version, and upgrades to latest unless --version is set
