import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import pkg from './package.json' with { type: 'json' };
const appVersion = pkg.version;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Bake the app version into the bundle for the optional update checker.
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      // WebSocket live-sync — without this proxy the WS client can't reach
      // the API through the Vite dev server and silently falls back to
      // manual sync during local development.
      '/ws': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  // Applies to `npm run preview` / `npm run preview:prod` (serves the
  // production build). Mirrors the dev proxies so the built frontend can
  // talk to a locally running production API — this is the local
  // production-verification flow documented in README and DEPLOYMENT.md.
  preview: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      // import.meta.url-based resolution (not the CommonJS __dirname, which
      // Vite 8's native config loader doesn't support) and works on every
      // Node 20 release (import.meta.dirname needs 20.11+).
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Target modern browsers for smaller output
    target: 'es2020',
    // Enable CSS code splitting — each lazy chunk gets its own CSS
    cssCodeSplit: true,
    // CKEditor chunk is ~1.2MB but lazy-loaded only on compose page
    chunkSizeWarningLimit: 1200,
    // Vite 8 uses Oxc for transforms/minification and Rolldown for bundling.
    // Keep production console stripping simple through the default Oxc minifier.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|react-router)[\\/]/,
              priority: 40,
            },
            {
              name: 'vendor-ckeditor',
              test: /node_modules[\\/](@ckeditor|ckeditor5)[\\/]/,
              priority: 30,
            },
            {
              name: 'vendor-ui',
              test: /node_modules[\\/](motion|framer-motion|lucide-react)[\\/]/,
              priority: 20,
            },
            {
              name: 'vendor-data',
              test: /node_modules[\\/](dexie|dompurify|react-hook-form|react-toastify|jwt-decode)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
})
