import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        // Vite treats extensionless URLs as JS and would serve api/*.ts as transformed modules.
        // Vercel Functions in /api are not executed by `vite dev`; stub JSON so the client poll works.
        proxy: {
          '/api/ally-virtual-opportunities': {
            target: 'http://127.0.0.1:1',
            changeOrigin: true,
            bypass(req, res) {
              if (!req.url?.startsWith('/api/ally-virtual-opportunities')) return;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.statusCode = 200;
              res.end('[]');
              return req.url;
            },
          },
        },
      },
      build: {
        outDir: 'dist',
        sourcemap: false,
      },
      optimizeDeps: {
        include: ['leaflet'],
      },
      plugins: [
        react(),
        tailwindcss(),
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
