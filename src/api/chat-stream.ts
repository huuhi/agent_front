import type { ChatDTO, ChatUserMessageDTO } from './types'

const BASE_URL = 'http://100.106.145.17:8080'

// ========== Types ==========

export interface StreamToolCall {
  id: string
  name: string
  arguments: string
}

export interface StreamToolResult {
  id: string
  result: string
  isError: boolean
}

export interface StreamCallbacks {
  onTextDelta?: (content: string) => void
  onThinking?: (content: string) => void
  onToolCall?: (call: StreamToolCall) => void
  onToolResult?: (result: StreamToolResult) => void
  onSessionId?: (sessionId: string) => void
  onDone?: (metadata?: Record<string, unknown>) => void
  onError?: (msg: string) => void
}

// ========== Low-level SSE Parser ==========

interface SSEMessage {
  event: string
  data: string
  id?: string
}

function createSSEParser() {
  let buffer = ''
  let currentLines: string[] = []

  function flushEvent(): SSEMessage | null {
    if (currentLines.length === 0) return null

    let event = ''
    let data = ''
    let id: string | undefined
    let hasEventPrefix = false
    let hasDataPrefix = false

    for (const line of currentLines) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim()
        hasEventPrefix = true
      } else if (line.startsWith('data:')) {
        if (data) data += '\n'
        data += line.slice(5)
        hasDataPrefix = true
      } else if (line.startsWith('id:')) {
        id = line.slice(3).trim()
      }
      // ignore comments (lines starting with :)
    }

    // Fallback: if no event:/data: prefixes, treat the whole text as JSON
    if (!hasEventPrefix && !hasDataPrefix) {
      const raw = currentLines.join('\n').trim()
      if (raw.startsWith('{')) {
        try {
          const parsed = JSON.parse(raw)
          // Try to extract event type from 'type' or 'event' field
          event = parsed.type || parsed.event || 'message'
          data = raw
        } catch {
          // Not JSON — treat as text_delta content
          event = 'text_delta'
          data = raw
        }
      } else if (raw) {
        // Plain text line
        event = 'text_delta'
        data = raw
      } else {
        currentLines = []
        return null
      }
    }

    currentLines = []

    if (!event) {
      event = 'message'
    }

    return { event, data, id }
  }

  function processChunk(chunk: string): SSEMessage[] {
    const messages: SSEMessage[] = []
    buffer += chunk

    const parts = buffer.split('\n')
    // Keep the last (potentially incomplete) part in the buffer
    buffer = parts.pop() || ''

    for (const line of parts) {
      if (line.length === 0) {
        // Empty line = end of event
        const msg = flushEvent()
        if (msg) messages.push(msg)
      } else {
        currentLines.push(line)
      }
    }

    return messages
  }

  function flush(): SSEMessage[] {
    const messages: SSEMessage[] = []
    // Process any remaining buffered data
    if (buffer.length > 0) {
      currentLines.push(buffer)
      buffer = ''
    }
    const msg = flushEvent()
    if (msg) messages.push(msg)
    return messages
  }

  return { processChunk, flush }
}

// ========== High-level streamChat ==========

export async function streamChat(
  dto: ChatDTO,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const token = localStorage.getItem('token')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(`${BASE_URL}/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(dto),
      signal,
    })
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return // silent abort
    }
    callbacks.onError?.(err instanceof Error ? err.message : '网络连接失败')
    return
  }

  if (!response.ok) {
    let errorText = ''
    try {
      errorText = await response.text()
      const json = JSON.parse(errorText)
      errorText = json.msg || json.message || errorText
    } catch {
      errorText = `HTTP ${response.status}: ${response.statusText}`
    }
    callbacks.onError?.(errorText)
    return
  }

  const reader = response.body?.getReader()
  if (!reader) {
    callbacks.onError?.('响应体为空')
    return
  }

  const decoder = new TextDecoder('utf-8', { stream: true } as TextDecoderOptions)
  const parser = createSSEParser()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value, { stream: true })
      const messages = parser.processChunk(text)

      for (const msg of messages) {
        dispatchEvent(msg, callbacks)
      }
    }

    // Flush any remaining buffered data
    const remaining = parser.flush()
    for (const msg of remaining) {
      dispatchEvent(msg, callbacks)
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return // silent abort
    }
    callbacks.onError?.(err instanceof Error ? err.message : '读取响应流失败')
  } finally {
    reader.releaseLock()
  }
}

function dispatchEvent(msg: SSEMessage, callbacks: StreamCallbacks) {
  const { event, data } = msg

  // Try to parse data as JSON
  let parsed: Record<string, unknown> | null = null
  try {
    parsed = JSON.parse(data)
  } catch {
    // Not JSON — data is raw text
  }

  // The backend always sends event:message with type discriminator in data.type
  if (parsed && typeof parsed.type === 'string') {
    const dataType = parsed.type as string

    switch (dataType) {
      case 'THINK': {
        const thinking = String(parsed.thinking ?? '')
        if (thinking) callbacks.onThinking?.(thinking)
        return
      }
      case 'CONTENT': {
        const content = String(parsed.content ?? '')
        if (content) callbacks.onTextDelta?.(content)
        return
      }
      case 'TOOL_EXECUTION': {
        const toolList = parsed.toolRequestList
        if (Array.isArray(toolList)) {
          for (const tc of toolList) {
            if (tc && typeof tc === 'object') {
              callbacks.onToolCall?.({
                id: String(tc.id ?? ''),
                name: String(tc.toolName ?? ''),
                arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments ?? ''),
              })
            }
          }
        }
        return
      }
      case 'TOOL_EXECUTION_RESULT': {
        const tr = parsed.toolResultVO
        if (tr && typeof tr === 'object') {
          const r = tr as Record<string, unknown>
          callbacks.onToolResult?.({
            id: String(r.id ?? ''),
            result: String(r.result ?? ''),
            isError: Boolean(r.isError ?? false),
          })
        }
        return
      }
      case 'session_id': {
        const sid = String(parsed.sessionId ?? '')
        if (sid) callbacks.onSessionId?.(sid)
        return
      }
    }
    // If dataType not matched, fall through to event-based dispatch
  }

  // Fallback: dispatch by event name (for non-message events)
  switch (event) {
    case 'text_delta': {
      const content = parsed?.content ?? data
      if (content) callbacks.onTextDelta?.(String(content))
      break
    }
    case 'thinking': {
      const content = parsed?.content ?? data
      if (content) callbacks.onThinking?.(String(content))
      break
    }
    case 'tool_call': {
      if (parsed) {
        callbacks.onToolCall?.({
          id: String(parsed.id ?? ''),
          name: String(parsed.toolName ?? parsed.name ?? ''),
          arguments: typeof parsed.arguments === 'string' ? parsed.arguments : JSON.stringify(parsed.arguments ?? ''),
        })
      }
      break
    }
    case 'tool_result': {
      if (parsed) {
        callbacks.onToolResult?.({
          id: String(parsed.id ?? ''),
          result: String(parsed.result ?? ''),
          isError: Boolean(parsed.isError ?? false),
        })
      }
      break
    }
    case 'session_id': {
      const sid = (parsed?.sessionId ?? data ?? '').toString().trim()
      if (sid) callbacks.onSessionId?.(sid)
      break
    }
    case 'done': {
      callbacks.onDone?.(parsed ?? undefined)
      break
    }
    case 'error': {
      const errMsg = parsed?.message ?? parsed?.content ?? data
      callbacks.onError?.(String(errMsg))
      break
    }
    case 'finish': {
      callbacks.onDone?.()
      break
    }
    default: {
      // For unknown event types, try to dispatch as text_delta
      if (parsed && parsed.content) {
        callbacks.onTextDelta?.(String(parsed.content))
      } else if (!parsed && data.trim()) {
        callbacks.onTextDelta?.(data)
      }
      break
    }
  }
}

// ========== ChatDTO Builder ==========

export function buildChatDTO(
  text: string,
  fileMessages: ChatUserMessageDTO[],
  sessionId: string | undefined,
  model: { id: string; name: string; supportsThinking: boolean; provider: string },
  enableRag: boolean,
  isThinking: boolean,
  existingMessages?: { role: string; content: string; attachments?: { url: string; name: string; size: number; ext: string }[] }[],
  selectedMCPIds?: string[]
): ChatDTO {
  const messages: ChatUserMessageDTO[] = []

  // Include existing message history for context
  if (existingMessages) {
    for (const msg of existingMessages) {
      if (msg.role !== 'user') continue
      if (msg.content) {
        messages.push({ type: 'TEXT', content: msg.content })
      }
      if (msg.attachments) {
        for (const att of msg.attachments) {
          messages.push({
            type: 'FILE',
            content: att.url,
            metadata: { fileName: att.name, fileSize: att.size, extension: att.ext },
          })
        }
      }
    }
  }

  // Append pending file messages
  for (const fm of fileMessages) {
    messages.push(fm)
  }

  // Append text — API requires at least one TEXT message
  if (text) {
    messages.push({ type: 'TEXT', content: text })
  } else if (fileMessages.length > 0) {
    // No text but files attached — send a default text
    messages.push({ type: 'TEXT', content: '请处理这些文件' })
  }

  return {
    messages,
    sessionId,
    enableRag,
    model: {
      id: model.id,
      modelName: model.name,
      isThinking,
    },
    MCPs: selectedMCPIds && selectedMCPIds.length > 0 ? selectedMCPIds.map(Number).filter(n => !isNaN(n)) : undefined,
  }
}
