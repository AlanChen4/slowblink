#!/usr/bin/env bash
# Dev loop orchestrator. Boots the Supabase stack (idempotent — fast no-op
# if already running), then starts Electron, the Stripe listener, and the
# Edge Function server as three concurrent panes.
#
# For a minimal Electron-only loop (no backend at all), use `pnpm dev:app`.

set -euo pipefail

echo "→ booting Supabase stack (idempotent)"
pnpm db:start

echo "→ starting Electron + Stripe listener + Edge Functions"
pnpm exec concurrently \
  --names electron,stripe,fns \
  --prefix-colors cyan,magenta,yellow \
  "electron-vite dev" \
  "pnpm stripe:listen" \
  "pnpm db:functions:serve"
