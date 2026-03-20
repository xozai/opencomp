# RFC Process

OpenComp uses an RFC (Request for Comments) process for significant changes to the platform. The goal is to give the community a structured way to propose, discuss, and decide on substantial changes before implementation begins.

---

## When is an RFC required?

An RFC is required for:

- Adding or removing a top-level module
- Changes to the plugin SDK's public interface
- Changes to module public interfaces that break backward compatibility
- New cross-cutting platform concerns (e.g., a new audit mechanism, a new tenancy model)
- Changes to the database schema that affect multiple modules
- New first-class extension points
- Governance changes

An RFC is **not** required for:

- Bug fixes
- Internal refactors with no public API change
- Documentation improvements
- New plugins (open a PR directly)
- Performance improvements with no behavior change
- New endpoints that extend (not change) existing interfaces

If you are unsure, open a GitHub Discussion and ask.

---

## RFC Lifecycle

```
Draft → Open for Comment → Final Comment Period → Accepted / Rejected → Implemented
```

### 1. Draft

Before writing an RFC, discuss the idea informally:
- Open a GitHub Discussion in the `RFC` category
- Share a rough idea and gauge interest
- Get early feedback before investing in a formal write-up

### 2. Write the RFC

Create a file in `ADR/rfc-NNNN-short-title.md` using the template below.

Use the next available RFC number. Check `ADR/` for the current highest number.

Submit the RFC as a PR. The PR title must start with `RFC:` (e.g., `RFC: Add quota rollover support`).

Label the PR with `rfc`.

### 3. Open for Comment

Once the PR is open:
- The comment period is **14 calendar days** minimum
- All community members may comment
- Module Maintainers affected by the RFC must review
- The RFC author should respond to feedback and revise the RFC

### 4. Final Comment Period (FCP)

A Core Team member initiates FCP by:
- Adding the `fcp` label to the PR
- Posting a comment stating FCP has begun

FCP lasts **7 calendar days**. During FCP:
- No major new features may be added to the RFC
- Objections must be raised now or considered waived
- The author may make minor clarifying edits

### 5. Decision

At the end of FCP, the Core Team votes:
- **Accepted** → PR is merged into `ADR/`; implementation work begins
- **Rejected** → PR is closed with a summary of why
- **Postponed** → PR is labeled `postponed` and closed; can be reopened later

Votes are recorded as PR comments (`+1` to accept, `-1` to reject with reason).

---

## RFC Template

```markdown
# RFC NNNN: Title

- **RFC Number:** NNNN
- **Status:** Draft | Open for Comment | FCP | Accepted | Rejected | Postponed
- **Author(s):** GitHub handle(s)
- **Created:** YYYY-MM-DD
- **Last Updated:** YYYY-MM-DD
- **Affected Modules:** list of modules
- **Type:** Feature | Breaking Change | Architecture | Governance

---

## Summary

One paragraph summary of the change.

---

## Motivation

Why is this change needed? What problem does it solve? What use cases does it enable?

---

## Detailed Design

The full technical design. Include:
- API changes
- Schema changes
- Event changes
- Plugin interface changes
- Migration path

Use diagrams, code samples, and interface definitions as needed.

---

## Alternatives Considered

What other designs were considered and why were they rejected?

---

## Drawbacks

What are the downsides of this approach?

---

## Migration and Compatibility

How does this affect existing users, plugins, and integrations?
- What is the migration path?
- Is this a breaking change?
- What deprecation notices are needed?

---

## Unresolved Questions

What is still open for discussion?

---

## Implementation Plan

High-level steps to implement this RFC once accepted:
1. Step one
2. Step two
...

Estimated scope: [ ] Small (1-2 PRs) [ ] Medium (3-5 PRs) [ ] Large (6+ PRs)

---

## References

Links to relevant issues, discussions, prior art, external specs.
```

---

## Example: Accepted RFC

See [`ADR/rfc-0001-plugin-sdk.md`](ADR/rfc-0001-plugin-sdk.md) _(forthcoming)_ for an example of an accepted RFC.

---

## Fast-track RFCs

For urgent security fixes or minor non-breaking API additions, the Core Team may fast-track an RFC with a 48-hour comment window. Fast-track must be approved unanimously by the Core Team before the shortened window applies.

---

## RFC Withdrawal

An RFC author may withdraw their RFC at any time before acceptance by closing the PR and labeling it `withdrawn`. Withdrawn RFCs may be resubmitted later with the same or a new number.
