import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'prompt',
      manifest: {
        name: 'GRIP Biochar',
        short_name: 'GRIP',
        description: 'Biochar production run sheets',
        theme_color: '#1e3a5f',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/timberloop-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/timberloop-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
      },
    }),
  ],
})
