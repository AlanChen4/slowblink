# Doppler secrets

slowblink uses [Doppler](https://doppler.com) to manage every secret the app
and its Supabase backend need at runtime. Do not maintain parallel `.env`
files — they drift, get committed by accident, and hide which secret
belongs to which environment.

## One-time setup

```bash
brew install dopplerhq/cli/doppler   # or see docs for other platforms
doppler login                        # browser auth
doppler setup                        # pick project=slowblink, config=dev
```

`doppler setup` writes a `.doppler.yaml` at the repo root with the project +
config defaults. It's committed so every contributor gets the same defaults;
overriding is `DOPPLER_CONFIG=<name>` inline.

## Running anything

**Prefix every command that needs secrets with `doppler run --`.** That
includes the Electron dev loop, the Supabase stack, and the edge-function
dev server:

```bash
doppler run -- pnpm dev                        # Electron app
doppler run -- pnpm supabase:start             # local Postgres + Studio
doppler run -- pnpm supabase:functions:serve   # edge functions
doppler run -- pnpm supabase:db:reset          # applies migrations
```

`doppler run` injects Doppler secrets as env vars into the subprocess, so the
Supabase CLI picks up `SUPABASE_AUTH_GOOGLE_CLIENT_ID` et al. from
`config.toml`'s `env(...)` refs, and edge functions see them via
`Deno.env.get()`.

## Pushing secrets to hosted Supabase

Edge functions deployed to Supabase don't read Doppler at runtime — they
read their own secret vault. Sync from Doppler in one shot:

```bash
doppler secrets download --no-file --format env \
  | supabase secrets set --env-file /dev/stdin
```

Re-run after any Doppler change. The Electron app uses its own `.env.local`
for shipped builds; generate it similarly:

```bash
doppler secrets download --no-file --format env > .env.local
```

`.env.local` is gitignored.

## Config conventions

- **`dev`** — local development. Uses Stripe test keys, local OAuth client,
  the local Supabase stack's service-role key.
- **`prd`** — production. Live Stripe keys, production OAuth client, hosted
  Supabase service role.

New secrets go in Doppler **first**, then are referenced by name in code.
Never commit a secret even as a placeholder — `supabase/.env.example`
uses empty strings as templates, not live values.

## When NOT to use `doppler run`

- CI already injects secrets through GitHub Actions' own secret store; don't
  double-inject.
- Running read-only commands (`pnpm lint`, `pnpm typecheck`, `pnpm knip`) —
  nothing reads env, skip the wrapper.
- One-off SQL inspection via `psql` against the local stack — `supabase
  status` prints the connection string inline.
