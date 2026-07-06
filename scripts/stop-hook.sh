#!/bin/bash
set -uo pipefail

if [ -n "${CI:-}" ]; then exit 0; fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

run_pnpm() {
  if [ -n "${PNPM_BIN:-}" ]; then
    "$PNPM_BIN" "$@"
  elif command -v corepack >/dev/null 2>&1; then
    corepack pnpm "$@"
  else
    pnpm "$@"
  fi
}

if [ ! -d node_modules ]; then
  echo "📦 node_modules missing — running pnpm install..." >&2
  if ! run_pnpm install --frozen-lockfile >&2; then
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

start_pnpm_check() {
  local name="$1"
  shift
  (run_pnpm "$@" > "$RESULTS_DIR/$name.out" 2>&1; echo $? > "$RESULTS_DIR/$name.status") &
}

start_env_pnpm_check() {
  local name="$1"
  shift
  (SKIP_ENV_VALIDATION=true run_pnpm "$@" > "$RESULTS_DIR/$name.out" 2>&1; echo $? > "$RESULTS_DIR/$name.status") &
}

# format writes files in place before parallel read-only checks see the tree.
run_pnpm format > "$RESULTS_DIR/format.out" 2>&1
echo $? > "$RESULTS_DIR/format.status"

start_pnpm_check "lint" exec oxlint --deny-warnings --ignore-pattern '.claude/worktrees/**'
start_env_pnpm_check "typecheck" typecheck
start_pnpm_check "knip" knip
start_check "deprecated" node scripts/check-deprecated.js
start_env_pnpm_check "test" test

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
