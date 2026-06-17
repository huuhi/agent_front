// ========== API Unified Response ==========
export interface ApiResult<T> {
  code: number
  msg: string
  data: T | null
  total: number | null
}

// ========== Session / History ==========
export interface SessionVO {
  sessionId: string
  userId: number
  title: string
  createTime: string
  updateTime: string
}

export interface AttachedFileVO {
  id: string | number
  fileName: string
  fileUrl: string
  fileSize: number
  extension: string
  failReason?: string
  uploadStatus?: string
  createTime?: string | null
  bizType?: string
}

export interface ToolRequestVO {
  id: string
  toolName: string
  arguments: string
}

export interface ToolResultVO {
  id: string
  toolName: string
  result: string
  isError: boolean
}

export type MessageType = 'USER' | 'AI' | 'TOOL_EXECUTION_RESULT' | null

export interface MessageVO {
  type: MessageType
  content: string | null
  thinking: string | null
  attachedFiles: AttachedFileVO[] | null
  toolResultVO: ToolResultVO | null
  toolRequestList: ToolRequestVO[] | null
}

// ========== Knowledge ==========
export interface KnowledgeVO {
  id: number
  userId: number
  name: string
  describe: string
  isPublic: boolean
  languageCode: string | null
}

// ========== MCP ==========
export interface MCPServerVO {
  id: string
  strId: string | null
  url: string
  description: string
  name: string
  logoUrl: string
  type: string
  available: boolean
}

// ========== Model ==========
export interface ModelDTO {
  id: string
  modelName: string
  isThinking: boolean
}

// ========== User API Config ==========
export interface UserApiConfigVO {
  id?: string
  name: string | null
  baseUrl: string
  model: string[]
  isDefault: boolean
  /** GET 响应是 apikey (小写)，POST 请求要用 APIKey (大写 AK) */
  apikey: string
}

// ========== Chat ==========
export interface ChatUserMessageDTO {
  type: 'TEXT' | 'FILE' | 'IMAGE'
  content: string
  metadata?: Record<string, unknown>
}

export interface ChatDTO {
  messages: ChatUserMessageDTO[]
  sessionId?: string
  skills?: string[]
  MCPs?: number[]
  model?: ModelDTO
  enableRag?: boolean
}

// ========== Knowledge Detail (with file list) ==========
export interface KnowledgeBaseFileItem {
  id: number
  fileUrl: string
  fileName: string
  fileSize: number
  failReason: string
  uploadStatus: string
  createTime: string
  bizType: string
  extension: string
}

export interface KnowledgeDetailVO extends KnowledgeVO {
  knowledgeBaseFileList: KnowledgeBaseFileItem[]
}

// ========== Knowledge file association DTO ==========
export interface KnowledgeFileDTO {
  fileIds: number[]
  knowledgeId: number
}

// ========== Knowledge creation DTO ==========
export interface KnowledgeCreateDTO {
  name: string
  describe?: string
  isPublic?: boolean
  languageCode?: string | null
}

// ========== MCP Server Item DTO (for add/update) ==========
export interface McpServerItemDTO {
  id?: number
  strId?: string
  url?: string
  description?: string
  name?: string
  logoUrl?: string
  type?: string
  header?: Record<string, unknown>
  available?: boolean
}
