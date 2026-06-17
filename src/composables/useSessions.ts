import { ref, computed } from 'vue'
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

const currentSession = computed(() => sessionList.value.find(s => s.id === currentSessionId.value) ?? null)

/** Initialize session list & MCP list at module load — shared by all routes */
async function initSessions() {
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
}

// Kick off immediately when module first imported (singleton)
const initPromise = initSessions()

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
      if (sessions.length > 0) {
        sessionList.value = sessions.map(mapSession)
      }
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
    initPromise,
    loadMessages,
    selectSession,
    createNewSession,
    requestDeleteSession,
    confirmDelete,
    refreshSessionList,
    mapSession,
  }
}
