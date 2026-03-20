# Release Policy

This document describes how OpenComp versions, releases, and communicates changes.

---

## Versioning

OpenComp uses [Semantic Versioning 2.0.0](https://semver.org/): `MAJOR.MINOR.PATCH`

| Version component | When to increment |
|---|---|
| `MAJOR` | Breaking changes to any public API, module interface, or plugin SDK |
| `MINOR` | New backward-compatible features |
| `PATCH` | Bug fixes and non-breaking patches |

Pre-release identifiers:
- `X.Y.Z-alpha.N` — unstable, may change without notice
- `X.Y.Z-beta.N` — feature-complete, stabilizing
- `X.Y.Z-rc.N` — release candidate, only critical fixes accepted

During `0.x` development, minor version bumps may include breaking changes. The project will communicate this clearly in release notes.

---

## Release Cadence

| Release type | Cadence | Branch |
|---|---|---|
| Patch releases | As needed (typically weekly) | `main` |
| Minor releases | Every 4–8 weeks | `main` |
| Major releases | As needed, after RFC and community notice | `main` |

There is no fixed date release schedule in early development. As the project matures, a date-based schedule will be adopted.

---

## Supported Versions

| Version | Status |
|---|---|
| `latest` | Actively maintained |
| `latest - 1 minor` | Security fixes only |
| Older | Unsupported |

Security patches will be backported one minor version behind the current release. See [SECURITY.md](SECURITY.md) for the security policy.

---

## Release Process

All releases are performed by a Core Team member.

### Patch release

1. Create a branch `release/X.Y.Z` from `main`
2. Update `CHANGELOG.md` with changes since last release
3. Bump versions with `pnpm changeset version`
4. Open a short-lived PR against `main` labeled `release`
5. One Core Team member approves
6. Merge and tag: `git tag vX.Y.Z && git push --tags`
7. CI publishes packages to npm and creates a GitHub Release
8. Announce in Discord `#announcements`

### Minor release

Same as patch release, plus:
- A migration guide must be included if any behavior changed
- Release notes must enumerate all new features
- Community notice in Discussions at least 3 days before tagging

### Major release

Same as minor release, plus:
- An RFC must have been accepted that describes the breaking changes
- A deprecation period of at least one minor version must have preceded the break
- A full migration guide must be published to the docs site
- Community notice at least 2 weeks before tagging
- A Core Team supermajority (2/3) approves the final release PR

---

## Changelogs

We use [Changesets](https://github.com/changesets/changesets) to manage changelogs.

When opening a PR:
- If your change is user-visible, run `pnpm changeset` and commit the generated file
- If your change is internal only (refactor, docs, tests), no changeset is needed

Changeset types map to semver:
- `major` → MAJOR bump (requires RFC)
- `minor` → MINOR bump
- `patch` → PATCH bump

---

## Deprecation Policy

Before removing or changing a public API:

1. Mark the old interface as `@deprecated` in JSDoc
2. Emit a `DeprecationWarning` at runtime where practical
3. Document the replacement
4. Maintain the deprecated behavior for at least one minor release
5. Remove in the next MAJOR (or the minor release after the deprecation period if still in `0.x`)

Deprecations must be listed in `CHANGELOG.md` with a `deprecated` tag.

---

## Plugin SDK Compatibility

The Plugin SDK (`packages/sdk`) follows stricter compatibility rules:

- MINOR and PATCH releases must remain backward-compatible for plugins
- MAJOR releases may break plugin APIs, but must provide a migration guide
- The SDK exports a `PLUGIN_API_VERSION` constant that plugins can check at startup
- The platform validates plugin API version compatibility on registration

---

## Release Checklist

Before any release:

- [ ] All tests pass on CI
- [ ] CHANGELOG.md is up to date
- [ ] Docs site is updated for new features
- [ ] Migration guide written (if needed)
- [ ] Security advisories published (if applicable)
- [ ] Plugin SDK version compatibility updated (if SDK changed)
- [ ] Docker image builds successfully
- [ ] Demo environment smoke-tested
- [ ] Announcement drafted
