import { useEffect, useRef, useCallback } from 'react'

export function useWebSocket(onMessage) {
  const wsRef = useRef(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws`)

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        onMessageRef.current(data)
      } catch (e) {
        console.error('WS parse error:', e)
      }
    }

    ws.onclose = () => {
      wsRef.current = null
      // Reconnect after 3s
      setTimeout(connect, 3000)
    }

    ws.onerror = () => ws.close()
    wsRef.current = ws
  }, [])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
    }
  }, [connect])
}
