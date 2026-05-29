import type {
  ApiResult,
  SessionVO,
  MessageVO,
  KnowledgeVO,
  MCPServerVO,
} from './types'

const BASE_URL = 'http://localhost:8080'

function getToken(): string | null {
  return localStorage.getItem('token')
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  if (options?.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }

  // Handle raw JSON array responses (like /history/{sessionId})
  const ct = res.headers.get('content-type') || ''
  const text = await res.text()

  // Try to parse the response
  if (text.startsWith('[')) {
    return JSON.parse(text) as T
  }

  const json: ApiResult<T> = JSON.parse(text)
  if (json.code !== 0) {
    throw new Error(json.msg || `API error (code: ${json.code})`)
  }
  return json.data as T
}

// ========== History / Sessions ==========
export async function fetchSessionList(): Promise<SessionVO[]> {
  return request<SessionVO[]>('/history')
}

export async function fetchMessages(sessionId: string): Promise<MessageVO[]> {
  return request<MessageVO[]>(`/history/${sessionId}`)
}

export async function deleteSession(sessionId: string): Promise<void> {
  return request<void>(`/history?sessionId=${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  })
}

// ========== Knowledge Bases ==========
export async function fetchKnowledgeList(): Promise<KnowledgeVO[]> {
  return request<KnowledgeVO[]>('/knowledge/list')
}

// ========== MCP ==========
export async function fetchMCPServerList(): Promise<MCPServerVO[]> {
  return request<MCPServerVO[]>('/mcp')
}

// ========== Models ==========
export async function fetchModelList(baseUrl: string, token: string): Promise<string[]> {
  return request<string[]>(
    `/chat/model?baseUrl=${encodeURIComponent(baseUrl)}&token=${encodeURIComponent(token)}`
  )
}

// ========== Chat (not used yet — SSE streaming placeholder) ==========
export function sendChatStream(): EventSource {
  const token = getToken()
  const url = `${BASE_URL}/chat/stream`
  // SSE via EventSource is read-only; for POST-based SSE we'll need
  // fetch + ReadableStream when implementing. For now, stub.
  throw new Error('Stream chat not yet implemented')
}
