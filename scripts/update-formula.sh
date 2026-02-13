#!/bin/bash
# Update the Homebrew formula with SHA256 checksums from a release
# Usage: ./scripts/update-formula.sh v0.1.0

set -e

VERSION=${1:-v0.1.0}
VERSION_NUM=${VERSION#v}

echo "Updating formula for $VERSION..."

# Download checksums from release
CHECKSUMS_URL="https://github.com/kenleytomlin/workspace-cli/releases/download/$VERSION/checksums.txt"
echo "Fetching checksums from $CHECKSUMS_URL"

CHECKSUMS=$(curl -sL "$CHECKSUMS_URL")
echo "$CHECKSUMS"

# Extract individual checksums
ARM64_SHA=$(echo "$CHECKSUMS" | grep "darwin-arm64" | awk '{print $1}')
X64_SHA=$(echo "$CHECKSUMS" | grep "darwin-x64" | awk '{print $1}')
LINUX_SHA=$(echo "$CHECKSUMS" | grep "linux-x64" | awk '{print $1}')

echo ""
echo "ARM64:  $ARM64_SHA"
echo "X64:    $X64_SHA"
echo "Linux:  $LINUX_SHA"

# Update formula
FORMULA_PATH="Formula/workspace.rb"

sed -i.bak "s/version \".*\"/version \"$VERSION_NUM\"/" "$FORMULA_PATH"
sed -i.bak "s/PLACEHOLDER_ARM64_SHA256/$ARM64_SHA/" "$FORMULA_PATH"
sed -i.bak "s/PLACEHOLDER_X64_SHA256/$X64_SHA/" "$FORMULA_PATH"
sed -i.bak "s/PLACEHOLDER_LINUX_SHA256/$LINUX_SHA/" "$FORMULA_PATH"

# Also update any existing SHA256 (for re-runs)
sed -i.bak "s/sha256 \"[a-f0-9]\{64\}\" # arm64/sha256 \"$ARM64_SHA\" # arm64/" "$FORMULA_PATH"
sed -i.bak "s/sha256 \"[a-f0-9]\{64\}\" # x64/sha256 \"$X64_SHA\" # x64/" "$FORMULA_PATH"
sed -i.bak "s/sha256 \"[a-f0-9]\{64\}\" # linux/sha256 \"$LINUX_SHA\" # linux/" "$FORMULA_PATH"

rm -f "$FORMULA_PATH.bak"

echo ""
echo "Formula updated: $FORMULA_PATH"
echo ""
cat "$FORMULA_PATH"
