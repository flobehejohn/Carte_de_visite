import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const port = Number(process.env.PORT ?? '5173');

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: Number(process.env.PORT ?? '4173'),
    strictPort: true,
  },
});
