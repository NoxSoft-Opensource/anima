# ANIMA -> NoxSoft Full Alignment (Systems Map)

## 1. System Boundary

- Focal system: ANIMA product surface (CLI, gateway, web UI, mobile shells, docs, release process, auth, model routing, orchestration).
- In scope actors: end users, operators, NoxSoft product teams, subagents, external model providers, MCP servers.
- Out of scope (for this backlog): non-ANIMA product feature implementation in other repos, tokenomics contract changes, external platform legal filings.
- Assumptions: ANIMA remains open source, NoxSoft auth is mandatory for NoxSoft mode, dual Codex+Claude support is required, brand and UX must be NoxSoft-first.
- Known unknowns: exact launch dates, final pricing policy details, legal constraints by region.

## 2. Loop Map (R/B loops, delays, constraints)

- R1 (Trust loop): clearer NoxSoft identity -> better onboarding comprehension -> fewer misconfigs -> higher activation -> more feedback -> better identity coherence.
- R2 (Quality loop): stricter tests/observability -> fewer regressions -> faster release confidence -> more frequent improvements -> stronger product quality.
- R3 (Ecosystem loop): better MCP reliability -> broader tool utility -> more agent usage -> more integration demand -> better MCP platform maturity.
- B1 (Risk loop): stronger security controls -> reduced exploit surface -> less incident pressure -> preserves velocity without shutdown events.
- B2 (Complexity loop): architecture simplification + old-code removal -> lower maintenance load -> fewer accidental regressions.
- Key delays: docs lag behind code, telemetry lag behind incidents, governance decisions lag behind platform changes.
- Key constraints: staffing bandwidth, cross-platform parity cost, auth-provider API variability, backward compatibility expectations.

## 3. Diagnosis of Current Behavior

- ANIMA already carries core NoxSoft mission framing, but capability exposure is uneven across onboarding, auth choices, dashboard UX, and docs discoverability.
- Brand and product coherence degrade where legacy naming/flows persist.
- Reliability and security posture are solid in parts, but not uniformly enforced by release gates across all pathways.

## 4. Ranked Leverage Points

1. Identity/auth + onboarding coherence (highest leverage)
2. Test/release gates + observability consistency
3. MCP lifecycle hardening + health automation
4. UX/dashboard unification and operator workflows
5. Legacy-code and branding debt removal

## 5. Intervention Options with Second-Order Effects

- Intervention A: enforce NoxSoft-first onboarding defaults.
  - First-order gain: stronger first-run coherence.
  - Risks: stricter flows can increase friction for power users.
  - Trigger: onboarding completion rate drops >10% week-over-week.
  - Guardrail: maintain advanced/manual path with explicit override.
- Intervention B: tighten CI gates with security + regression checks.
  - First-order gain: fewer production regressions.
  - Risks: slower merge velocity.
  - Trigger: PR lead time increases >25% for two consecutive weeks.
  - Guardrail: flaky-test quarantine lane + deterministic retries.
- Intervention C: unify dashboard/CLI control model.
  - First-order gain: reduced operator confusion.
  - Risks: migration churn for existing users.
  - Trigger: support ticket spike on command parity.
  - Guardrail: deprecation notices + compatibility adapters.

## 6. Metrics + Review Cadence

- Leading indicators: onboarding success rate, auth setup success rate, MCP health pass rate, flaky test rate, mean time to recover, docs task completion lag.
- Lagging indicators: weekly active agents, retained sessions, production incident count/severity, user-reported trust/clarity score.
- Cadence: weekly triage for P0/P1 tasks, biweekly architecture review, monthly alignment audit against noxsoft-site claims.

## 7. First Experiment + Rollback Conditions

- First experiment: execute Workstreams 01-05 through first 10 tasks each (200 tasks total) before broad rollout.
- Rollback conditions: onboarding conversion drops >10%, critical incident count doubles in a week, or MCP failure rate exceeds 5% for 24h.
- Rollback action: revert feature flags, restore previous onboarding/auth defaults, freeze stream expansion until root cause review closes.

## Execution Artifact

- The operational backlog is tracked in:
  - `docs/roadmaps/noxsoft-alignment-1000-task-backlog.csv`
