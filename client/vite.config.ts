import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// Single source of truth for the app version: the root package.json.
const rootPkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig(({ mode }) => {
  // The API port comes from the root .env (PORT), same as the server.
  const rootEnv = loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), '');
  const apiPort = rootEnv.PORT || '3111';

  return {
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(rootPkg.version),
    },
    server: {
      port: 5111,
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
