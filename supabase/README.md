# slowblink Supabase project

Schema, RLS policies, and Edge Functions for the cloud side of slowblink.

## Install the CLI

```bash
brew install supabase/tap/supabase        # macOS (primary)
# or cross-platform, no global install:
pnpm dlx supabase@latest --version
```

## Local bootstrap (first time)

```bash
cp supabase/.env.example supabase/.env    # then fill in values
pnpm supabase:start                       # prints anon + service-role keys
pnpm supabase:db:reset                    # apply migrations + seed
pnpm supabase:functions:serve             # in a separate shell
```

Paste the printed `SUPABASE_URL` and `SUPABASE_ANON_KEY` into the root `.env`
(the Electron app reads from there). Studio is at http://127.0.0.1:54323.

## Stripe webhooks (local)

```bash
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook
stripe trigger customer.subscription.updated
```

Copy the printed `whsec_...` into `supabase/.env` as `STRIPE_WEBHOOK_SECRET`.

## Remote bootstrap

```bash
supabase link --project-ref <ref>
supabase secrets set --env-file supabase/.env
pnpm supabase:db:push
pnpm supabase:functions:deploy
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
| `CF_ACCOUNT_ID`                   | Cloudflare dashboard → right sidebar                       |
| `CF_GATEWAY_ID`                   | Cloudflare AI → gateway name                               |
| `CF_AI_TOKEN`                     | Cloudflare AI → API token with AI Gateway Run permission   |
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
