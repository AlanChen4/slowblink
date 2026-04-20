// Post-build guard: fail if the Electron client bundle contains server-only
// secrets. Runs after `electron-vite build` in the `build` script.
//
// The primary safeguard is `electron.vite.config.ts`'s narrow `envPrefix`
// allowlist. This check is belt-and-suspenders: if someone widens the
// allowlist back to a broad `SUPABASE_` prefix (or a new forbidden var is
// added to build env), this catches the leak before we package and ship.
//
// Server-only secrets live in Edge Function env — they must never reach
// code that runs on a user's machine. The Supabase anon key is public by
// design; the service role key is not.
const fs = require('node:fs');
const path = require('node:path');

const CLIENT_BUNDLES = [
  'out/main/index.js',
  'out/preload/index.js',
];
const RENDERER_ASSET_DIR = 'out/renderer/assets';

// Forbidden *names* — if any of these strings appear in the bundle (as a
// baked key in `__vite_import_meta_env__` or anywhere else), something has
// gone wrong. These are all server-only.
const FORBIDDEN_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_AUTH_GOOGLE_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'CF_AI_TOKEN',
];

// Forbidden *value* patterns — catches the case where a secret value was
// baked under a renamed key we didn't think to denylist.
const FORBIDDEN_PATTERNS = [
  // Supabase new-format service role key (2024+)
  /sb_secret_[A-Za-z0-9_-]{16,}/,
  // Stripe live/restricted/webhook secrets
  /sk_live_[A-Za-z0-9]{16,}/,
  /rk_live_[A-Za-z0-9]{16,}/,
  /whsec_[A-Za-z0-9]{16,}/,
];

function rendererBundles() {
  try {
    return fs
      .readdirSync(RENDERER_ASSET_DIR)
      .filter((f) => f.endsWith('.js'))
      .map((f) => path.join(RENDERER_ASSET_DIR, f));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function scan(file) {
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(`⚠ skipping ${file} (not built)`);
      return [];
    }
    throw err;
  }
  const violations = [];
  for (const name of FORBIDDEN_NAMES) {
    if (content.includes(name)) {
      violations.push(`${file}: forbidden env var name "${name}"`);
    }
  }
  for (const pattern of FORBIDDEN_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      violations.push(
        `${file}: forbidden pattern ${pattern} → ${match[0].slice(0, 16)}…`,
      );
    }
  }
  return violations;
}

const files = [...CLIENT_BUNDLES, ...rendererBundles()];
const violations = files.flatMap(scan);

if (violations.length) {
  console.error('❌ Secret leakage detected in client bundle:');
  for (const v of violations) console.error('  -', v);
  console.error(
    '\nFix: remove the var from build env (Doppler/.env.local), or narrow `envPrefix` in electron.vite.config.ts.',
  );
  console.error(
    'Server-only secrets belong in Edge Function env, never the Electron client.',
  );
  process.exit(1);
}
console.log(`✓ No server-only secrets detected in ${files.length} bundle(s)`);
