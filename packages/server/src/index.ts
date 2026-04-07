import { createServer } from './server.js'

const HOST = process.env.BLOOM_HOST ?? '127.0.0.1'
const PORT = parseInt(process.env.BLOOM_PORT ?? '3101')

async function main() {
  const app = await createServer()

  await app.listen({ host: HOST, port: PORT })
  console.log(`
  🌸 bloom v0.1.0
  ├─ Server:    http://${HOST}:${PORT}
  ├─ WebSocket: ws://${HOST}:${PORT}/ws
  ├─ Dashboard: http://${HOST}:${PORT}
  └─ Backends:  local codex / gemini / claude CLIs
  `)
}

main().catch(err => {
  console.error('Failed to start bloom:', err)
  process.exit(1)
})
