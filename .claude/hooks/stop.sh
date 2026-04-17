#!/bin/bash
set -uo pipefail

if [ ! -d node_modules ]; then
  echo "📦 node_modules missing — running pnpm install..." >&2
  if ! pnpm install --frozen-lockfile >&2; then
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

FAILED=0
OUTPUT=""

run_check() {
  local name="$1"
  shift
  local result
  if result=$("$@" 2>&1); then
    echo "✅ $name passed" >&2
  else
    FAILED=1
    OUTPUT="$OUTPUT\n\n❌ $name FAILED:\n$result"
    echo "❌ $name failed" >&2
  fi
}

run_check "format" pnpm format
run_check "lint" pnpm exec biome check --error-on-warnings
run_check "typecheck" env SKIP_ENV_VALIDATION=true pnpm typecheck
run_check "knip" pnpm knip
run_check "deprecated" node scripts/check-deprecated.js
run_check "test" env SKIP_ENV_VALIDATION=true pnpm test

if [ $FAILED -ne 0 ]; then
  echo "" >&2
  echo "=== ERRORS TO FIX ===" >&2
  echo -e "$OUTPUT" >&2
  exit 2
fi
echo "All checks passed." >&2
