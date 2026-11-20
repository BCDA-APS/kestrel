#!/usr/bin/env bash
set -euo pipefail

# release.sh - Interactive EffVer release tool for Kestrel
#
# This script bumps the version in package.json and CHANGELOG.md according to the EffVer scheme:
# - Macro: Large refactoring/significant impact
# - Meso: Bug fixes affecting some users or small breaking changes
# - Micro: New features or fixes with no expected user effort
#
# It then commits both changes, creates an annotated git tag, and shows push instructions.
#
# Usage: ./scripts/release.sh [--dry-run] [-h|--help]

show_help() {
  cat << 'HELP'
usage: ./scripts/release.sh [--dry-run]

Bump the version and create release tags (RC or final).
Final releases promote CHANGELOG.md entries from Unreleased to a versioned section.

Options:
  --dry-run     Preview changes without modifying files or git state
  -h, --help    Show this help message

EffVer scheme:
  Macro (X.0.0)   — Large refactoring, significant impact
  Meso  (X.1.0)   — Bug fixes affecting users, breaking changes with effort
  Micro (X.1.1)   — New features, fixes with no user effort

Release types:
  RC (vX.Y.ZrcN)  — Pre-release for testing; Unreleased section unchanged
  Final (vX.Y.Z)  — Official release; promotes Unreleased to versioned section

Workflow:
  1. Record changes in ## Unreleased section of CHANGELOG.md as you work
  2. Run ./scripts/release.sh [--dry-run]
  3. Choose Macro, Meso, or Micro based on effort required to upgrade
  4. Choose RC for testing or Final for official release
  5. Script updates package.json, creates commit and tag
  6. git push origin main && git push origin vX.Y.Z
  7. Deploy the version tag to production

HELP
}

DRY_RUN=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) show_help; exit 0 ;;
    *) echo "Unknown option: $1"; show_help; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

# Ensure clean working tree
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: Working tree is not clean. Commit or stash changes first."
  git status --short
  exit 1
fi

# Get current version from package.json
CURRENT_VERSION=$(jq -r '.version' package.json)
IFS='.' read -r MACRO MESO MICRO <<< "$CURRENT_VERSION"

echo "Current version: $CURRENT_VERSION"
echo ""
echo "Choose bump type:"
echo "  1) Macro ($((MACRO + 1)).0.0) — Large refactoring/significant impact"
echo "  2) Meso  ($MACRO.$((MESO + 1)).0) — Bug fixes or small breaking changes"
echo "  3) Micro ($MACRO.$MESO.$((MICRO + 1))) — New features or fixes with no effort needed"
echo ""
read -p "Enter choice (1/2/3): " choice

case "$choice" in
  1)
    MACRO=$((MACRO + 1))
    MESO=0
    MICRO=0
    BUMP_TYPE="Macro"
    ;;
  2)
    MESO=$((MESO + 1))
    MICRO=0
    BUMP_TYPE="Meso"
    ;;
  3)
    MICRO=$((MICRO + 1))
    BUMP_TYPE="Micro"
    ;;
  *)
    echo "Invalid choice."
    exit 1
    ;;
esac

CANDIDATE_VERSION="$MACRO.$MESO.$MICRO"

# Ask if this is a release candidate or final release
echo ""
echo "Release type:"
echo "  1) Release candidate (${CANDIDATE_VERSION}rc1, ${CANDIDATE_VERSION}rc2, ...)"
echo "  2) Final release (${CANDIDATE_VERSION})"
echo ""
read -p "Enter choice (1/2): " rc_choice

case "$rc_choice" in
  1)
    # Find latest RC number for this version
    LATEST_RC=$(git tag -l "v${CANDIDATE_VERSION}rc*" --sort=-version:refname | head -1)
    if [[ -z "$LATEST_RC" ]]; then
      RC_NUM=1
    else
      # Extract RC number from tag (e.g., v0.1.1rc2 → 2)
      RC_NUM=$(echo "$LATEST_RC" | sed "s/v${CANDIDATE_VERSION}rc//")
      RC_NUM=$((RC_NUM + 1))
    fi
    NEW_VERSION="${CANDIDATE_VERSION}rc${RC_NUM}"
    IS_RC=true
    ;;
  2)
    NEW_VERSION="$CANDIDATE_VERSION"
    IS_RC=false
    ;;
  *)
    echo "Invalid choice."
    exit 1
    ;;
esac

TAG="v$NEW_VERSION"
RELEASE_DATE=$(date +%Y-%m-%d)

echo ""
echo "Bumping $BUMP_TYPE: $CURRENT_VERSION → $NEW_VERSION"
echo ""

# Create temporary files for edits
PACKAGE_TMP=$(mktemp)
CHANGELOG_TMP=$(mktemp)
trap "rm -f $PACKAGE_TMP $CHANGELOG_TMP" EXIT

# Update package.json
jq ".version = \"$NEW_VERSION\"" package.json > "$PACKAGE_TMP"

# Update CHANGELOG.md only for final releases (not RCs)
if [[ "$IS_RC" == false ]]; then
  cat > "$CHANGELOG_TMP.py" << 'PYTHON_SCRIPT'
import sys
import re

new_version = sys.argv[1]
release_date = sys.argv[2]
changelog_in = sys.argv[3]
changelog_out = sys.argv[4]

with open(changelog_in, 'r') as f:
    content = f.read()

# Find "## Unreleased" and extract content until next "## "
pattern = r'(## Unreleased\n)([\s\S]*?)(\n## )'
match = re.search(pattern, content)

if not match:
    print(f"Error: Could not find ## Unreleased section", file=sys.stderr)
    sys.exit(1)

unreleased_content = match.group(2).rstrip()

# Create new release section
new_release = f"""## Release v{new_version}

Released {release_date}

{unreleased_content}

"""

# Blank unreleased template
blank_unreleased = """## Unreleased

### Breaking Changes

### New Features

### Enhancements

### Fixes

### Maintenance

### Deprecations

### Known Problems

"""

# Reconstruct: everything before Unreleased + blank Unreleased + new Release + everything after
result = content[:match.start(1)] + blank_unreleased + "\n" + new_release + content[match.start(3):]

with open(changelog_out, 'w') as f:
    f.write(result)

sys.exit(0)
PYTHON_SCRIPT

  python3 "$CHANGELOG_TMP.py" "$NEW_VERSION" "$RELEASE_DATE" "CHANGELOG.md" "$CHANGELOG_TMP"
  rm -f "$CHANGELOG_TMP.py"
else
  # For RCs, just copy CHANGELOG as-is (no changes)
  cp CHANGELOG.md "$CHANGELOG_TMP"
fi

if [[ $DRY_RUN == true ]]; then
  echo "=== DRY RUN: Changes that would be made ==="
  echo ""
  echo "--- package.json changes ---"
  diff -u package.json "$PACKAGE_TMP" || true
  echo ""
  echo "--- CHANGELOG.md changes ---"
  diff -u CHANGELOG.md "$CHANGELOG_TMP" || true
  if [[ "$IS_RC" == true ]]; then
    echo "(Note: RCs do not update CHANGELOG.md; Unreleased section stays open."
    echo "Final releases will promote Unreleased entries to a versioned section.)"
  fi
  echo ""
  echo "=== END DRY RUN ==="
  exit 0
fi

# Apply the changes
cp "$PACKAGE_TMP" package.json
cp "$CHANGELOG_TMP" CHANGELOG.md

# Stage and commit
git add package.json CHANGELOG.md
if [[ "$IS_RC" == true ]]; then
  git commit -m "Release candidate $NEW_VERSION"
else
  git commit -m "Release version $NEW_VERSION"
fi

# Create annotated tag
if [[ "$IS_RC" == true ]]; then
  git tag -a "$TAG" -m "Release candidate $NEW_VERSION"
else
  git tag -a "$TAG" -m "Release $NEW_VERSION"
fi

echo ""
if [[ "$IS_RC" == true ]]; then
  echo "✓ Release candidate $NEW_VERSION created."
  echo "✓ Tag created: $TAG (Unreleased section unchanged)"
else
  echo "✓ CHANGELOG.md and package.json updated and committed."
  echo "✓ Tag created: $TAG"
fi
echo ""
echo "Next steps:"
echo "  1. Review the commit and tag:"
echo "     git log --oneline -2"
echo "     git tag -l -n1 $TAG"
echo ""
echo "  2. Push to GitHub:"
echo "     git push origin main"
echo "     git push origin $TAG"
echo ""
echo "  3. Update the deployed container image on watt:"
echo "     See dev-docs/deployment.md for instructions."
