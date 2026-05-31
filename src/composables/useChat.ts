import { ref } from 'vue'
import type { Ref } from 'vue'
import { streamChat, buildChatDTO } from '../api/chat-stream'
import { uploadFile, uploadImage } from '../api'
import { mapFileType, friendlyError, isImageFile } from '../utils/helpers'
import type { ChatUserMessageDTO } from '../api/types'
import type { ComponentMessage, ComponentAttachment, ComponentToolCall, ToolSectionFragment, TextFragment } from '../types/chat'

export function useChat(
  messageList: Ref<ComponentMessage[]>,
  currentSessionId: Ref<string>,
  selectedModel: Ref<{ id: string; name: string; supportsThinking: boolean; provider: string }>,
  enableRag: Ref<boolean>,
  refreshSessionList: () => Promise<void>,
  scrollToBottom: () => void,
  autoScrollIfNeeded: () => void,
) {
  const inputText = ref('')
  const isAiResponding = ref(false)
  const pendingFiles = ref<File[]>([])
  const abortController = ref<AbortController | null>(null)
  const streamingContent = ref('')
  const streamingThinking = ref('')
  const streamingToolCalls = ref<Map<string, ComponentToolCall>>(new Map())
  const activePlaceholderId = ref<string | null>(null)

  // ========== Fragment helpers (support interleaved text/tool cycles) ==========

  function findLastTextFragment(msg: ComponentMessage): TextFragment | undefined {
    if (!msg.fragments) return undefined
    for (let i = msg.fragments.length - 1; i >= 0; i--) {
      if (msg.fragments[i].kind === 'text') {
        return msg.fragments[i] as TextFragment
      }
    }
    return undefined
  }

  function ensureTextFragmentLast() {
    if (!activePlaceholderId.value) return
    const idx = messageList.value.findIndex(m => m.id === activePlaceholderId.value)
    if (idx === -1) return
    const msg = messageList.value[idx]
    const fragments = msg.fragments || []
    const lastFrag = fragments[fragments.length - 1]
    if (!lastFrag || lastFrag.kind !== 'text') {
      msg.fragments = [...fragments, { kind: 'text', content: '' }]
      messageList.value = [...messageList.value]
    }
  }

  function onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement
    if (!input.files) return
    for (const file of Array.from(input.files)) {
      pendingFiles.value.push(file)
    }
    input.value = ''
  }

  function removePendingFile(index: number) {
    pendingFiles.value.splice(index, 1)
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  function cancelStreaming() {
    if (abortController.value) {
      abortController.value.abort()
    }
  }

  // ========== Streaming helpers ==========
  function updatePlaceholder(updater: (msg: ComponentMessage) => void) {
    if (!activePlaceholderId.value) return
    const idx = messageList.value.findIndex(m => m.id === activePlaceholderId.value)
    if (idx === -1) return
    updater(messageList.value[idx])
    messageList.value = [...messageList.value]
  }

  function finalizeMessage() {
    if (!activePlaceholderId.value) return
    updatePlaceholder((msg) => {
      msg.content = streamingContent.value
      // Sync the last text fragment
      const textFrag = findLastTextFragment(msg)
      if (textFrag) {
        textFrag.content = streamingContent.value
      }
      if (streamingThinking.value) {
        msg.thinking = { content: streamingThinking.value, durationMs: 0, completed: true }
      }
      msg.timestamp = new Date().toISOString()
    })
    streamingContent.value = ''
    streamingThinking.value = ''
    streamingToolCalls.value = new Map()
    activePlaceholderId.value = null
  }

  // ========== Send message ==========
  async function sendMessage() {
    const text = inputText.value.trim()
    if ((!text && pendingFiles.value.length === 0) || isAiResponding.value) return

    isAiResponding.value = true
    abortController.value = new AbortController()

    // --- Upload files first ---
    const uploadedAttachments: ComponentAttachment[] = []
    const fileMessages: ChatUserMessageDTO[] = []

    if (pendingFiles.value.length > 0) {
      try {
        for (const file of pendingFiles.value) {
          let uploaded: { url: string; name: string; size: number; ext: string } | null = null

          if (isImageFile(file)) {
            const url = await uploadImage(file)
            uploaded = { url, name: file.name, size: file.size, ext: file.name.split('.').pop() || '' }
          } else {
            const result = await uploadFile(file)
            if (result.length > 0) {
              const vo = result[0]
              uploaded = { url: vo.fileUrl, name: vo.fileName, size: vo.fileSize, ext: vo.extension }
            }
          }

          if (uploaded) {
            uploadedAttachments.push({
              id: `att-${Date.now()}-${uploadedAttachments.length}`,
              name: uploaded.name,
              url: uploaded.url,
              type: mapFileType(uploaded.ext),
              size: uploaded.size,
              ext: uploaded.ext,
            })
            const msgType = isImageFile(file) ? 'IMAGE' : 'FILE'
            fileMessages.push({
              type: msgType as 'FILE' | 'IMAGE',
              content: uploaded.url,
              metadata: { fileUrl: uploaded.url, fileName: uploaded.name, extension: uploaded.ext },
            })
          }
        }
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : '文件上传失败'
        pendingFiles.value = []
        isAiResponding.value = false
        abortController.value = null
        messageList.value.push({
          id: `msg-${Date.now()}`,
          role: 'user',
          content: text || '(文件)',
          attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
          timestamp: new Date().toISOString(),
        })
        messageList.value.push({
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: '',
          fragments: [{
            kind: 'tools',
            calls: [{
              id: 'upload-error',
              name: '文件上传',
              status: 'error',
              input: '',
              output: friendlyError(errMsg),
            }],
          }],
          timestamp: new Date().toISOString(),
        })
        return
      }
    }

    // --- Push user message ---
    const userMsgId = `msg-${Date.now()}`
    messageList.value.push({
      id: userMsgId,
      role: 'user',
      content: text,
      attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
      timestamp: new Date().toISOString(),
    })
    inputText.value = ''
    pendingFiles.value = []

    scrollToBottom()

    // --- Build ChatDTO (only current message) ---
    const dto = buildChatDTO(
      text,
      fileMessages,
      currentSessionId.value.startsWith('local-') ? undefined : currentSessionId.value,
      selectedModel.value,
      enableRag.value
    )

    // --- Create placeholder AI message ---
    const placeholderId = `ai-${Date.now()}`
    streamingContent.value = ''
    streamingThinking.value = ''
    streamingToolCalls.value = new Map()

    const placeholder: ComponentMessage = {
      id: placeholderId,
      role: 'assistant',
      content: '',
      fragments: [{ kind: 'text', content: '' }],
      timestamp: '',
    }
    messageList.value.push(placeholder)
    activePlaceholderId.value = placeholderId

    scrollToBottom()

    // --- Typewriter (plain text during animation, markdown after finalize) ---
    let typewriterPos = 0
    let typewriterRaf: number | null = null
    let typewriterDone = false
    let fullContent = ''

    let twFrame = 0

    function typewriterTick() {
      try {
        if (typewriterPos < fullContent.length) {
          twFrame++
          const remaining = fullContent.length - typewriterPos
          const step = Math.max(2, Math.ceil(remaining / 80))
          typewriterPos = Math.min(typewriterPos + step, fullContent.length)
          const shown = fullContent.slice(0, typewriterPos)
          streamingContent.value = shown
          autoScrollIfNeeded()
          // Only update placeholder every 4th frame — smooth text with 75% fewer re-renders
          if (twFrame % 4 === 0) {
            updatePlaceholder((msg) => {
              const textFrag = findLastTextFragment(msg)
              if (textFrag) textFrag.content = shown
              msg.content = shown
            })
          }
          typewriterRaf = requestAnimationFrame(typewriterTick)
        } else if (typewriterDone) {
          typewriterRaf = null
          if (activePlaceholderId.value) {
            finalizeMessage()
          }
          refreshSessionList()
        } else {
          typewriterRaf = null
        }
      } catch (e) {
        console.error('[Typewriter]', e)
        typewriterPos = fullContent.length
        streamingContent.value = fullContent
        updatePlaceholder((msg) => {
          const textFrag = findLastTextFragment(msg)
          if (textFrag) textFrag.content = fullContent
          msg.content = fullContent
        })
        if (typewriterDone && activePlaceholderId.value) {
          finalizeMessage()
          refreshSessionList()
        }
        typewriterRaf = null
      }
    }

    function kickTypewriter() {
      if (!typewriterRaf) {
        typewriterRaf = requestAnimationFrame(typewriterTick)
      }
    }

    function finishTypewriter() {
      if (typewriterRaf) { cancelAnimationFrame(typewriterRaf); typewriterRaf = null }
      if (typewriterPos < fullContent.length) {
        typewriterPos = fullContent.length
        streamingContent.value = fullContent
        updatePlaceholder((msg) => {
          const textFrag = findLastTextFragment(msg)
          if (textFrag) textFrag.content = fullContent
          msg.content = fullContent
        })
      }
    }

    // --- Call streamChat ---
    try {
      await streamChat(dto, {
        onTextDelta(content: string) {
          try {
            if (streamingThinking.value) {
              updatePlaceholder((msg) => {
                if (msg.thinking) msg.thinking.completed = true
              })
            }
            ensureTextFragmentLast()
            fullContent += content
            kickTypewriter()
          } catch (e) { console.error('[onTextDelta]', e) }
        },
        onThinking(content: string) {
          try {
            streamingThinking.value += content
            updatePlaceholder((msg) => {
              if (!msg.thinking) {
                msg.thinking = { content: '', durationMs: 0, completed: false }
              }
              msg.thinking.content = streamingThinking.value
              msg.thinking.completed = false
            })
            autoScrollIfNeeded()
          } catch (e) { console.error('[onThinking]', e) }
        },
        onToolCall(tc) {
          try {
            const accumulatedThinking = streamingThinking.value

            // Flush any buffered text before showing the tool fragment
            finishTypewriter()
            const toolCall: ComponentToolCall = {
              id: tc.id,
              name: tc.name,
              status: 'running',
              input: tc.arguments,
            }
            streamingToolCalls.value.set(tc.id, toolCall)

            updatePlaceholder((msg) => {
              const toolFrags = msg.fragments?.filter((f): f is ToolSectionFragment => f.kind === 'tools') || []
              const lastToolsFrag = toolFrags[toolFrags.length - 1]

              let toolsFrag = lastToolsFrag
              if (!toolsFrag || accumulatedThinking) {
                toolsFrag = { kind: 'tools', calls: [] }
                if (accumulatedThinking) {
                  toolsFrag.thinking = { content: accumulatedThinking, durationMs: 0, completed: true }
                }
                msg.fragments = [...(msg.fragments || []), toolsFrag]
              }

              const existing = toolsFrag.calls.find(c => c.id === tc.id)
              if (existing) {
                Object.assign(existing, toolCall)
              } else {
                toolsFrag.calls.push(toolCall)
              }

              if (accumulatedThinking) {
                msg.thinking = undefined
              }
            })

            if (accumulatedThinking) {
              streamingThinking.value = ''
            }

            autoScrollIfNeeded()
          } catch (e) { console.error('[onToolCall]', e) }
        },
        onToolResult(tr) {
          try {
            const existing = streamingToolCalls.value.get(tr.id)
            if (existing) {
              existing.status = tr.isError ? 'error' : 'success'
              existing.output = tr.result
            }
            updatePlaceholder((msg) => {
              const toolsFrag = msg.fragments?.find((f): f is ToolSectionFragment => f.kind === 'tools')
              if (toolsFrag) {
                const tc = toolsFrag.calls.find(c => c.id === tr.id)
                if (tc) {
                  tc.status = tr.isError ? 'error' : 'success'
                  tc.output = tr.result
                }
              }
            })
            autoScrollIfNeeded()
          } catch (e) { console.error('[onToolResult]', e) }
        },
        onSessionId(sid) {
          try {
            localStorage.setItem('currentSessionId', sid)
            if (currentSessionId.value.startsWith('local-')) {
              currentSessionId.value = sid
            }
          } catch (e) { console.error('[onSessionId]', e) }
        },
        onDone(metadata) {
          try {
            if (metadata?.sessionId && currentSessionId.value.startsWith('local-')) {
              currentSessionId.value = String(metadata.sessionId)
              localStorage.setItem('currentSessionId', String(metadata.sessionId))
            }
            finishTypewriter()
            if (activePlaceholderId.value) {
              finalizeMessage()
            }
            refreshSessionList()
          } catch (e) { console.error('[onDone]', e) }
        },
        onError(errMsg) {
          try {
            finishTypewriter()
            updatePlaceholder((msg) => {
              msg.content = streamingContent.value || ''
              if (streamingThinking.value) {
                msg.thinking = { content: streamingThinking.value, durationMs: 0, completed: true }
              }
              const errTool: ComponentToolCall = {
                id: 'stream-error',
                name: '请求失败',
                status: 'error',
                input: '',
                output: friendlyError(errMsg),
              }
              const toolsFrag = msg.fragments?.find((f): f is ToolSectionFragment => f.kind === 'tools')
              if (toolsFrag) {
                toolsFrag.calls.push(errTool)
              } else {
                msg.fragments = [...(msg.fragments || []), { kind: 'tools', calls: [errTool] }]
              }
            })
            streamingContent.value = ''
            streamingThinking.value = ''
            streamingToolCalls.value = new Map()
            activePlaceholderId.value = null
          } catch (e) { console.error('[onError]', e) }
        },
      }, abortController.value.signal)
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        updatePlaceholder((msg) => {
          msg.content = streamingContent.value + '\n\n> ⚠️ 响应已中断'
          if (streamingThinking.value) {
            msg.thinking = { content: streamingThinking.value, durationMs: 0, completed: true }
          }
          msg.timestamp = new Date().toISOString()
        })
        streamingContent.value = ''
        streamingThinking.value = ''
        streamingToolCalls.value = new Map()
        activePlaceholderId.value = null
      } else {
        const msg = err instanceof Error ? err.message : '未知错误'
        updatePlaceholder((msg_) => {
          msg_.content = streamingContent.value || ''
          msg_.timestamp = new Date().toISOString()
          msg_.fragments = [...(msg_.fragments || []), {
            kind: 'tools',
            calls: [{ id: 'error', name: '连接失败', status: 'error', input: '', output: msg }],
          } as ToolSectionFragment]
        })
        streamingContent.value = ''
        streamingThinking.value = ''
        streamingToolCalls.value = new Map()
        activePlaceholderId.value = null
      }
    } finally {
      isAiResponding.value = false
      abortController.value = null
    }
  }

  return {
    inputText,
    isAiResponding,
    pendingFiles,
    streamingContent,
    streamingThinking,
    activePlaceholderId,
    onFileSelected,
    removePendingFile,
    handleKeydown,
    cancelStreaming,
    sendMessage,
  }
}
