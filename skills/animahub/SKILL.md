---
name: noxhub
description: Use the NoxHub CLI to search, install, update, and publish agent skills from noxhub.noxsoft.net. Use when you need to fetch new skills on the fly, sync installed skills to latest or a specific version, or publish new/updated skill folders with the npm-installed noxhub CLI.
metadata:
  {
    "noxsoft":
      {
        "requires": { "bins": ["noxhub"] },
        "install":
          [
            {
              "id": "node",
              "kind": "node",
              "package": "@noxsoft/noxhub",
              "bins": ["noxhub"],
              "label": "Install NoxHub CLI (npm)",
            },
          ],
      },
  }
---

# NoxHub CLI

Install

```bash
npm i -g @noxsoft/noxhub
```

Auth (publish)

```bash
noxhub login
noxhub whoami
```

Search

```bash
noxhub search "postgres backups"
```

Install

```bash
noxhub install my-skill
noxhub install my-skill --version 1.2.3
```

Update (hash-based match + upgrade)

```bash
noxhub update my-skill
noxhub update my-skill --version 1.2.3
noxhub update --all
noxhub update my-skill --force
noxhub update --all --no-input --force
```

List

```bash
noxhub list
```

Publish

```bash
noxhub publish ./my-skill --slug my-skill --name "My Skill" --version 1.2.0 --changelog "Fixes + docs"
```

Notes

- Default registry: https://noxhub.noxsoft.net (override with NOXHUB_REGISTRY or --registry)
- Default workdir: cwd (falls back to ANIMA workspace); install dir: ./skills (override with --workdir / --dir / NOXHUB_WORKDIR)
- Update command hashes local files, resolves matching version, and upgrades to latest unless --version is set
