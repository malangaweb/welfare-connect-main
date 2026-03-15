import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Raise the chunk size warning threshold (heavy libs like recharts/jspdf are expected to be large)
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Manual chunk splitting to avoid one giant vendor bundle.
        // Heavy, infrequently-changing libraries get their own cached chunk.
        manualChunks: {
          // React core
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // UI component library
          'radix-ui': [
            '@radix-ui/react-accordion', '@radix-ui/react-alert-dialog',
            '@radix-ui/react-avatar', '@radix-ui/react-checkbox',
            '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-label', '@radix-ui/react-popover',
            '@radix-ui/react-select', '@radix-ui/react-tabs',
            '@radix-ui/react-toast', '@radix-ui/react-tooltip',
            '@radix-ui/react-slot',
          ],
          // Data fetching
          'query': ['@tanstack/react-query'],
          // Supabase
          'supabase': ['@supabase/supabase-js'],
          // Charts (recharts is large)
          'charts': ['recharts'],
          // PDF / Excel export (large, rarely used)
          'export-libs': ['jspdf', 'jspdf-autotable', 'html2canvas', 'xlsx'],
          // Form utilities
          'forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
          // Date utilities
          'dates': ['date-fns', 'react-day-picker', 'react-datepicker'],
          // Icon library
          'icons': ['lucide-react'],
        },
      },
    },
  },
}));
