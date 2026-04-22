# slowblink Supabase project

Schema, RLS policies, and Edge Functions for the cloud side of slowblink.

## Install the CLI

```bash
brew install supabase/tap/supabase        # macOS (primary)
# or cross-platform, no global install:
pnpm dlx supabase@latest --version
```

## Local bootstrap (first time)

**Recommended: use Doppler** (see [`.claude/rules/doppler.md`](../.claude/rules/doppler.md)).
Once `doppler setup` is linked to the `dev` config, every command below runs
through `doppler run --` and you never touch `supabase/.env` or root `.env`:

```bash
doppler run -- pnpm db:start             # prints anon + service-role keys
doppler run -- pnpm db:reset             # apply migrations + seed
doppler run -- pnpm db:functions:serve   # in a separate shell
```

**Fallback: plain `.env` files.** If you're not using Doppler:

```bash
cp supabase/.env.example supabase/.env    # then fill in values
pnpm db:start                             # prints anon + service-role keys
pnpm db:reset
pnpm db:functions:serve
```

Paste the printed `SUPABASE_URL` and `SUPABASE_ANON_KEY` into the root `.env`
(the Electron app reads from there). Studio is at http://127.0.0.1:55323.

## Stripe webhooks (local)

`pnpm dev` runs the Stripe CLI listener alongside Electron. If you just want
the listener (e.g. paired with a standalone `pnpm dev:app`):

```bash
pnpm stripe:listen                              # forwards to local stripe-webhook
stripe trigger customer.subscription.updated    # in another shell
```

First run only: copy the printed `whsec_...` into Doppler (or
`supabase/.env`) as `STRIPE_WEBHOOK_SECRET`. The Stripe CLI reuses the same
secret across runs, so you set it once.

## Remote bootstrap

```bash
supabase link --project-ref <ref>

# With Doppler (recommended): pipe secrets straight from the prd config.
doppler secrets download --config prd --no-file --format env \
  | supabase secrets set --env-file /dev/stdin

# Without Doppler: use the local .env file.
# supabase secrets set --env-file supabase/.env

pnpm db:push
pnpm db:functions:deploy
```

Then in the Stripe Dashboard → Developers → Webhooks, add an endpoint at
`https://<ref>.supabase.co/functions/v1/stripe-webhook`. Subscribe to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Copy the endpoint's signing secret back into `STRIPE_WEBHOOK_SECRET` and re-run
`supabase secrets set --env-file supabase/.env`.

## Production secrets

| Name                              | Source                                                     |
| --------------------------------- | ---------------------------------------------------------- |
| `STRIPE_SECRET_KEY`               | Stripe Dashboard → Developers → API keys                   |
| `STRIPE_WEBHOOK_SECRET`           | Stripe Dashboard → Webhooks → endpoint → Signing secret    |
| `STRIPE_PRICE_ID`                 | Stripe product → price                                     |
| `CLOUDFLARE_ACCOUNT_ID`           | Cloudflare dashboard → right sidebar                       |
| `CLOUDFLARE_GATEWAY_ID`           | Cloudflare AI → gateway name                               |
| `CLOUDFLARE_API_TOKEN`            | Cloudflare AI → API token with AI Gateway Run permission   |
| `OPENAI_API_KEY`                  | OpenAI dashboard                                           |
| `SUPABASE_AUTH_GOOGLE_CLIENT_ID`  | Google Cloud → Credentials → OAuth 2.0 Client ID           |
| `SUPABASE_AUTH_GOOGLE_SECRET`     | same                                                       |

## Layout

- `config.toml` — CLI config (ports, auth providers, per-function `verify_jwt`).
- `migrations/` — forward-only SQL migrations, applied by `supabase db reset`/`push`.
- `functions/_shared/` — helpers imported by multiple functions. Underscore
  prefix tells the CLI not to deploy this directory as a function.
- `functions/<name>/index.ts` — each subdirectory is deployed as a function.
- `seed.sql` — local-only seed data (not run on remote).

## Conventions

- **Migrations**: timestamped `YYYYMMDDHHMMSS_<description>.sql`. Forward-only.
- **RLS**: `alter table ... enable row level security` + `force row level security`.
  Wrap `auth.uid()` as `(select auth.uid())` for statement-level caching.
  Separate policy per operation (SELECT/INSERT/UPDATE/DELETE); always specify
  `to authenticated` / `to service_role`.
- **Edge Functions**: `Deno.serve(...)`, `npm:` import specifiers, secrets via
  `Deno.env.get()`. Shared code in `_shared/`. Return JSON + CORS headers.
- **Service role**: only inside Edge Functions, never exposed to the Electron
  client. The client uses the anon key; writes go through functions.
