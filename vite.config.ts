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
        manualChunks: {
          // React core — rarely changes, long cache
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // CKEditor — heaviest dep, only needed on compose page (lazy loaded)
          'vendor-ckeditor': ['ckeditor5', '@ckeditor/ckeditor5-react'],
          // UI animation libraries
          'vendor-ui': ['framer-motion', 'lucide-react'],
          // Data & utilities
          'vendor-data': ['dexie', 'dompurify', 'react-hook-form', 'react-toastify', 'jwt-decode'],
        },
      },
    },
  },
})
