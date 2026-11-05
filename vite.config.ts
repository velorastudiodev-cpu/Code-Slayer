import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// /api → server eksekusi (npm run server) untuk C, C++, Java, Go, Rust, C#, Kotlin.
const proxy = { '/api': 'http://127.0.0.1:8787' }

export default defineConfig({
  plugins: [
    react(),
    // PWA offline: app shell + semua chunk (materi, soal, kuis, Parsons) di-precache;
    // Pyodide (besar) di-cache saat pertama dipakai, lalu tersedia offline. /api (bahasa compiled) selalu butuh koneksi.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'characters/**/*'],
      manifest: {
        name: 'Code Slayer 鬼殺コード',
        short_name: 'Code Slayer',
        description: 'Belajar coding sungguhan ala Korps Pembasmi Iblis: tulis kode, lulus tes, naik rank.',
        lang: 'id',
        theme_color: '#1e1b18',
        background_color: '#f4eee2',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,json}'],
        globIgnores: ['pyodide/**'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.startsWith('/pyodide/'), handler: 'CacheFirst', options: { cacheName: 'pyodide', expiration: { maxEntries: 64 } } },
          { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
        ],
      },
    }),
  ],
  server: { proxy },
  preview: { proxy },
})
