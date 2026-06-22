import type {
  ApiResult,
  SessionVO,
  MessageVO,
  KnowledgeVO,
  KnowledgeDetailVO,
  KnowledgeFileDTO,
  KnowledgeCreateDTO,
  MCPServerVO,
  AttachedFileVO,
  UserApiConfigVO,
  McpServerItemDTO,
  UserLoginDTO,
  UserRegisterDTO,
  UserPasswordDTO,
  UserMemoryVO,
} from './types'

const BASE_URL = '/api'

function getToken(): string | null {
  return localStorage.getItem('token')
}

/**
 * Central header builder — injects auth token into every request.
 */
function buildHeaders(options?: RequestInit, skipAuth = false): Record<string, string> {
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  }
  const token = getToken()
  if (token && !skipAuth) {
    headers['token'] = token
  }
  if (options?.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json'
  }
  return headers
}

/**
 * JSON.parse wrapper that quotes large integers (>15 digits) to prevent
 * JavaScript Number precision loss (Number.MAX_SAFE_INTEGER = 9e15).
 * Backend IDs like 2045045522137423874 (~2e18) round to 2045045522137424000 otherwise.
 */
function safeParse<T>(text: string): T {
  const safe = text.replace(/([:\s\[,])\s*(\d{16,})\s*([,\]\}\s])/g, '$1"$2"$3')
  return JSON.parse(safe) as T
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const isAuthPath = ['/user/login', '/user/register', '/user/password', '/common/email'].some(
    p => path.startsWith(p)
  )

  const headers = buildHeaders(options, isAuthPath)

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  // Handle 401 on non-auth paths → token expired, force re-login
  if (res.status === 401 && !isAuthPath) {
    localStorage.removeItem('token')
    localStorage.removeItem('currentSessionId')
    localStorage.removeItem('selectedConfigId')
    localStorage.removeItem('selectedModelName')
    localStorage.removeItem('selectedKnowledgeBase')
    localStorage.removeItem('selectedMCPIds')
    if (window.location.pathname !== '/auth') {
      window.location.href = '/auth'
    }
    throw new Error('登录已过期，请重新登录')
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }

  const text = await res.text()
  const parsed = safeParse<ApiResult<T> | T>(text)
  // Raw JSON array (starts with `[`) — return as-is
  if (text.startsWith('[')) {
    return parsed as T
  }
  const json = parsed as ApiResult<T>

  // Business-level NOT_LOGIN on non-auth paths → force re-login
  if (json.code !== 0) {
    if (!isAuthPath && json.msg === 'NOT_LOGIN') {
      localStorage.removeItem('token')
      localStorage.removeItem('currentSessionId')
      localStorage.removeItem('selectedConfigId')
      localStorage.removeItem('selectedModelName')
      localStorage.removeItem('selectedKnowledgeBase')
      localStorage.removeItem('selectedMCPIds')
      if (window.location.pathname !== '/auth') {
        window.location.href = '/auth'
      }
      throw new Error('登录已过期，请重新登录')
    }
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

// ========== MCP ==========
/** GET /mcp — 获取用户的MCP列表 */
export async function fetchMCPServerList(): Promise<MCPServerVO[]> {
  return request<MCPServerVO[]>('/mcp')
}

/** POST /mcp — 添加MCP服务器（传数组） */
export async function addMCPServer(data: McpServerItemDTO): Promise<void> {
  await request<void>('/mcp', {
    method: 'POST',
    body: JSON.stringify([data]),
  })
}

/** POST /mcp — 批量添加MCP服务器 */
export async function batchAddMCPServer(dataList: McpServerItemDTO[]): Promise<void> {
  await request<void>('/mcp', {
    method: 'POST',
    body: JSON.stringify(dataList),
  })
}

/** PUT /mcp — 更新MCP服务器 */
export async function updateMCPServer(data: McpServerItemDTO): Promise<void> {
  await request<void>('/mcp', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

/** GET /mcp/{id} — 获取MCP服务器详情 */
export async function fetchMCPServerDetail(id: number): Promise<MCPServerVO> {
  return request<MCPServerVO>(`/mcp/${id}`)
}

/** GET /mcp/service — 从服务商获取MCP服务 */
export async function fetchMCPServerFromService(): Promise<unknown> {
  return request<unknown>('/mcp/service')
}

/** DELETE /mcp/{id} — 删除MCP服务器 */
export async function deleteMCPServer(id: number): Promise<void> {
  await request<void>(`/mcp/${id}`, { method: 'DELETE' })
}

// ========== Models ==========
export async function fetchModelList(baseUrl: string, token: string): Promise<string[]> {
  return request<string[]>(
    `/chat/model?baseUrl=${encodeURIComponent(baseUrl)}&token=${encodeURIComponent(token)}`
  )
}

// ========== User API Config ==========
export async function fetchUserApiConfigs(): Promise<UserApiConfigVO[]> {
  const raw = await request<any[]>('/user/api-config')
  // Backend returns model items as JSON strings; parse them into objects
  return (raw || []).map(item => ({
    ...item,
    model: (item.model || []).map((m: string) => {
      if (typeof m === 'string') {
        try { return JSON.parse(m) } catch { return { name: m, type: 'CHAT' as const } }
      }
      return m
    }),
  }))
}

export async function saveUserApiConfig(config: Partial<UserApiConfigVO> & { baseUrl: string; apikey: string }): Promise<UserApiConfigVO> {
  // 后端 POST 要求字段名是 APIKey (大写 AK)
  const body = { ...config, APIKey: config.apikey }
  delete (body as any).apikey
  return request<UserApiConfigVO>('/user/api-config', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// ========== Auth ==========

/** POST /common/email — 发送邮箱验证码 */
export async function sendEmailCode(email: string): Promise<void> {
  await request<void>(`/common/email?email=${encodeURIComponent(email)}`, {
    method: 'POST',
  })
}

/** POST /user/login — 登录（验证码或密码） */
export async function login(data: UserLoginDTO): Promise<string> {
  return request<string>('/user/login', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/** POST /user/register — 注册 */
export async function register(data: UserRegisterDTO): Promise<string> {
  return request<string>('/user/register', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/** PUT /user/password — 设置密码 */
export async function setPassword(data: UserPasswordDTO): Promise<void> {
  await request<void>('/user/password', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// ========== User Memory ==========

/** GET /user/user_memory?key= — 获取长期记忆列表 */
export async function fetchUserMemories(key?: string): Promise<UserMemoryVO[]> {
  const params = new URLSearchParams()
  if (key) params.set('key', key)
  return request<UserMemoryVO[]>(`/user/user-memory?${params.toString()}`)
}

/** DELETE /user/user-memory/{id} — 删除一条记忆 */
export async function deleteUserMemory(id: string | number): Promise<void> {
  await request<void>(`/user/user-memory/${id}`, { method: 'DELETE' })
}

// ========== File Upload ==========
export async function uploadFile(file: File): Promise<AttachedFileVO[]> {
  const formData = new FormData()
  formData.append('files', file)

  const res = await fetch(`${BASE_URL}/file?bizType=CHAT`, {
    method: 'POST',
    headers: buildHeaders(),
    body: formData,
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }

  const text = await res.text()
  const json = safeParse<ApiResult<AttachedFileVO[]>>(text)
  if (json.code !== 0) {
    throw new Error(json.msg || '文件上传失败')
  }
  return json.data ?? []
}

export async function uploadImage(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(`${BASE_URL}/file/image`, {
    method: 'POST',
    headers: buildHeaders(),
    body: formData,
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }

  const text = await res.text()
  const json = safeParse<ApiResult<string>>(text)
  if (json.code !== 0) {
    throw new Error(json.msg || '图片上传失败')
  }
  return json.data ?? ''
}

// ========== MCP Config ==========
/** GET /user/mcp-config — 获取当前 MCP API Key（脱敏显示） */
export async function fetchMCPConfig(): Promise<string> {
  const data = await request<string>('/user/mcp-config')
  return data ?? ''
}

/** POST /user/mcp-config?token=... — 设置 MCP API Key */
export async function saveMCPConfig(token: string): Promise<void> {
  await request<void>(`/user/mcp-config?token=${encodeURIComponent(token)}`, {
    method: 'POST',
  })
}

// ========== Knowledge ==========

/** GET /knowledge/list — 获取当前用户知识库列表 */
export async function fetchKnowledgeList(): Promise<KnowledgeVO[]> {
  return request<KnowledgeVO[]>('/knowledge/list')
}

/** GET /knowledge/{id} — 知识库详情，包括文件列表 */
export async function fetchKnowledgeDetail(id: string | number): Promise<KnowledgeDetailVO> {
  return request<KnowledgeDetailVO>(`/knowledge/${id}`)
}

/** POST /knowledge — 创建知识库 */
export async function createKnowledge(data: KnowledgeCreateDTO): Promise<void> {
  await request<void>('/knowledge', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/** POST /knowledge/file — 将文件上传到指定知识库 */
export async function uploadKnowledgeFile(data: KnowledgeFileDTO): Promise<void> {
  await request<void>('/knowledge/file', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// ========== User Files ==========

/** GET /file — 获取用户文件列表 */
export async function fetchUserFiles(fileName?: string, bizType?: string): Promise<AttachedFileVO[]> {
  const params = new URLSearchParams()
  // backend requires fileName — pass empty string for "all"
  params.set('fileName', fileName ?? '')
  if (bizType) params.set('bizType', bizType)
  return request<AttachedFileVO[]>(`/file?${params.toString()}`)
}

/** POST /file?bizType=KNOWLEDGE — 上传文件到知识库 */
export async function uploadKnowledgeFileBinary(file: File): Promise<AttachedFileVO[]> {
  const formData = new FormData()
  formData.append('files', file)

  const res = await fetch(`${BASE_URL}/file?bizType=KNOWLEDGE`, {
    method: 'POST',
    headers: buildHeaders(),
    body: formData,
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }

  const text = await res.text()
  const json = safeParse<ApiResult<AttachedFileVO[]>>(text)
  if (json.code !== 0) {
    throw new Error(json.msg || '文件上传失败')
  }
  return json.data ?? []
}
