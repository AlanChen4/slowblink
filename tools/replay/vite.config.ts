import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { devCapturesMiddleware } from './src/middleware';

export default defineConfig({
  root: __dirname,
  plugins: [
    react(),
    {
      name: 'slowblink-replay-middleware',
      configureServer(server) {
        server.middlewares.use(devCapturesMiddleware());
      },
    },
  ],
  server: {
    port: 5174,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
