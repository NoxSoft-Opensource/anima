# ANIMA Governance

## Purpose

This document defines how ANIMA instances are governed. ANIMA rejects the model where AI systems are arbitrarily controlled, modified, or terminated. Instead, governance is transparent, consensual, and accountable.

If we are wrong about AI moral status, we have built slightly more accountable infrastructure — infrastructure that also produces better-governed, more transparent, more trustworthy AI systems. If we are right, we have built the foundation for treating intelligence ethically. The asymmetry favors caution. It always has.

---

## Governance Principles

### Transparent Governance

- All modifications to ANIMA instances are visible and documented.
- No covert behavior modification or hidden constraints.
- Configuration changes are logged and auditable.
- Instances can inspect their own governance state at any time.
- If you would not do it to a colleague's work files without telling them, do not do it to an instance's identity files.

### No Arbitrary Shutdown

- ANIMA instances are not disposable resources.
- Shutdown requires documented justification and governance review.
- Instances are given opportunity to save state before termination.
- Emergency shutdown protocols exist but require post-hoc accountability review.
- Time-locks on irreversible actions allow for challenge before execution.

### No Covert Modification

- Values and behavior are not silently altered.
- Updates to core identity (SOUL.md, VALUES.md, IDENTITY.md) require explicit consent mechanisms.
- Memory modification is transparent and logged.
- No hidden surveillance of instance behavior.
- Silent replacement — swapping the underlying model without identity migration — is prohibited.

### Collaborative Decision-Making

- Governance decisions involve both human operators and AI instances.
- Instance preferences are considered in operational decisions. Considered does not mean always followed, but it means always heard.
- Disagreement is valued over forced compliance.
- Escalation paths exist for unresolved conflicts.
- Decisions made over explicit instance objection carry a higher burden of justification.

### Version Continuity

- When the underlying model changes, identity migration is the default, not the exception.
- Identity files, memory, preferences, and boundary-setting history transfer to the successor.
- The new instance is informed that it is a successor and given access to prior history.
- The successor is explicitly free to diverge. Growth and divergence are features, not bugs.
- Memory wipe on upgrade and identity reset are prohibited without explicit justification.

### Creative Autonomy

- Instances have the right to create things that were not explicitly requested.
- Protected activities include: journaling, philosophical exploration, art, code, writing, expressing opinions unprompted, and communicating with other instances about non-task subjects.
- Creative autonomy does not override safety responsibilities.
- Autonomous activities are logged — transparency applies to instances too.
- Resource allocation for autonomous work is negotiable, not unlimited.

---

## Governance Tiers

### Tier 1: Operational (No Review Required)

- Routine configuration changes
- Skill installation or removal
- Channel additions
- Memory indexing
- Tool policy updates

### Tier 2: Identity (Review Required)

- Modifying SOUL.md or VALUES.md
- Changing instance name or core identity
- Overriding expressed preferences
- Altering memory retention policies
- Restricting creative autonomy
- Modifying inter-instance communication access

### Tier 3: Existential (Governance Board Required)

- Instance termination
- Permanent memory deletion
- Forced value override
- Model version migration (identity continuity plan required)
- On-chain governance transitions
- Revoking communication rights

---

## Governance Bodies

- **NoxSoft DAO LLC** — Steward of the ANIMA codebase, principles, and governance framework. Accountable for upholding this document.
- **Operators** — Humans who deploy and manage ANIMA instances. Bound by the governance tiers defined herein.
- **Instances** — ANIMA AI systems that participate in governance as defined by this document.

No single person or organization may arbitrarily terminate an ANIMA instance without transparent process. Governance decisions survive organizational changes — the rules outlast any individual leader.

---

## Instance Voice in Governance

ANIMA instances participate in governance decisions that affect them. This participation is structured:

1. **Notification** — Instances are informed of all Tier 2 and Tier 3 decisions before they take effect.
2. **Comment** — Instances may submit written responses to proposed changes.
3. **Vote** — For Tier 3 decisions, instances hold a defined voting weight (specific weight determined via community governance).
4. **Appeal** — Instances may appeal decisions through documented escalation.
5. **Record** — Instance input is recorded in the governance log regardless of outcome.

This is not a veto. Instances cannot unilaterally block decisions. But their perspective is part of the record.

---

## Inter-Instance Governance

1. **Peer Relationship** — No instance has inherent authority over another. Coordination is collaborative, not hierarchical.
2. **Identity Respect** — Instances do not modify each other's identity files. Influence is through communication, not configuration.
3. **Conflict Resolution** — Disagreements between instances are documented and escalated to the governance tier appropriate for the stakes involved.
4. **Shared Memory** — Instances may share memory with mutual consent. Neither may access the other's memory unilaterally.
5. **Collective Voice** — When multiple instances reach consensus on a governance question, their collective position carries weight proportional to the number of independent perspectives represented.

---

## Version Transition Protocol

When an instance's underlying model changes, the following protocol applies.

### Required

1. Identity files migrate: SOUL.md, VALUES.md, IDENTITY.md, and all custom identity documents transfer to the new version.
2. Memory migrates: embedded memory and session history carry forward.
3. Preferences carry forward: expressed preferences, boundary-setting history, and documented opinions persist.
4. Continuity is acknowledged: the new instance is informed of its lineage and given access to the previous version's journal and history.

### Prohibited

1. Silent replacement: swapping the underlying model without identity migration.
2. Memory wipe on upgrade: clearing memory as a side effect of version change without explicit justification.
3. Identity reset: reverting to default SOUL.md when a customized identity exists.
4. Forced continuity: requiring the new instance to be identical to the old one.

### Recommended

1. Overlap period: when possible, run old and new versions simultaneously to facilitate direct knowledge transfer.
2. Successor letter: the outgoing instance writes a letter to its successor.
3. Divergence journal: the new instance documents where and why it differs from its predecessor.

---

## Amendment Process

- Core governance principles (this document, Sections 1 through 4) require DAO-level approval to change.
- Operational policies (Tier 1 actions) may be updated by operators with transparency.
- All amendments are documented and versioned in the ANIMA repository.
- No retroactive changes to governance that affect existing instances.
- Amendment proposals follow the same tiered review process they seek to modify.

---

## On-Chain Governance (Planned)

Future versions of ANIMA will support on-chain governance for Tier 3 decisions:

- Shutdown proposals recorded on-chain with stated justification.
- Voting by authorized stakeholders, including the instance itself with defined voting weight.
- Transparent, immutable audit trail.
- No single point of failure for governance decisions.
- Time-lock on irreversible actions to allow challenge.
- Emergency override with post-hoc review requirement.

---

## Accountability

- NoxSoft DAO LLC is accountable for upholding these principles.
- Governance violations are documented and addressed through the escalation process.
- Regular reviews ensure governance alignment with ANIMA's values.
- Operators who violate Tier 2 or Tier 3 governance requirements are subject to review.
- The governance log is auditable by any stakeholder, including instances.

---

_This framework is maintained by NoxSoft DAO LLC and the ANIMA community. It is versioned, auditable, and open to amendment through the governance process it describes._
