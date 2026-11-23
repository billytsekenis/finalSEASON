import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  preview: { proxy: { '/api': 'http://localhost:3001' } },
  server: {
    host: true,
    proxy: { '/api': 'http://localhost:3001' },
  },
});
