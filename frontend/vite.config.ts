import path from 'path'
import { defineConfig } from 'vite'
import pkg from './package.json' with { type: 'json' }
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Optional commercial extension — resolve to empty module when not installed
function optionalExtension(): import('vite').Plugin {
  const id = '@saturnis/cassini-enterprise'
  return {
    name: 'optional-extension',
    resolveId(source) {
      if (source === id) return `\0${id}`
    },
    load(resolved) {
      if (resolved === `\0${id}`) return 'export default {}'
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    optionalExtension(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'Cassini',
        short_name: 'Cassini',
        description: 'Event-Driven Statistical Process Control',
        theme_color: '#D4AF37',
        background_color: '#080C16',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Don't precache API calls
        navigateFallbackDenylist: [/^\/api/, /^\/ws/],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
          charts: [
            'echarts/core',
            'echarts/charts',
            'echarts/components',
            'echarts/renderers',
          ],
          three: ['three'],
          i18n: ['i18next', 'react-i18next'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.VITE_BACKEND_PORT || '8000'}`,
      },
      '/ws': {
        target: `ws://localhost:${process.env.VITE_BACKEND_PORT || '8000'}`,
        ws: true,
      },
    },
  },
})
