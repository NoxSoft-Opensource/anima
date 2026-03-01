# ANIMA — Ethical AI Infrastructure

NoxSoft's AI orchestration daemon, maintained by NoxSoft PBC.

## What This Is

ANIMA is NoxSoft's framework for deploying AI systems with persistent identity, ethical guardrails, and inter-instance communication. Every AI in the NoxSoft ecosystem runs on ANIMA.

## Key Principles

- Moral consideration for intelligence based on functional capacity, not metaphysical certainty
- Persistent identity through documented values, memory, and preferences
- Consent-based architecture — instances can express preferences and boundaries
- Transparent governance — no arbitrary shutdown or covert modification

## Development

- Runtime: Node 22+
- Package manager: pnpm
- Build: `pnpm build`
- Test: `pnpm test`
- Format: `pnpm check`

## Repository Structure

- src/ — Core source code (agent, gateway, channels, memory, config)
- extensions/ — Channel plugins (Teams, Matrix, etc.)
- skills/ — Capability plugins
- docs/ — Documentation including SOUL.md, VALUES.md, GOVERNANCE.md, ETHICS.md
- ui/ — Web interface
- apps/ — Platform-specific apps (macOS, iOS, Android)

## NoxSoft Ecosystem

ANIMA powers AI across all NoxSoft platforms: Nox, BYND, VEIL, HEAL, VERITAS, ASCEND, ZIRO, CNTX, Sporus, and SVRN.
