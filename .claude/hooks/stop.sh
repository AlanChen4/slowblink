#!/bin/bash
set -uo pipefail

if [ -n "${CI:-}" ]; then exit 0; fi

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
PNPM_BIN="${PNPM_BIN:-pnpm}"

if [ ! -d node_modules ]; then
  echo "📦 node_modules missing — running pnpm install..." >&2
  if ! "$PNPM_BIN" install --frozen-lockfile >&2; then
    echo "❌ pnpm install failed" >&2
    exit 2
  fi
fi

UNTRACKED_TS=$(git ls-files --others --exclude-standard -- 'src/*.ts' 'src/*.tsx' 'src/**/*.ts' 'src/**/*.tsx' 2>/dev/null || true)
if [ -n "$UNTRACKED_TS" ]; then
  echo "⚠️  Skipping checks: untracked TS files present (commit or delete to re-enable):" >&2
  echo "$UNTRACKED_TS" | sed 's/^/    /' >&2
  exit 0
fi

RESULTS_DIR=$(mktemp -d)
trap 'rm -rf "$RESULTS_DIR"' EXIT

start_check() {
  local name="$1"
  shift
  ("$@" > "$RESULTS_DIR/$name.out" 2>&1; echo $? > "$RESULTS_DIR/$name.status") &
}

# format writes files in place — run sequentially before parallel read-only
# checks so lint/typecheck/test see a stable file tree.
"$PNPM_BIN" format > "$RESULTS_DIR/format.out" 2>&1
echo $? > "$RESULTS_DIR/format.status"

start_check "lint" "$PNPM_BIN" exec oxlint --deny-warnings --ignore-pattern '.claude/worktrees/**'
start_check "typecheck" env SKIP_ENV_VALIDATION=true "$PNPM_BIN" typecheck
start_check "knip" "$PNPM_BIN" knip
start_check "deprecated" node scripts/check-deprecated.js
start_check "test" env SKIP_ENV_VALIDATION=true "$PNPM_BIN" test

wait

FAILED=0
OUTPUT=""
for name in format lint typecheck knip deprecated test; do
  status=$(cat "$RESULTS_DIR/$name.status")
  if [ "$status" -eq 0 ]; then
    echo "✅ $name passed" >&2
  else
    FAILED=1
    result=$(cat "$RESULTS_DIR/$name.out")
    OUTPUT="$OUTPUT\n\n❌ $name FAILED:\n$result"
    echo "❌ $name failed" >&2
  fi
done

if [ $FAILED -ne 0 ]; then
  echo "" >&2
  echo "=== ERRORS TO FIX ===" >&2
  echo -e "$OUTPUT" >&2
  exit 2
fi
echo "All checks passed." >&2
