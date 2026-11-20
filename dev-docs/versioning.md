# Versioning

Kestrel uses **EffVer** (Effort-based Versioning), which prioritizes user effort to upgrade over API semantics.

## EffVer scheme

Versions are `MACRO.MESO.MICRO`:

- **Macro** (`1.0.0` → `2.0.0`): Large refactoring or significant impact requiring substantial user/admin effort to upgrade (e.g., major UI redesign, changed configuration format, dropped support for a Tiled server version).
- **Meso** (`1.0.0` → `1.1.0`): Bug fixes affecting some users or small breaking changes requiring some effort (e.g., incompatible plot API, renamed settings in the config panel).
- **Micro** (`1.0.0` → `1.0.1`): New features or fixes with no expected user effort (e.g., new plot type, bug fix, performance improvement).

> **Why not SemVer?** API-based versioning is hard for users to reason about. EffVer measures impact in terms of *user effort* required to deploy, which directly matches user experience.

## Release workflow

Releases are **manual and on-demand**, not automatic. This gives maintainers control over what goes into each release and allows testing before tagging.

### Steps

1. **Develop and test locally:**
   ```bash
   npm run dev      # dev server with hot reload
   npm test         # run unit tests
   npm run build    # build for production
   ```

2. **Decide on the bump** based on the changes since the last release:
   - What's the most disruptive change?
   - How much effort will users need to adopt this release?

3. **Run the release script:**
   ```bash
   ./scripts/release.sh [--dry-run]
   ```
   The script:
   - Validates a clean working tree
   - Prompts you to choose Macro/Meso/Micro
   - Prompts you to choose Release Candidate or Final Release
   - Updates `package.json` with the new version
   - For final releases: promotes entries from `## Unreleased` in `CHANGELOG.md` to a new `## Release v<VERSION>` section and regenerates blank subsections
   - For RCs: leaves `## Unreleased` unchanged (RCs are pre-release testing, not official releases)
   - Commits the changes
   - Creates an annotated git tag
   - Shows push instructions
   
   Use `--dry-run` to preview changes without committing.

4. **Review the tag and commit:**
   ```bash
   git log --oneline -1
   git tag -l -n1 v<VERSION>
   ```

5. **Push to GitHub:**
   ```bash
   git push origin main
   git push origin v<VERSION>
   ```

6. **Deploy:** See `deployment.md` for instructions on deploying a tagged version to `watt`.

## Version display in the app

The app embeds its version at build time using `git describe --tags`:

- **At a release tag:** `v1.2.0`
- **Between releases:** `v1.2.0-5-g3a7b9c1` (5 commits ahead, short SHA)

This information is computed during the build and injected into the app. When an About dialog is added (future work), it will display the version.

## Release Candidates (RCs)

Release candidates are pre-release testing versions. They are useful for:
- Testing breaking changes before final release
- Getting early feedback from users
- Creating deployment checkpoints without committing to final version

**RC versioning:**
- Format: `vX.Y.ZrcN` (e.g., `v0.1.0rc1`, `v0.1.0rc2`)
- RCs are numbered sequentially for a given version
- When running `./scripts/release.sh`, choose "Release candidate" after selecting the bump type
- The script automatically increments RC numbers

**CHANGELOG behavior:**
- RCs **do not** consume the `## Unreleased` section
- Changes remain in `## Unreleased` during all RC testing
- Only the final release (chosen as "Final release" in the script) promotes `## Unreleased` entries to a versioned release section

**Workflow example:**
1. Test version 0.1.0 with RC: `./scripts/release.sh` → Micro bump → RC → creates v0.1.0rc1
2. Find issues, fix, test again: `./scripts/release.sh` → Micro bump → RC → creates v0.1.0rc2
3. Ready for final release: `./scripts/release.sh` → Micro bump → Final release → creates v0.1.0 and closes `## Unreleased`

## Examples for Kestrel context

### Macro bump

A complete redesign of the layout, moving all controls to a sidebar instead of a toolbar, breaking existing saved views.

```
v1.0.0 → v2.0.0
```

### Meso bump

Rename of a major setting (e.g., "colormap mode" becomes "color palette") that users who have saved settings will need to understand.

```
v1.0.0 → v1.1.0
```

### Micro bump

Add a new plot type, fix a legend display bug, improve performance of grid scans.

```
v1.0.0 → v1.0.1
```

## CHANGELOG

Manual entries are recorded in `CHANGELOG.md` for each release. Use these subheadings (use in this order; omit if no content):

- **Breaking Changes** — API, UI, or configuration changes requiring user action
- **New Features** — User-facing additions
- **Enhancements** — Improvements to existing functionality
- **Fixes** — Bug fixes
- **Maintenance** — Internal, non-user-facing work (refactor, test, CI, documentation)
- **Deprecations** — Features scheduled for removal in a future version
- **Known Problems** — Unresolved issues in this release

## References

- [EffVer specification](https://jacobtomlinson.dev/effver/)
- Kestrel deployment: `dev-docs/deployment.md`
- Release script: `scripts/release.sh`
