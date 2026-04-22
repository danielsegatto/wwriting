import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    // @supabase/auth-ui-react bundles its own React 18, causing the
    // "invalid hook call" error when mixed with the app's React 19.
    // dedupe forces all React imports to resolve to one instance.
    dedupe: ['react', 'react-dom'],
  },
})
