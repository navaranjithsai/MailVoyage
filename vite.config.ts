import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'; // Import path module

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()], // Removed tailwindcss plugin, using PostCSS for Tailwind
  server: {
    open: false, // Prevent browser from opening automatically
    proxy: {
      // Proxy /api requests to the backend server
      '/api': {
        target: 'http://localhost:3001', // Adjust if your backend runs on a different port
        changeOrigin: true,
        secure: false, // Set to true if your backend uses HTTPS
        // rewrite: (path) => path.replace(/^\/api/, '') // Uncomment if you need to remove /api prefix
      }
    }
  },
  resolve: {
    alias: {
      // Optional: Setup alias for cleaner imports
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
