import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist', emptyOutDir: true,
    rollupOptions: { input: { editor: resolve(__dirname, 'index.html'), hud: resolve(__dirname, 'hud.html') } },
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
