import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    // Explicit allowlist of env vars that get baked into the main-process
    // bundle via `import.meta.env`. Each entry has been audited as safe to
    // ship to end-users' disks:
    //
    //   SUPABASE_URL / SUPABASE_ANON_KEY — public by Supabase's design; RLS
    //     protects data. These are meant for client-side distribution.
    //   SLOWBLINK_API_BASE — dev URL override, non-sensitive.
    //   MAIN_VITE_* — electron-vite convention slot, reserved for
    //     client-safe values by convention.
    //
    // BYO user keys (OPENAI_API_KEY, CLOUDFLARE_*) are deliberately NOT
    // on this list — baking them would ship the developer's own keys to
    // every user. They're still read at runtime via `process.env` (see
    // src/main/env.ts), so Doppler/shell-export still works. For dev with
    // dotenv, use Doppler or export vars into the shell before `pnpm dev`.
    //
    // NEVER add a broad prefix like `SUPABASE_` — that would catch
    // server-only secrets (SERVICE_ROLE_KEY, AUTH_GOOGLE_SECRET, etc.) if
    // they're in build env. scripts/check-bundle-secrets.js catches
    // regressions after build.
    envPrefix: [
      'MAIN_VITE_',
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SLOWBLINK_API_BASE',
    ],
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
  },
});
