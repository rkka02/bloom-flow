import type { WebSocket } from 'ws'
import type { ServerEvent } from '@bloom/shared'

const clients = new Set<WebSocket>()

export function addClient(ws: WebSocket): void {
  clients.add(ws)
  ws.on('close', () => clients.delete(ws))
  ws.on('error', () => clients.delete(ws))
}

export function broadcast(event: ServerEvent): void {
  const data = JSON.stringify(event)
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(data)
    }
  }
}

export function clientCount(): number {
  return clients.size
}
