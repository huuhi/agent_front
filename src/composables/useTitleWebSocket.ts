import { ref, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import type { ComponentSession } from '../types/chat'
import { getUserId } from '../utils/jwt'

/**
 * Build the WebSocket URL using the authenticated user's ID from JWT.
 * Falls back to '0' if token is missing (the server will reject anyway).
 */
function buildWsUrl(): string {
  const uid = getUserId() || '0'
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/ws/${uid}`
}

const RECONNECT_DELAY = 3000

export function useTitleWebSocket(
  sessionList: Ref<ComponentSession[]>,
  /** Current session ID — used to precisely locate the session to update
   *  when a title arrives, instead of blindly writing to sessionList[0]. */
  currentSessionId: Ref<string>,
) {
  const wsConnected = ref(false)
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

    const url = buildWsUrl()

    try {
      ws = new WebSocket(url)
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
          // ── Precise ID-based lookup ────────────────────────────
          // NEVER fall back to sessionList[0] — that would overwrite
          // an unrelated session when the real target is missing.
          const target = sessionList.value.find(
            s => String(s.id) === String(currentSessionId.value)
          )
          if (target) {
            target.title = title
            // Trigger reactivity by replacing the array reference
            sessionList.value = [...sessionList.value]
          }
          // If no matching session found, silently ignore — the
          // session list will catch up on next refreshSessionList().
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

  onUnmounted(disconnect)

  return {
    wsConnected,
    connect,
    disconnect,
  }
}
