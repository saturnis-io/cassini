import path from 'path'
import { defineConfig } from 'vite'
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
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Don't precache API calls
        navigateFallbackDenylist: [/^\/api/, /^\/ws/],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
})
