import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const port = Number(env.PORT || process.env.PORT || '5173');
  const previewPort = Number(
    env.PREVIEW_PORT || process.env.PREVIEW_PORT || '4173',
  );

  const apiTarget = String(
    env.VITE_API_PROXY_TARGET ||
      process.env.VITE_API_PROXY_TARGET ||
      'http://127.0.0.1:3000',
  ).trim();

  return {
    plugins: [react()],

    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },

    preview: {
      host: '127.0.0.1',
      port: previewPort,
      strictPort: true,
    },
  };
});
