import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const API = process.env.AUTODEV_API ?? 'http://localhost:8787';

// The dashboard resolves `lit` from the repo-root node_modules (no separate
// install). /api and the SSE stream are proxied to the control-plane server.
export default defineConfig({
  root: HERE,
  server: {
    port: Number(process.env.AUTODEV_DASHBOARD_PORT ?? 5990),
    proxy: {
      '/api': { target: API, changeOrigin: true },
    },
  },
});
