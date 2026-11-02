import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
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
