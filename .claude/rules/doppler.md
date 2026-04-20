# Doppler secrets

[Doppler](https://doppler.com) is the **recommended** way to manage slowblink's
env vars — one source of truth per environment (`dev`, `prd`), injected into
any subprocess via `doppler run --`. It's optional: `.env.local` (Electron)
and `supabase/.env` (Edge Functions) still work if a contributor prefers not
to install another tool.

## How agents should decide which mode to use

Before running a command that needs secrets (`pnpm dev`,
`pnpm db:start`, `pnpm db:functions:serve`, etc.), check which
mode this checkout is in:

1. **`.doppler.yaml` present at repo root** → the user has opted into Doppler.
   Prefix the command with `doppler run --`.
2. **`.doppler.yaml` absent, or `doppler` CLI not installed** → plain `.env`
   mode. Run the command as-is; the user has filled `.env.local` and/or
   `supabase/.env` from the `.env.example` templates.
3. **Inside CI (GitHub Actions)** → secrets already come from the Actions
   secret store. Skip `doppler run --` even if the file is present; otherwise
   you double-inject.

If you use Doppler, you shouldn't need to touch `.env.local` or
`supabase/.env` at all. If you don't, fill those files from the `.env.example`
templates.

## One-time setup (Doppler users)

```bash
brew install dopplerhq/cli/doppler   # or see docs for other platforms
doppler login                        # browser auth
doppler setup                        # picks up .doppler.yaml defaults
```

The committed `.doppler.yaml` pins `project=slowblink` and `config=dev`, so
`doppler setup` skips the interactive prompts. Overriding for a single
command is `DOPPLER_CONFIG=<name>` inline.

## Running the dev loop

Prefix every command that needs secrets with `doppler run --`:

```bash
doppler run -- pnpm dev                        # Electron app
doppler run -- pnpm db:start             # local Postgres + Studio
doppler run -- pnpm db:functions:serve   # edge functions
doppler run -- pnpm db:reset             # applies migrations
```

`doppler run` injects Doppler secrets as env vars into the subprocess. The
Supabase CLI picks up `SUPABASE_AUTH_GOOGLE_CLIENT_ID` et al. from
`config.toml`'s `env(...)` refs, and edge functions see them via
`Deno.env.get()`.

**Note on `db:functions:serve`**: the script passes
`--env-file supabase/.env` for plain-env users. The easiest path for Doppler
users is to prepopulate that file once:

```bash
doppler secrets download --no-file --format env > supabase/.env
```

Re-run after any Doppler change. `supabase/.env` is gitignored.

## Pushing secrets to hosted Supabase

Edge functions deployed to Supabase don't read Doppler at runtime — they
read their own secret vault. Sync from Doppler in one shot:

```bash
doppler secrets download --config prd --no-file --format env \
  | supabase secrets set --env-file /dev/stdin
```

Re-run after any Doppler change. The Electron app uses its own `.env.local`
for shipped builds; generate it similarly:

```bash
doppler secrets download --config prd --no-file --format env > .env.local
```

`.env.local` is gitignored.

## Config conventions

- **`dev`** — local development. Uses Stripe test keys, local OAuth client,
  the local Supabase stack's service-role key.
- **`prd`** — production. Live Stripe keys, production OAuth client, hosted
  Supabase service role.

New secrets go in Doppler **first**, then are referenced by name in code.
Never commit a secret even as a placeholder — the `.env.example` files use
empty strings as templates, not live values.

## When NOT to use `doppler run`

- CI already injects secrets through GitHub Actions' own secret store; don't
  double-inject.
- Running read-only commands (`pnpm lint`, `pnpm typecheck`, `pnpm knip`) —
  nothing reads env, skip the wrapper.
- One-off SQL inspection via `psql` against the local stack — `supabase
  status` prints the connection string inline.
