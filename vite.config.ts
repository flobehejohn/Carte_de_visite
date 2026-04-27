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

    build: {
      manifest: true,
      reportCompressedSize: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalized = id.split('\\').join('/');

            if (
              normalized.includes(
                'node_modules/three/examples/jsm/postprocessing',
              )
            ) {
              return 'three-postprocess';
            }

            if (normalized.includes('node_modules/three/')) {
              return 'three-core';
            }

            if (
              normalized.includes('node_modules/troika-three-text') ||
              normalized.includes('node_modules/troika-')
            ) {
              return 'troika-text';
            }

            if (
              normalized.includes('node_modules/framer-motion') ||
              normalized.includes('node_modules/@react-spring') ||
              normalized.includes('node_modules/gsap')
            ) {
              return 'motion-ui';
            }

            if (
              normalized.includes('/src/scene/') ||
              normalized.includes('/src/components/oracle/Oracle3DScene')
            ) {
              return 'orchestrator-3d';
            }

            if (normalized.includes('node_modules')) {
              return 'vendor';
            }

            return undefined;
          },
        },
      },
    },

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
