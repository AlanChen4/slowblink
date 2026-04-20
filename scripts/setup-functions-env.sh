#!/usr/bin/env bash
# Populate `supabase/.env` for `supabase functions serve --env-file ...`.
#
# Doppler users (detected via committed `.doppler.yaml` + installed CLI):
#   pull the current config's secrets into `supabase/.env` in one shot so
#   the edge-function dev loop picks up STRIPE_SECRET_KEY, etc. Safe to
#   run every time `pnpm dev` starts — the file is gitignored.
#
# Everyone else: leave the file alone if present (user maintains it from
#   supabase/.env.example), or create an empty one so `functions serve`
#   doesn't error on a missing --env-file target. Edge functions that
#   call `requireEnv(...)` will still fail loudly at request time, but
#   with a specific "missing required env var: NAME" message.

set -uo pipefail

ENV_FILE="supabase/.env"

if [[ -f .doppler.yaml ]] && command -v doppler >/dev/null 2>&1; then
  # Read config out of the committed yaml so this works on fresh checkouts
  # (including worktrees) without requiring `doppler setup` first. We don't
  # pass --project: personal auth tokens are implicitly scoped to a single
  # project and the flag triggers an access check rather than a scope
  # override. The config name is what selects dev vs prd.
  config=$(awk '/^[[:space:]]+config:/ {print $2; exit}' .doppler.yaml)
  if [[ -n "${config}" ]]; then
    echo "→ syncing ${ENV_FILE} from Doppler (config: ${config})"
    if doppler secrets download --config "${config}" \
         --no-file --format env > "${ENV_FILE}.tmp" 2>/tmp/doppler-sync.err; then
      mv "${ENV_FILE}.tmp" "${ENV_FILE}"
      exit 0
    else
      echo "⚠ Doppler sync failed — see /tmp/doppler-sync.err (maybe run \`doppler login\`)"
      rm -f "${ENV_FILE}.tmp"
    fi
  fi
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "⚠ ${ENV_FILE} does not exist and Doppler sync didn't run"
  echo "  Copy supabase/.env.example to ${ENV_FILE} and fill in values."
  echo "  Creating an empty file so functions serve starts."
  : > "${ENV_FILE}"
fi
