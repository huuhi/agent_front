import { ref } from 'vue'
import type { Ref } from 'vue'
import { streamChat, buildChatDTO } from '../api/chat-stream'
import { uploadFile } from '../api'
import { mapFileType, friendlyError, isImageFile, validateFiles } from '../utils/helpers'
import type { ChatUserMessageDTO } from '../api/types'
import type { ComponentMessage, ComponentAttachment, ComponentToolCall, ToolSectionFragment, TextFragment, ModelOption } from '../types/chat'

export function useChat(
  messageList: Ref<ComponentMessage[]>,
  currentSessionId: Ref<string>,
  selectedModel: Ref<ModelOption>,
  enableRag: Ref<boolean>,
  enableThinking: Ref<boolean>,
  refreshSessionList: () => Promise<void>,
  scrollToBottom: () => void,
  anchorScroll: () => void,
  selectedMCPIds?: Ref<string[]>,
) {
  const inputText = ref('')
  const isAiResponding = ref(false)
  const abortController = ref<AbortController | null>(null)
  const streamingContent = ref('')
  const streamingThinking = ref('')
  const streamingToolCalls = ref<Map<string, ComponentToolCall>>(new Map())
  const activePlaceholderId = ref<string | null>(null)

  // ========== Immediate file upload on selection ==========
  const uploadedPreviews = ref<ComponentAttachment[]>([])
  const uploadingCount = ref(0)
  const uploadErrors = ref<string[]>([])

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

  async function onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement
    if (!input.files) return
    const files = Array.from(input.files)
    input.value = ''
    const errors = validateFiles(files, uploadedPreviews.value.length)
    if (errors.length > 0) {
      uploadErrors.value = errors
      setTimeout(() => { uploadErrors.value = [] }, 5000)
      return
    }
    for (const file of files) {
      uploadingCount.value++
      try {
        const result = await uploadFile(file)
        if (result.length > 0) {
          const vo = result[0]
          uploadedPreviews.value = [...uploadedPreviews.value, {
            id: String(vo.id),
            name: vo.fileName,
            url: vo.fileUrl,
            type: mapFileType(vo.extension),
            size: vo.fileSize,
            ext: vo.extension,
          }]
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : '上传失败'
        uploadErrors.value = [...uploadErrors.value, `"${file.name}" ${msg}`]
        setTimeout(() => { uploadErrors.value = [] }, 5000)
      } finally {
        uploadingCount.value--
      }
    }
  }

  function removePreview(index: number) {
    uploadedPreviews.value = uploadedPreviews.value.filter((_, i) => i !== index)
  }

  async function handleFilePasted(file: File) {
    const errors = validateFiles([file], uploadedPreviews.value.length)
    if (errors.length > 0) {
      uploadErrors.value = errors
      setTimeout(() => { uploadErrors.value = [] }, 5000)
      return
    }
    uploadingCount.value++
    try {
      const result = await uploadFile(file)
      if (result.length > 0) {
        const vo = result[0]
        uploadedPreviews.value = [...uploadedPreviews.value, {
          id: String(vo.id),
          name: vo.fileName,
          url: vo.fileUrl,
          type: mapFileType(vo.extension),
          size: vo.fileSize,
          ext: vo.extension,
        }]
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '上传失败'
      uploadErrors.value = [`"${file.name}" ${msg}`]
      setTimeout(() => { uploadErrors.value = [] }, 5000)
    } finally {
      uploadingCount.value--
    }
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
  let _pendingPlaceholderUpdate: (() => void) | null = null
  let _placeholderRaf: number | null = null

  function schedulePlaceholderUpdate(updater: (msg: ComponentMessage) => void) {
    if (!activePlaceholderId.value) return
    const idx = messageList.value.findIndex(m => m.id === activePlaceholderId.value)
    if (idx === -1) return
    // Chain updates: compose with any pending update, then schedule a single rAF flush
    const prev = _pendingPlaceholderUpdate
    _pendingPlaceholderUpdate = prev
      ? () => { prev(); updater(messageList.value[idx]); messageList.value = [...messageList.value] }
      : () => { updater(messageList.value[idx]); messageList.value = [...messageList.value] }
    if (!_placeholderRaf) {
      _placeholderRaf = requestAnimationFrame(() => {
        _placeholderRaf = null
        const flush = _pendingPlaceholderUpdate
        _pendingPlaceholderUpdate = null
        flush?.()
        anchorScroll()
      })
    }
  }

  // Legacy: immediate update for structural changes (new message, finalize)
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
    if (_placeholderRaf) { cancelAnimationFrame(_placeholderRaf); _placeholderRaf = null }
    _pendingPlaceholderUpdate = null
    activePlaceholderId.value = null
  }

  // ========== Send message ==========
  async function sendMessage() {
    const text = inputText.value.trim()
    const files = uploadedPreviews.value
    if ((!text && files.length === 0) || isAiResponding.value) return

    isAiResponding.value = true
    abortController.value = new AbortController()

    // --- Build file messages from pre-uploaded files ---
    const fileMessages: ChatUserMessageDTO[] = files.map(att => ({
      type: att.type === 'image' ? 'IMAGE' : 'FILE' as 'FILE' | 'IMAGE',
      content: att.url,
      metadata: { fileUrl: att.url, fileName: att.name, extension: att.ext, id: att.id, fileSize: att.size },
    }))

    const userAttachments = files.length > 0 ? files : undefined

    // --- Push user message ---
    const userMsgId = `msg-${Date.now()}`
    messageList.value.push({
      id: userMsgId,
      role: 'user',
      content: text,
      attachments: userAttachments,
      timestamp: new Date().toISOString(),
    })
    inputText.value = ''
    uploadedPreviews.value = []

    scrollToBottom()

    // --- Build ChatDTO (only current message) ---
    const dto = buildChatDTO(
      text,
      fileMessages,
      currentSessionId.value.startsWith('local-') ? undefined : currentSessionId.value,
      selectedModel.value,
      enableRag.value,
      enableThinking.value,
      undefined,
      selectedMCPIds?.value
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

    // --- Typewriter (time-based buffered output) ---
    // ── Dynamic adaptive speed ──
    // Based on buffer depth (pending chars), choose CPS so the per-frame
    // step matches the user's expectation:
    //   pending <  20 → ~1  char/frame  (60  cps)  near-idle, smooth
    //   pending <  50 → ~3  chars/frame (200 cps)  moderate
    //   pending < 150 → ~8  chars/frame (500 cps)  fast
    //   pending >=150 → ~13 chars/frame (800 cps)  extreme catch-up
    function getAdaptiveCps(pending: number): number {
      if (pending >= 150) return 800
      if (pending >= 50) return 500
      if (pending >= 20) return 200
      return 60
    }

    let fullContent = ''
    let _displayedLength = 0
    let _typewriterRaf: number | null = null
    let _streamDone = false
    let _lastTickTime = 0
    let _timeAccumulator = 0

    function updateDisplayText(shown: string) {
      streamingContent.value = shown
      updatePlaceholder((msg) => {
        const textFrag = findLastTextFragment(msg)
        if (textFrag) textFrag.content = shown
        msg.content = shown
      })
    }

    function typewriterTick(timestamp: number) {
      try {
        if (!_lastTickTime) _lastTickTime = timestamp
        // Cap elapsed to 100ms to prevent huge jumps after tab-away / CPU stall
        const elapsed = Math.min(timestamp - _lastTickTime, 100)
        _lastTickTime = timestamp

        const pending = fullContent.length - _displayedLength
        // Dynamic adaptive speed based on buffer depth
        const cps = getAdaptiveCps(pending)

        _timeAccumulator += (elapsed / 1000) * cps
        let toShow = Math.floor(_timeAccumulator)
        _timeAccumulator -= toShow
        toShow = Math.min(toShow, pending)

        if (toShow > 0) {
          _displayedLength += toShow
          updateDisplayText(fullContent.slice(0, _displayedLength))
          anchorScroll()
        }

        if (_displayedLength < fullContent.length) {
          // More content to reveal → continue the loop
          _typewriterRaf = requestAnimationFrame(typewriterTick)
        } else if (_streamDone) {
          // All content revealed AND stream finished → finalize
          _typewriterRaf = null
          _lastTickTime = 0
          _timeAccumulator = 0
          if (activePlaceholderId.value) finalizeMessage()
          refreshSessionList()
        } else {
          // All revealed but stream still producing → idle (wait for next chunk)
          _typewriterRaf = null
          _lastTickTime = 0
          _timeAccumulator = 0
        }
      } catch (e) {
        console.error('[Typewriter]', e)
        // Fallback: reveal everything immediately
        if (fullContent.length > _displayedLength) {
          _displayedLength = fullContent.length
          updateDisplayText(fullContent)
        }
        _typewriterRaf = null
        if (_streamDone && activePlaceholderId.value) {
          finalizeMessage()
          refreshSessionList()
        }
      }
    }

    function kickTypewriter() {
      if (!_typewriterRaf) {
        _typewriterRaf = requestAnimationFrame(typewriterTick)
      }
    }

    function finishTypewriter() {
      if (_typewriterRaf) {
        cancelAnimationFrame(_typewriterRaf)
        _typewriterRaf = null
      }
      _lastTickTime = 0
      _timeAccumulator = 0
      if (_displayedLength < fullContent.length) {
        _displayedLength = fullContent.length
        updateDisplayText(fullContent)
        anchorScroll()
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
            anchorScroll()
          } catch (e) { console.error('[onThinking]', e) }
        },
        onToolCall(tc) {
          try {
            const accumulatedThinking = streamingThinking.value

            // Flush any buffered text before showing the tool section
            finishTypewriter()

            // Accumulate streaming arguments for the same tool call ID
            const existingCall = streamingToolCalls.value.get(tc.id)
            const mergedInput = existingCall
              ? existingCall.input + tc.arguments
              : tc.arguments

            // Check if this is the FIRST chunk for this tool call (structural change needed)
            const isNewCall = !existingCall

            const toolCall: ComponentToolCall = {
              id: tc.id,
              name: tc.name,
              status: 'running',
              input: mergedInput,
            }
            streamingToolCalls.value.set(tc.id, toolCall)

            if (isNewCall || accumulatedThinking) {
              // Structural change: add new fragment or tool call — update immediately
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
                  existing.input = mergedInput
                } else {
                  toolsFrag.calls.push(toolCall)
                }

                if (accumulatedThinking) {
                  msg.thinking = undefined
                }
              })
            } else {
              // Throttled: only update input text, batched via rAF
              schedulePlaceholderUpdate((msg) => {
                const toolFrags = msg.fragments?.filter((f): f is ToolSectionFragment => f.kind === 'tools') || []
                const lastToolsFrag = toolFrags[toolFrags.length - 1]
                if (lastToolsFrag) {
                  const existing = lastToolsFrag.calls.find(c => c.id === tc.id)
                  if (existing) existing.input = mergedInput
                }
              })
            }

            if (accumulatedThinking) {
              streamingThinking.value = ''
            }

            anchorScroll()
          } catch (e) { console.error('[onToolCall]', e) }
        },
        onToolResult(tr) {
          try {
            // Capture scroll position BEFORE DOM update
            anchorScroll()

            // Update the map's tool call for future lookups
            const mapCall = streamingToolCalls.value.get(tr.id)
            if (mapCall) {
              mapCall.status = tr.isError ? 'error' : 'success'
              mapCall.output = tr.result
            }
            updatePlaceholder((msg) => {
              // Search ALL tool fragments for the matching call ID
              const toolFrags = msg.fragments?.filter((f): f is ToolSectionFragment => f.kind === 'tools') || []
              for (const toolsFrag of toolFrags) {
                const idx = toolsFrag.calls.findIndex(c => c.id === tr.id)
                if (idx !== -1) {
                  // Create new object + new array to force reactivity
                  const updated: ComponentToolCall = {
                    ...toolsFrag.calls[idx],
                    status: tr.isError ? 'error' : 'success',
                    output: tr.result,
                  }
                  const newCalls = [...toolsFrag.calls]
                  newCalls[idx] = updated
                  toolsFrag.calls = newCalls
                  break
                }
              }
            })
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
            // Signal the typewriter that no more chunks are coming.
            // The typewriter tick will drain remaining buffer and finalize.
            _streamDone = true
            // If typewriter is idle (nothing pending), finalize immediately
            if (!_typewriterRaf && _displayedLength >= fullContent.length) {
              if (activePlaceholderId.value) finalizeMessage()
              refreshSessionList()
            }
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
            if (_placeholderRaf) { cancelAnimationFrame(_placeholderRaf); _placeholderRaf = null }
            _pendingPlaceholderUpdate = null
            activePlaceholderId.value = null
          } catch (e) { console.error('[onError]', e) }
        },
      }, abortController.value.signal)
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        finishTypewriter()
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
        if (_placeholderRaf) { cancelAnimationFrame(_placeholderRaf); _placeholderRaf = null }
        _pendingPlaceholderUpdate = null
        activePlaceholderId.value = null
      } else {
        finishTypewriter()
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
    uploadedPreviews,
    uploadingCount,
    uploadErrors,
    onFileSelected,
    handleFilePasted,
    removePreview,
    handleKeydown,
    cancelStreaming,
    sendMessage,
  }
}
