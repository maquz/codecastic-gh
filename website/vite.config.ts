import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { handler } from './backend/index';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-api-backend',
      configureServer(server) {
        server.middlewares.use(handler as any);
      },
      configurePreviewServer(server) {
        server.middlewares.use(handler as any);
      },
    },
  ],
  resolve: {
    alias: {
      '@appdeploy/client': path.resolve(__dirname, 'src/lib/client.ts'),
      '@appdeploy/sdk': path.resolve(__dirname, 'backend/sdk.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  base: '/',
  build: {
    outDir: process.env.APPDEPLOY_VITE_OUT_DIR || 'dist',
    sourcemap:
      process.env.APPDEPLOY_VITE_SOURCEMAP === 'hidden' ? 'hidden' : false,
    rollupOptions: {
      maxParallelFileOps: 128,
    },
  },
});
