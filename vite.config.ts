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
    // Use terser for better minification & dead-code removal
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Strip all console.* calls in production
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        // Manual chunk splitting for optimal caching & parallel loading
        // Vite 8 uses Rolldown - manualChunks must be a function
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          
          // React core — rarely changes, long cache
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router-dom/')) {
            return 'vendor-react';
          }
          // CKEditor — heaviest dep, only needed on compose page (lazy loaded)
          if (id.includes('/ckeditor5/') || id.includes('/@ckeditor/')) {
            return 'vendor-ckeditor';
          }
          // UI animation libraries
          if (id.includes('/framer-motion/') || id.includes('/lucide-react/')) {
            return 'vendor-ui';
          }
          // Data & utilities
          if (id.includes('/dexie/') || id.includes('/dompurify/') || id.includes('/react-hook-form/') || id.includes('/react-toastify/') || id.includes('/jwt-decode/')) {
            return 'vendor-data';
          }
        },
      },
    },
  },
})
