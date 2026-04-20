import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    // Explicit allowlist: only these exact env var names get baked into the
    // main-process bundle via `import.meta.env`. NEVER widen to broad
    // prefixes like `SUPABASE_` — that would catch server-only secrets
    // (SERVICE_ROLE_KEY, AUTH_GOOGLE_SECRET, etc.) at build time and ship
    // them to every user. Server-only secrets live in Edge Function env,
    // not here. Runtime reads also fall back to `process.env` (see
    // src/main/env.ts) so Doppler-injected values work without baking.
    envPrefix: [
      'MAIN_VITE_',
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SLOWBLINK_API_BASE',
      'OPENAI_API_KEY',
      'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_API_TOKEN',
      'CLOUDFLARE_GATEWAY_ID',
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
