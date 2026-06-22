import { ref, computed, watch } from 'vue'
import { fetchSessionList, fetchMessages, fetchMCPServerList, deleteSession as apiDeleteSession } from '../api'
import { groupMessages } from '../utils/markdown'
import type { SessionVO, KnowledgeVO, MCPServerVO } from '../api/types'
import type { ComponentSession, ComponentMessage } from '../types/chat'

// ========== Module-level singleton state ==========

const sessionList = ref<ComponentSession[]>([])
const currentSessionId = ref<string>('')
const messageList = ref<ComponentMessage[]>([])
const knowledgeBases = ref<KnowledgeVO[]>([])
const mockMCPList = ref<MCPServerVO[]>([])
const loading = ref(true)
const errorMsg = ref('')
const showSessionDeleteConfirm = ref<string | null>(null)

let _readyPromise: Promise<void> = Promise.resolve()
let _loadInProgress: Promise<void> | null = null

const currentSession = computed(() => sessionList.value.find(s => s.id === currentSessionId.value) ?? null)

/** Reset all session state — call on logout to clear old user's data */
function resetSessions() {
  sessionList.value = []
  currentSessionId.value = ''
  messageList.value = []
  knowledgeBases.value = []
  mockMCPList.value = []
  loading.value = true
  errorMsg.value = ''
  showSessionDeleteConfirm.value = null
  _readyPromise = Promise.resolve()
  _loadInProgress = null
}

/** Fetch fresh session list & MCP list from the server (always fetches, no early-return) */
async function reloadSessions() {
  // Dedup: if a reload is already in flight, reuse it
  if (_loadInProgress) return _loadInProgress

  if (!localStorage.getItem('token')) {
    resetSessions()
    loading.value = false
    _readyPromise = Promise.resolve()
    return
  }

  // Clear old data before fetch
  sessionList.value = []
  loading.value = true

  _loadInProgress = _readyPromise = (async () => {
    try {
      const [sessions, mcpList] = await Promise.all([
        fetchSessionList(),
        fetchMCPServerList().catch(() => [] as MCPServerVO[]),
      ])
      sessionList.value = sessions.map(vo => ({
        id: vo.sessionId,
        title: vo.title,
        createdAt: vo.createTime,
      }))
      mockMCPList.value = mcpList
    } catch {
      errorMsg.value = '加载失败'
    } finally {
      loading.value = false
    }
  })()

  await _readyPromise
  _loadInProgress = null
}

/**
 * Wait for the session list to be populated.
 * Handles the race where child onMounted fires before parent onMounted
 * (Vue 3 lifecycle), so AppLayout's reloadSessions may not have started yet.
 */
async function waitForReady(): Promise<void> {
  // Fast path: already loaded
  if (sessionList.value.length > 0) return
  // No token: nothing to load
  if (!localStorage.getItem('token')) return

  // Wait for the current/next load promise
  await _readyPromise

  // Still empty? AppLayout's onMounted (parent) hasn't fired yet.
  // Wait reactively for sessionList to become populated.
  if (sessionList.value.length === 0 && localStorage.getItem('token')) {
    await new Promise<void>((resolve) => {
      const stop = watch(
        [sessionList, loading],
        () => {
          if (sessionList.value.length > 0 || !loading.value) {
            stop()
            resolve()
          }
        },
      )
    })
  }
}

// Auto-init on first module import — ensures fetch starts before any onMounted
const _initPromise = reloadSessions()

export function useSessions() {
  function mapSession(vo: SessionVO): ComponentSession {
    return { id: vo.sessionId, title: vo.title, createdAt: vo.createTime }
  }

  async function loadMessages(sessionId: string): Promise<ComponentMessage[]> {
    try {
      return groupMessages(await fetchMessages(sessionId))
    } catch {
      return []
    }
  }

  async function selectSession(id: string) {
    if (id === currentSessionId.value) return
    currentSessionId.value = id
    messageList.value = await loadMessages(id)
    showSessionDeleteConfirm.value = null
  }

  async function createNewSession() {
    if (currentSessionId.value.startsWith('local-') && messageList.value.length === 0) {
      return
    }
    // Reuse existing empty local session instead of piling up duplicates
    const existingLocal = sessionList.value.find(s => s.id.startsWith('local-'))
    if (existingLocal) {
      currentSessionId.value = existingLocal.id
      messageList.value = []
      return
    }
    const newId = `local-${Date.now()}`
    sessionList.value.unshift({ id: newId, title: '新对话', createdAt: new Date().toISOString() })
    currentSessionId.value = newId
    messageList.value = []
  }

  async function requestDeleteSession(id: string, event: MouseEvent) {
    event.stopPropagation()
    if (showSessionDeleteConfirm.value === id) {
      await confirmDelete(id, event)
    } else {
      showSessionDeleteConfirm.value = id
    }
  }

  async function confirmDelete(id: string, event: MouseEvent) {
    event.stopPropagation()
    const idx = sessionList.value.findIndex(s => s.id === id)
    if (!id.startsWith('local-')) {
      try { await apiDeleteSession(id) } catch { /* ignore */ }
    }
    sessionList.value = sessionList.value.filter(s => s.id !== id)
    showSessionDeleteConfirm.value = null
    if (currentSessionId.value === id) {
      const next = sessionList.value[Math.min(idx, sessionList.value.length - 1)]
      if (next) {
        currentSessionId.value = next.id
        messageList.value = await loadMessages(next.id)
      } else {
        currentSessionId.value = `local-${Date.now()}`
        messageList.value = []
      }
    }
  }

  async function refreshSessionList() {
    try {
      const sessions = await fetchSessionList()
      const mapped = sessions.map(mapSession)

      // ── Mechanism A: preserve sessions still in local- state ─────
      const localSessions = sessionList.value.filter(
        s => String(s.id).startsWith('local-')
      )

      // ── Mechanism B: preserve the current active session even if
      //    it already has a real ID but hasn't been persisted yet
      //    (race: first message streamed, backend not fully committed).
      //    ───────────────────────────────────────────────────────────
      let activeSession: ComponentSession | null = null
      if (
        currentSessionId.value &&
        !String(currentSessionId.value).startsWith('local-')
      ) {
        const inBackend = mapped.some(
          s => String(s.id) === String(currentSessionId.value)
        )
        if (!inBackend) {
          const found = sessionList.value.find(
            s => String(s.id) === String(currentSessionId.value)
          )
          if (found) activeSession = found
        }
      }

      // ── Merge: local sessions + active session + backend list,
      //    deduped by ID (backend list may already contain the
      //    active session if we lost the race the other way).
      const backendIds = new Set(mapped.map(s => String(s.id)))
      const toPreserve: ComponentSession[] = []
      if (activeSession && !backendIds.has(String(activeSession.id))) {
        toPreserve.push(activeSession)
      }

      sessionList.value = [
        ...localSessions,
        ...toPreserve,
        ...mapped,
      ]
    } catch { /* ignore */ }
  }

  return {
    sessionList,
    currentSessionId,
    messageList,
    knowledgeBases,
    mockMCPList,
    loading,
    errorMsg,
    showSessionDeleteConfirm,
    currentSession,
    reloadSessions,
    waitForReady,
    resetSessions,
    loadMessages,
    selectSession,
    createNewSession,
    requestDeleteSession,
    confirmDelete,
    refreshSessionList,
    mapSession,
  }
}
