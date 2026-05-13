import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// `pnpm test` runs cheap tests only. `pnpm test:eval` (which sets VITEST_EVAL)
// runs ONLY the *.eval.test.ts files — these hit a real LLM and need
// OPENAI_API_KEY in env.
const isEval = process.env.VITEST_EVAL === '1';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    environment: 'node',
    environmentMatchGlobs: [['src/renderer/**', 'jsdom']],
    include: isEval
      ? ['src/**/*.eval.test.{ts,tsx}']
      : ['src/**/*.test.{ts,tsx}'],
    exclude: isEval
      ? ['**/node_modules/**']
      : ['**/node_modules/**', '**/*.eval.test.{ts,tsx}'],
  },
});
