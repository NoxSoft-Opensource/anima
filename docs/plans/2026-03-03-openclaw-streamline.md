# Anima OpenClaw Streamline Plan

Date: 2026-03-03

## Objective

Converge Anima into a coherent NoxSoft-first product surface while preserving required compatibility and minimizing runtime risk.

## Scope

- Runtime identity and prompt language
- Documentation references
- Template defaults
- User-facing labels and migration messaging

## Worklist

- [ ] Inventory all `OpenClaw` references in runtime source (`src/`).
- [ ] Classify each reference:
  - runtime-critical (requires migration shim)
  - docs-only (rename directly)
  - historical/archive (retain with context)
- [ ] Replace runtime-visible OpenClaw naming with NoxSoft/Anima naming.
- [ ] Add compatibility notes where rename affects existing workflows.
- [ ] Regenerate docs/reference mappings if template sources changed.
- [ ] Run regression checks for prompt assembly and workspace bootstrapping.

## Guardrails

- No silent behavior changes in auth, tool permissions, or safety rails.
- No breaking file format changes for existing user workspaces without migration note.
- No deletion of historical references in archived docs without replacement context.

## Success Criteria

- No OpenClaw branding in active runtime UX and default prompts.
- Clear migration notes for retained compatibility surfaces.
- Verified prompt/docs/template coherence across Anima and NoxSoft mission mode.
