import { ref, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import type { ComponentSession } from '../types/chat'

const WS_URL = 'ws://localhost:8080/ws/1'
const RECONNECT_DELAY = 3000

export function useTitleWebSocket(sessionList: Ref<ComponentSession[]>) {
  const wsConnected = ref(false)
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

    try {
      ws = new WebSocket(WS_URL)
    } catch {
      scheduleReconnect()
      return
    }

    ws.onopen = () => {
      wsConnected.value = true
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'title' && data.data) {
          const title = String(data.data)
          // Update the first session (most recent) with the new title
          if (sessionList.value.length > 0) {
            const updated = [...sessionList.value]
            updated[0] = { ...updated[0], title }
            sessionList.value = updated
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    ws.onclose = () => {
      wsConnected.value = false
      ws = null
      scheduleReconnect()
    }

    ws.onerror = () => {
      ws?.close()
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, RECONNECT_DELAY)
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws) {
      ws.onclose = null // prevent reconnect
      ws.close()
      ws = null
    }
    wsConnected.value = false
  }

  // Auto-disconnect on unmount
  onUnmounted(disconnect)

  return {
    wsConnected,
    connect,
    disconnect,
  }
}
