import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command }) => {
  const base = command === 'build' ? '/wwriting/' : '/'

  return {
    base,
    plugins: [
      tailwindcss(),
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'wwriting',
          short_name: 'wwriting',
          description: 'Personal writing tool',
          start_url: command === 'build' ? '/wwriting/' : '/',
          scope: command === 'build' ? '/wwriting/' : '/',
          display: 'standalone',
          background_color: '#09090b',
          theme_color: '#09090b',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          // Never cache Supabase API or auth traffic.
          navigateFallbackDenylist: [/.*\.supabase\.co.*/],
          runtimeCaching: [
            {
              urlPattern: /.*\.supabase\.co.*/,
              handler: 'NetworkOnly',
            },
          ],
        },
      }),
    ],
    resolve: {
      // @supabase/auth-ui-react bundles its own React 18, causing the
      // "invalid hook call" error when mixed with the app's React 19.
      // dedupe forces all React imports to resolve to one instance.
      dedupe: ['react', 'react-dom'],
    },
  }
})
