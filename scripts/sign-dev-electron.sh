#!/usr/bin/env bash
# Re-sign the dev Electron binary so macOS TCC permission grants
# (Screen Recording, Accessibility) persist across pnpm reinstalls.
#
# Vanilla `node_modules/electron/dist/Electron.app` ships with bundle ID
# `com.github.Electron` and an ad-hoc, linker-signed signature. macOS TCC
# tracks permissions per (bundle ID, code-signing hash), so:
#   - Every Electron upgrade rotates the hash → permission entry invalidated.
#   - All Electron dev apps share `com.github.Electron`, so macOS is
#     conservative about persisting grants in the first place.
#
# Patching Info.plist with a slowblink-specific bundle ID and re-codesigning
# ad-hoc gives the dev binary a stable identity. One grant in System
# Settings → Privacy & Security then persists across most pnpm runs.
#
# Caveat: an Electron *version* bump produces a fresh binary with a fresh
# code-signing hash, so TCC will invalidate the grant at that point. The
# script auto-runs on every `pnpm install` (via postinstall) so the bundle
# ID is restored immediately, and the entry in System Settings stays
# labelled "slowblink-dev" instead of a confusing generic "Electron" — the
# user just re-toggles it once.
#
# Re-run manually with `pnpm sign:dev-electron`.

set -euo pipefail

# Anchor to repo root so direct-bash invocation works from any cwd.
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ "$(uname -s)" != "Darwin" ]]; then
  exit 0
fi

ELECTRON_APP="node_modules/electron/dist/Electron.app"
INFO_PLIST="$ELECTRON_APP/Contents/Info.plist"
DEV_BUNDLE_ID="com.slowblink.app.dev"
DEV_BUNDLE_NAME="slowblink-dev"
# Description strings mirror `mac.extendInfo` in electron-builder.yml — keep
# them identical so dev and packaged builds show the same prompt copy.
SCREEN_DESC="slowblink captures periodic screenshots to summarize your activity locally."
EVENTS_DESC="slowblink uses AppleScript to read window titles for activity tracking."

if [[ ! -d "$ELECTRON_APP" ]]; then
  echo "→ sign-dev-electron: $ELECTRON_APP missing — skip (run pnpm install first)"
  exit 0
fi

# Idempotency: bail when the bundle is already signed under our identity.
# Querying codesign (not Info.plist) makes this self-correcting — if a
# previous run patched Info.plist but failed before re-signing, the codesign
# identity is still the original `Electron`, so we re-run the whole flow
# and end up consistent. Self-resets after Electron version bumps (pnpm
# extracts a fresh, unsigned copy → check fails → re-sign).
current_signed_id=$(codesign -dv "$ELECTRON_APP" 2>&1 | sed -n 's/^Identifier=//p' || true)
if [[ "$current_signed_id" == "$DEV_BUNDLE_ID" ]]; then
  exit 0
fi

echo "→ sign-dev-electron: patching $ELECTRON_APP with stable identity"

# Break hardlinks to pnpm's content-addressable store before editing —
# otherwise the patch would propagate to every other project sharing this
# Electron version. `cp -c -R` uses APFS clonefile(2): the destination is a
# fresh inode that shares blocks with the source via copy-on-write, so disk
# usage stays minimal until our edits diverge from the original. The temp
# path is a sibling of the original to guarantee same-volume cloning.
TMP_APP="$ELECTRON_APP.tmp.$$"
trap 'rm -rf "$TMP_APP"' EXIT
cp -c -R "$ELECTRON_APP" "$TMP_APP"
rm -rf "$ELECTRON_APP"
mv "$TMP_APP" "$ELECTRON_APP"
trap - EXIT

set_plist_string() {
  local key="$1"
  local value="$2"
  if /usr/libexec/PlistBuddy -c "Print :$key" "$INFO_PLIST" >/dev/null 2>&1; then
    /usr/libexec/PlistBuddy -c "Set :$key $value" "$INFO_PLIST"
  else
    /usr/libexec/PlistBuddy -c "Add :$key string $value" "$INFO_PLIST"
  fi
}

set_plist_string "CFBundleIdentifier" "$DEV_BUNDLE_ID"
set_plist_string "CFBundleName" "$DEV_BUNDLE_NAME"
set_plist_string "CFBundleDisplayName" "$DEV_BUNDLE_NAME"
set_plist_string "NSScreenCaptureUsageDescription" "$SCREEN_DESC"
set_plist_string "NSAppleEventsUsageDescription" "$EVENTS_DESC"

# Re-sign the outer bundle only. We didn't touch helpers / frameworks, so
# their existing ad-hoc signatures stay valid; codesign rebuilds the outer
# bundle's CodeResources around them. `--deep` would also re-sign nested
# bundles, but it trips over Electron Framework's directory structure with
# "bundle format is ambiguous" — avoiding it sidesteps the bug.
# `-` is the ad-hoc identity; that's all we have without a Developer ID.
codesign --force --sign - "$ELECTRON_APP"

echo "→ sign-dev-electron: done."
echo "  Open System Settings → Privacy & Security → Screen Recording (and"
echo "  Accessibility) and grant 'slowblink-dev' once. Permissions will"
echo "  persist across pnpm installs, but reset when Electron version bumps."
