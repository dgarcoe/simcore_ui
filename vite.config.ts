/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// Simcore's FastAPI server listens on :8420 by default (`--port 8420`).
const backend = process.env.SIMCORE_URL ?? 'http://localhost:8420';
// The editor lists the models installed in Ollama (GET /ollama/api/tags).
const ollama = process.env.OLLAMA_URL ?? 'http://localhost:11434';

// The Simcore commit this UI is tested with (docker/simcore.Dockerfile), to warn about an older one.
const simcoreRef = /ARG SIMCORE_REF=(\w+)/.exec(readFileSync(new URL('docker/simcore.Dockerfile', import.meta.url), 'utf8'))?.[1] ?? '';

export default defineConfig({
  plugins: [react()],
  define: { __SIMCORE_REF__: JSON.stringify(simcoreRef) },
  server: {
    port: 5173,
    proxy: {
      '/api': backend,
      '/ws': { target: backend.replace(/^http/, 'ws'), ws: true },
      '/ollama/api/tags': { target: ollama, rewrite: (p) => p.replace(/^\/ollama/, '') },
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
