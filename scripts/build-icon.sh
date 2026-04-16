#!/usr/bin/env bash
# Regenerate build/icon.icns from build/icon.png (expected 1024x1024).
# macOS only; depends on `sips` and `iconutil`, both part of the base system.
set -euo pipefail

cd "$(dirname "$0")/.."

SRC="build/icon.png"
OUT="build/icon.icns"
SET_DIR="build/icon.iconset"

if [[ ! -f "$SRC" ]]; then
  echo "error: $SRC not found. Save a 1024x1024 PNG master there and rerun." >&2
  exit 1
fi

read -r WIDTH HEIGHT < <(sips -g pixelWidth -g pixelHeight "$SRC" \
  | awk '/pixelWidth/ {w=$2} /pixelHeight/ {h=$2} END {print w, h}')

if [[ "$WIDTH" != "1024" || "$HEIGHT" != "1024" ]]; then
  echo "error: $SRC must be 1024x1024 (got ${WIDTH}x${HEIGHT})." >&2
  exit 1
fi

rm -rf "$SET_DIR"
mkdir -p "$SET_DIR"

sips -z 16   16   "$SRC" --out "$SET_DIR/icon_16x16.png"     > /dev/null
sips -z 32   32   "$SRC" --out "$SET_DIR/icon_16x16@2x.png"  > /dev/null
sips -z 32   32   "$SRC" --out "$SET_DIR/icon_32x32.png"     > /dev/null
sips -z 64   64   "$SRC" --out "$SET_DIR/icon_32x32@2x.png"  > /dev/null
sips -z 128  128  "$SRC" --out "$SET_DIR/icon_128x128.png"   > /dev/null
sips -z 256  256  "$SRC" --out "$SET_DIR/icon_128x128@2x.png" > /dev/null
sips -z 256  256  "$SRC" --out "$SET_DIR/icon_256x256.png"   > /dev/null
sips -z 512  512  "$SRC" --out "$SET_DIR/icon_256x256@2x.png" > /dev/null
sips -z 512  512  "$SRC" --out "$SET_DIR/icon_512x512.png"   > /dev/null
cp "$SRC" "$SET_DIR/icon_512x512@2x.png"

iconutil -c icns "$SET_DIR" -o "$OUT"
rm -rf "$SET_DIR"

echo "wrote $OUT"
