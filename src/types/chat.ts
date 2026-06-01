// ========== Component-level Types ==========

export interface ComponentAttachment {
  id: string
  name: string
  url: string
  type: 'image' | 'document' | 'code'
  size: number
  ext: string
}

export interface ComponentThinking {
  content: string
  durationMs: number
  /** Whether thinking has finished (text/tool has started arriving) */
  completed?: boolean
}

export interface ComponentToolCall {
  id: string
  name: string
  status: 'running' | 'success' | 'error'
  input: string
  output?: string
  durationMs?: number
}

export interface TextFragment {
  kind: 'text'
  content: string
}

export interface ToolSectionFragment {
  kind: 'tools'
  calls: ComponentToolCall[]
  /** The thinking content that preceded this set of tool calls (for collapsible grouping) */
  thinking?: ComponentThinking
}

export type Fragment = TextFragment | ToolSectionFragment

export interface ComponentMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: ComponentAttachment[]
  thinking?: ComponentThinking
  fragments?: Fragment[]
  timestamp: string
}

export interface ComponentSession {
  id: string
  title: string
  createdAt: string
}

export interface ModelOption {
  id: string
  name: string
  supportsThinking: boolean
  provider: string
  /** API config ID (if user selected a saved config, else empty = system default) */
  configId?: string
}
