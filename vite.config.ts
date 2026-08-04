import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Target modern browsers for smaller output
    target: 'es2020',
    // Enable CSS code splitting — each lazy chunk gets its own CSS
    cssCodeSplit: true,
    // CKEditor chunk is ~1.2MB but lazy-loaded only on compose page
    chunkSizeWarningLimit: 1200,
    // esbuild is used for production minification. Terser was previously used
    // but crashes on rolldown-emitted dynamic imports in Vite 8 (known issue).
    // esbuild is faster, smaller, and handles all modern syntax correctly.
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Manual chunk splitting for optimal caching & parallel loading
        // Vite 8 uses Rolldown - manualChunks must be a function
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          // React core — rarely changes, long cache.
          // react-router v8 merged react-router-dom's API into react-router,
          // so there's no separate react-router-dom package to reference here.
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router/')) {
            return 'vendor-react';
          }
          // CKEditor — heaviest dep, only needed on compose page (lazy loaded)
          if (id.includes('/ckeditor5/') || id.includes('/@ckeditor/')) {
            return 'vendor-ckeditor';
          }
          // UI animation libraries (framer-motion + lucide-react)
          if (id.includes('/framer-motion/') || id.includes('/lucide-react/')) {
            return 'vendor-ui';
          }
          // Data & utilities (Dexie, DOMPurify, forms, toastify, JWT)
          if (id.includes('/dexie/') || id.includes('/dompurify/') || id.includes('/react-hook-form/') || id.includes('/react-toastify/') || id.includes('/jwt-decode/')) {
            return 'vendor-data';
          }
        },
      },
    },
  },
  // NOTE: Vite 8 uses oxc (not esbuild) for its default transform pipeline.
  // The 'esbuild.pure' option conflicts with oxc and causes SSR transform
  // errors. Console stripping in production is handled by esbuild's 'minify'
  // dead-code elimination (console calls on their own line are removed).
})
