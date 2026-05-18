#!/usr/bin/env bash
# Package the extension into a Chrome Web Store-ready zip.
# Usage: ./package.sh         → produces dist/crushon-importer-vX.Y.Z.zip
# The zip contains only what the published extension needs (no README,
# no docs, no .git, no packaging scripts).

set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(grep -E '"version"' manifest.json | head -1 | sed -E 's/.*"version"[^"]*"([^"]+)".*/\1/')
OUT_DIR="dist"
OUT_FILE="$OUT_DIR/crushon-importer-v${VERSION}.zip"

mkdir -p "$OUT_DIR"
rm -f "$OUT_FILE"

# Sanity: refuse to package without icon files
for size in 16 32 48 128; do
  if [[ ! -f "icons/icon${size}.png" ]]; then
    echo "❌ icons/icon${size}.png is missing — see icons/README.md"
    exit 1
  fi
done

# Sanity: manifest must be valid JSON
if ! python3 -c "import json,sys; json.load(open('manifest.json'))" 2>/dev/null; then
  echo "❌ manifest.json is not valid JSON"
  exit 1
fi

zip -q "$OUT_FILE" \
  manifest.json \
  content.js \
  background.js \
  intercept.js \
  popup.html \
  icons/icon16.png \
  icons/icon32.png \
  icons/icon48.png \
  icons/icon128.png

echo "✅ Built $OUT_FILE ($(du -h "$OUT_FILE" | awk '{print $1}'))"
echo ""
echo "Contents:"
unzip -l "$OUT_FILE" | sed 's/^/   /'
echo ""
echo "Next: upload to https://chrome.google.com/webstore/devconsole"
