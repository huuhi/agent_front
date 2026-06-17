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
} from './types'

const BASE_URL = 'http://106.52.234.62:8989'

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
  return request<UserApiConfigVO[]>('/user/api-config')
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

// ========== File Upload ==========
export async function uploadFile(file: File): Promise<AttachedFileVO[]> {
  const token = getToken()
  const formData = new FormData()
  formData.append('files', file)

  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}/file?bizType=CHAT`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }

  const text = await res.text()
  const json: ApiResult<AttachedFileVO[]> = JSON.parse(text)
  if (json.code !== 0) {
    throw new Error(json.msg || '文件上传失败')
  }
  return json.data ?? []
}

export async function uploadImage(file: File): Promise<string> {
  const token = getToken()
  const formData = new FormData()
  formData.append('file', file)

  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}/file/image`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }

  const text = await res.text()
  const json: ApiResult<string> = JSON.parse(text)
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
export async function fetchKnowledgeDetail(id: number): Promise<KnowledgeDetailVO> {
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
  const token = getToken()
  const formData = new FormData()
  formData.append('files', file)

  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}/file?bizType=KNOWLEDGE`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }

  const text = await res.text()
  const json: ApiResult<AttachedFileVO[]> = JSON.parse(text)
  if (json.code !== 0) {
    throw new Error(json.msg || '文件上传失败')
  }
  return json.data ?? []
}
