import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Point at the package SOURCE, not its dist. The shared basketball fold
      // is edited in the same breath as the tracker UI that renders it, and
      // resolving to dist would mean every change needed a package rebuild
      // before it showed up — and would silently serve a stale box score until
      // someone remembered. Vite compiles the TS directly, so HMR just works.
      '@af1/core': fileURLToPath(new URL('../packages/core/src/index.ts', import.meta.url)),
    },
  },
  build: {
    // Instagram/Facebook in-app WebViews on older Android lag behind stock Chrome.
    // Keep the output compatible so the app boots inside those browsers.
    target: ['es2019', 'chrome87', 'safari14', 'firefox78', 'edge88'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
})
