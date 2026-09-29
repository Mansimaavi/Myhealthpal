import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// port 3000 matches the backend's default CORS origin; /api is proxied in dev
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': process.env.VITE_API_PROXY || 'http://localhost:5000',
    },
  },
});
