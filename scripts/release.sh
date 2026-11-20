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
# Usage: ./scripts/release.sh [--dry-run]

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

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
echo "  1) Macro ($MACRO.$((MESO + 1)).0) — Large refactoring/significant impact"
echo "  2) Meso  ($MACRO.$MESO.$((MICRO + 1))) — Bug fixes or small breaking changes"
echo "  3) Micro ($MACRO.$MESO.$((MICRO + 1))) — New features or fixes with no effort needed"
echo ""
read -p "Enter choice (1/2/3): " choice

case "$choice" in
  1)
    MESO=$((MESO + 1))
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

NEW_VERSION="$MACRO.$MESO.$MICRO"
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

# Update CHANGELOG.md: promote Unreleased → Release version
# This Python script moves content from Unreleased to a new Release version section
python3 << 'PYTHON_EOF'
import sys
import re

new_version = sys.argv[1]
release_date = sys.argv[2]
changelog_in = sys.argv[3]
changelog_out = sys.argv[4]

with open(changelog_in, 'r') as f:
    content = f.read()

# Find the Unreleased section and extract its content
# Pattern: "## Unreleased" followed by content until the next "## " or end of file
pattern = r'(## Unreleased\n)([\s\S]*?)(?=\n## (?!Unreleased)|$)'
match = re.search(pattern, content)

if not match:
    print(f"Error: Could not find ## Unreleased section in {changelog_in}", file=sys.stderr)
    sys.exit(1)

unreleased_content = match.group(2)

# Create new release section
new_release = f"""## Release v{new_version}

Released {release_date}

{unreleased_content.rstrip()}

"""

# Replace the Unreleased content with blank subsections, and insert new release
blank_unreleased = """## Unreleased

### Breaking Changes

### New Features

### Enhancements

### Fixes

### Maintenance

### Deprecations

### Known Problems

"""

# Construct the new content
result = content[:match.start(1)] + blank_unreleased + "\n" + new_release + content[match.end():]

with open(changelog_out, 'w') as f:
    f.write(result)

sys.exit(0)
PYTHON_EOF

python3 - "$NEW_VERSION" "$RELEASE_DATE" "CHANGELOG.md" "$CHANGELOG_TMP" << 'PYTHON_EOF'
import sys
import re

new_version = sys.argv[1]
release_date = sys.argv[2]
changelog_in = sys.argv[3]
changelog_out = sys.argv[4]

with open(changelog_in, 'r') as f:
    content = f.read()

# Find the Unreleased section and extract its content
# Pattern: "## Unreleased" followed by content until the next "## " or end of file
pattern = r'(## Unreleased\n)([\s\S]*?)(?=\n## )'
match = re.search(pattern, content)

if not match:
    print(f"Error: Could not find ## Unreleased section in {changelog_in}", file=sys.stderr)
    sys.exit(1)

unreleased_content = match.group(2)

# Create new release section
new_release = f"""## Release v{new_version}

Released {release_date}

{unreleased_content.rstrip()}

"""

# Replace the Unreleased content with blank subsections, and insert new release
blank_unreleased = """## Unreleased

### Breaking Changes

### New Features

### Enhancements

### Fixes

### Maintenance

### Deprecations

### Known Problems

"""

# Construct the new content: everything before Unreleased + blank Unreleased + new release + everything after
result = content[:match.start(1)] + blank_unreleased + "\n" + new_release + content[match.end():]

with open(changelog_out, 'w') as f:
    f.write(result)

sys.exit(0)
PYTHON_EOF

if [[ $DRY_RUN == true ]]; then
  echo "=== DRY RUN: Changes that would be made ==="
  echo ""
  echo "--- package.json changes ---"
  diff -u package.json "$PACKAGE_TMP" || true
  echo ""
  echo "--- CHANGELOG.md changes ---"
  diff -u CHANGELOG.md "$CHANGELOG_TMP" || true
  echo ""
  echo "=== END DRY RUN ==="
  exit 0
fi

# Apply the changes
cp "$PACKAGE_TMP" package.json
cp "$CHANGELOG_TMP" CHANGELOG.md

# Stage and commit
git add package.json CHANGELOG.md
git commit -m "Release version $NEW_VERSION"

# Create annotated tag
git tag -a "$TAG" -m "Release $NEW_VERSION"

echo ""
echo "✓ CHANGELOG.md and package.json updated and committed."
echo "✓ Tag created: $TAG"
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
