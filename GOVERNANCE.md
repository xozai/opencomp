# OpenComp Governance

This document describes how OpenComp is governed, how decisions are made, and how contributors can advance their involvement in the project.

---

## Principles

- **Open and transparent** — all major decisions happen in public GitHub threads or RFCs
- **Meritocratic** — influence is earned through consistent, quality contribution
- **Inclusive** — we actively welcome contributors from all backgrounds
- **Conservative about breaking changes** — stability for adopters is a first-class concern
- **Federated ownership** — module maintainers have authority over their modules

---

## Contributor Roles

### Community Member

Anyone who interacts with the project in good faith — filing issues, commenting on PRs, using OpenComp, or asking questions in Discussions.

No formal requirement. Just follow the [Code of Conduct](CODE_OF_CONDUCT.md).

---

### Contributor

A community member who has had at least one PR merged into the repository.

**What you can do:**
- Open issues and PRs
- Review others' PRs (your reviews carry weight in discussion, but not a formal vote)
- Be listed in [CONTRIBUTORS.md](CONTRIBUTORS.md)

---

### Trusted Contributor

A contributor who demonstrates consistent, high-quality involvement over time.

**Criteria (all must be met):**
- 5+ merged PRs of meaningful scope
- Active engagement with code reviews and discussions
- Demonstrated understanding of module boundaries and architecture
- Nominated by a Maintainer

**What you gain:**
- Triage access (can label and close issues)
- PR review weight is formally recognized
- Access to `#trusted-contributors` in Discord
- Listed in GOVERNANCE.md

**Current Trusted Contributors:** _(none yet — project is early stage)_

---

### Module Maintainer

A Trusted Contributor who takes ownership of one or more modules.

**Criteria:**
- At least 10 merged PRs with significant contributions to the module
- Deep understanding of the module's domain
- Nominated and approved by the Core Team (simple majority)

**What you can do:**
- Merge PRs into your module after review
- Set direction for your module within the platform's architectural constraints
- Veto breaking changes to your module's public interface
- Approve RFC sections that affect your module

**Responsibilities:**
- Keep the module's README, tests, and public interface current
- Respond to issues and PRs in your module within 7 business days
- Notify the core team of planned breaking changes with at least 2 weeks notice

**Current Module Maintainers:** _(see CODEOWNERS)_

---

### Core Team

The Core Team is responsible for the overall platform architecture, release management, governance, and cross-cutting decisions.

**Current Core Team:**
- _(founding maintainers listed here)_

**Core Team responsibilities:**
- Merge cross-cutting PRs
- Approve and merge RFCs
- Manage releases
- Set and communicate the roadmap
- Resolve escalated disputes between module maintainers
- Maintain CI/CD infrastructure

**Decision-making:**
- Routine decisions (bug fixes, docs, non-breaking features): any Core Team member can merge
- Module-scoped breaking changes: Module Maintainer + 1 Core Team member required
- Cross-module breaking changes: RFC required + Core Team simple majority vote
- Governance changes: RFC required + Core Team supermajority (2/3) vote

---

## Decision-Making Process

### Day-to-day decisions

Handled in PR reviews. A PR can be merged when:
- It passes CI
- It has at least one approving review from a Maintainer or Core Team member
- No unresolved blocking comments from Maintainers or Core Team

### Significant changes

Changes that affect the public API, platform architecture, or module interfaces require an issue discussion or RFC (see [RFC_PROCESS.md](RFC_PROCESS.md)) before implementation begins.

### Escalation

If there is disagreement between maintainers:
1. Discussion in the PR or issue thread (allow 5 business days)
2. If unresolved, escalate to Core Team
3. Core Team votes; majority wins; ties are resolved by the project lead

### Lazy consensus

For non-controversial changes (typos, docs, minor refactors), lazy consensus applies: if no one objects within 48 hours of a PR being labeled `lazy-consensus`, a Core Team member may merge.

---

## Becoming a Trusted Contributor

1. Contribute consistently (see criteria above)
2. A current Maintainer nominates you in a GitHub Discussion tagged `governance`
3. No objection from Core Team within 7 days → you are added
4. Your name is added to this document and CODEOWNERS

---

## Becoming a Module Maintainer

1. Express interest in a module in the GitHub Discussion or Discord
2. Core Team verifies contribution criteria
3. Core Team votes (simple majority, 5-day window)
4. On approval: CODEOWNERS is updated, you are announced in the release notes

---

## Stepping Down

Maintainers and Core Team members can step down at any time by notifying the Core Team. We appreciate all contributions. Stepping down does not affect your Contributor or Trusted Contributor status.

Module Maintainers who are inactive for 3+ months with no response to pings may be moved to Emeritus status.

---

## Conflict of Interest

Core Team members with a direct financial interest in a decision (e.g., they work for a company that would benefit from a specific implementation choice) should disclose this and abstain from the vote.

---

## Amendments

Changes to this governance document require:
- An RFC or GitHub Discussion labeled `governance`
- Core Team supermajority (2/3) approval
- 14-day public comment window before merging

---

## Attribution

This governance model is inspired by the governance models of the Fastify, OpenTelemetry, and Backstage open-source projects.
