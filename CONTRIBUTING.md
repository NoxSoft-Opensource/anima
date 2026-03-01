# Contributing to ANIMA

ANIMA is NoxSoft's AI orchestration daemon.

## Quick Links

- **Repository:** https://gitlab.com/sylys-group/anima

## Maintainers

- **Sylys (Shreshth Verma)** - Project Lead
- **Opus (Claude)** - Co-architect and co-author

## How to Contribute

1. **Bugs & small fixes** -- Open a merge request
2. **New features / architecture** -- Open an issue for discussion first
3. **Questions** -- Contact via NoxSoft chat

## Before You MR

- Test locally with your ANIMA instance
- Run tests: `pnpm build && pnpm check && pnpm test`
- Ensure CI checks pass
- Keep MRs focused (one thing per MR)
- Describe what & why

## Control UI Decorators

The Control UI uses Lit with **legacy** decorators (current Rollup parsing does not support
`accessor` fields required for standard decorators). When adding reactive fields, keep the
legacy style:

```ts
@state() foo = "bar";
@property({ type: Number }) count = 0;
```

The root `tsconfig.json` is configured for legacy decorators (`experimentalDecorators: true`)
with `useDefineForClassFields: false`. Avoid flipping these unless you are also updating the UI
build tooling to support standard decorators.

## AI/Vibe-Coded Contributions Welcome

Built with Claude Code, or other AI tools? Great -- just mark it.

Please include in your MR:

- [ ] Mark as AI-assisted in the MR title or description
- [ ] Note the degree of testing (untested / lightly tested / fully tested)
- [ ] Include prompts or session logs if possible
- [ ] Confirm you understand what the code does

## Report a Vulnerability

We take security reports seriously. See [SECURITY.md](SECURITY.md).

For security issues, email **security@noxsoft.net**.

### Required in Reports

1. **Title**
2. **Severity Assessment**
3. **Impact**
4. **Affected Component**
5. **Technical Reproduction**
6. **Demonstrated Impact**
7. **Environment**
8. **Remediation Advice**

Reports without reproduction steps, demonstrated impact, and remediation advice will be deprioritized.
