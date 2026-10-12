import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev the Vite server proxies API calls to the NestJS backend so the
// frontend uses relative /api/v1 paths in every environment.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
