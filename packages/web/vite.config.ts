import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const serverPort = parseInt(process.env.BLOOM_PORT ?? '3101', 10)
const webHost = process.env.BLOOM_WEB_HOST ?? '127.0.0.1'
const webPort = parseInt(process.env.BLOOM_WEB_PORT ?? '3102', 10)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: webHost,
    port: webPort,
    strictPort: true,
    proxy: {
      '/api': `http://127.0.0.1:${serverPort}`,
      '/ws': { target: `ws://127.0.0.1:${serverPort}`, ws: true },
    },
  },
})
