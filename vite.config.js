import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/.netlify/functions/account': 'http://127.0.0.1:5183',
      '/_section16_test/': 'http://127.0.0.1:5183',
    },
    watch: {
      ignored: ['**/.tools.local/**'],
    },
  },
})
