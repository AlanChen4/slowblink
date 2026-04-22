#!/usr/bin/env bash
# Dev loop orchestrator. Boots the Supabase stack (idempotent — fast no-op
# if already running), then starts Electron, the Stripe listener, and the
# Edge Function server as three concurrent panes.
#
# For a minimal Electron-only loop (no backend at all), use `pnpm dev:app`.

set -euo pipefail

# Auto-wrap in `doppler run` when the project uses Doppler. Keeps `pnpm dev`
# as the single entry point regardless of whether the user remembers the
# prefix. Skipped when already inside a doppler-run shell (DOPPLER_CONFIG
# set), when Doppler is intentionally disabled via NO_DOPPLER=1, or when
# the CLI/config isn't available (plain `.env.local` users).
if [[ -z "${DOPPLER_CONFIG:-}" ]] \
   && [[ -z "${NO_DOPPLER:-}" ]] \
   && [[ -f .doppler.yaml ]] \
   && command -v doppler >/dev/null 2>&1; then
  # Read the config name out of the committed yaml directly — works on
  # fresh checkouts and worktrees without requiring `doppler setup`.
  doppler_config=$(awk '/^[[:space:]]+config:/ {print $2; exit}' .doppler.yaml)
  if [[ -n "${doppler_config}" ]]; then
    echo "→ re-exec under doppler run --config ${doppler_config} (set NO_DOPPLER=1 to skip)"
    exec doppler run --config "${doppler_config}" -- bash "$0"
  fi
fi

echo "→ booting Supabase stack (idempotent)"
pnpm db:start

echo "→ starting Electron + Stripe listener + Edge Functions"
pnpm exec concurrently \
  --names electron,stripe,fns \
  --prefix-colors cyan,magenta,yellow \
  "electron-vite dev" \
  "pnpm stripe:listen" \
  "pnpm db:functions:serve"
