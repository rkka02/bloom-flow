import { useEffect, useRef, useCallback, useState } from 'react'

export type ServerEvent = {
  type: string
  payload?: any
}

export function useBloomSocket(onEvent: (event: ServerEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const onEventRef = useRef(onEvent)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    function connect() {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${protocol}//${location.host}/ws`)
      wsRef.current = ws

      ws.onopen = () => setConnected(true)
      ws.onclose = () => {
        setConnected(false)
        setTimeout(connect, 2000) // auto-reconnect
      }
      ws.onerror = () => ws.close()
      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data)
          onEventRef.current(event)
        } catch { /* ignore */ }
      }
    }

    connect()
    return () => { wsRef.current?.close() }
  }, []) // intentionally stable — onEvent captured via ref below

  const send = useCallback((event: { type: string; payload?: any }) => {
    wsRef.current?.send(JSON.stringify(event))
  }, [])

  return { connected, send }
}
