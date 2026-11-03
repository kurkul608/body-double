import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Single source of truth for the app version: the root package.json.
const rootPkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
  },
  server: {
    port: 5111,
    proxy: {
      '/api': {
        target: 'http://localhost:3111',
        changeOrigin: true,
      },
    },
  },
});
