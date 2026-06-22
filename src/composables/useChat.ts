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
  /** Smart force-scroll — pass a positive duration to follow CSS
   *  transitions (tool output fade-in, grid expand, etc.). */
  forceScroll?: (durationMs?: number) => void,
) {
  const inputText = ref('')
  const isAiResponding = ref(false)
  /** True only during the initial thinking phase (before any text or
   *  tool call arrives).  Becomes permanently false once content or
   *  tool calls start.  Used to show/hide the "thinking…" spinner
   *  independently of the main thinking card. */
  const isMainThinking = ref(false)
  const abortController = ref<AbortController | null>(null)
  const streamingContent = ref('')
  const streamingThinking = ref('')
  const streamingToolCalls = ref<Map<string, ComponentToolCall>>(new Map())
  // ── Thinking typewriter buffer (lives at composable scope so
  //    finalizeMessage can flush it).  Reset at the top of each
  //    sendMessage() call together with streamingThinking. ──
  let _fullThinkingBuffer = ''
  let _displayedThinkingLen = 0
  let _thinkingRaf: number | null = null
  let _typewriterRaf: number | null = null
  let _thinkingTickTime = 0
  let _thinkingAccumulator = 0
  /** Lock: content typewriter must NOT start while this is true.
   *  Set by kickThinkingTypewriter(), cleared by finishThinkingTypewriter()
   *  and by thinkingTick when it drains naturally. */
  let _isThinkingActive = false

  /** ── Text fragment offset for multi-segment (text→tool→text) ──
   *  Records fullContent.length at the moment a NEW text fragment is
   *  created (tool-to-text boundary).  updateDisplayText and
   *  finalizeMessage slice streamingContent by this offset so each
   *  fragment only carries its own segment, preventing duplication. */
  let currentTextFragmentStartOffset = 0

  /** ── Stream state machine ─────────────────────────────────────────
   *  Strict target that tells every writer exactly WHERE to place its
   *  data.  Set on each SSE event boundary and never queried via
   *  dynamic "find last tool fragment" lookups.
   *
   *  Transitions:
   *    onThinking  (no tool frags yet) → MAIN_THINKING
   *    onThinking  (tool frags exist)  → TOOL_THINKING
   *    onTextDelta                       → MAIN_CONTENT
   *    onToolCall  (with accumulated)   → TOOL_THINKING
   *    onToolCall  (without)            → TOOL_INPUT
   */
  type _StreamTarget = 'MAIN_THINKING' | 'MAIN_CONTENT' | 'TOOL_THINKING' | 'TOOL_INPUT'
  let _streamTarget: _StreamTarget = 'MAIN_THINKING'

  /** ── Main thinking completion guard ──────────────────────────────────
   *  Once true, ALL subsequent thinking chunks are FORCED to
   *  TOOL_THINKING and NEVER touch msg.thinking.
   *
   *  Set to true in onTextDelta (first text delta arrives) and
   *  onToolCall (first tool call arrives).
   *  Reset to false at the top of each sendMessage() call. */
  let hasFinishedMainThinking = false

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

  function ensureTextFragmentLast(): boolean {
    if (!activePlaceholderId.value) return false
    const idx = messageList.value.findIndex(m => m.id === activePlaceholderId.value)
    if (idx === -1) return false
    const msg = messageList.value[idx]
    const fragments = msg.fragments || []
    const lastFrag = fragments[fragments.length - 1]
    if (!lastFrag || lastFrag.kind !== 'text') {
      msg.fragments = [...fragments, { kind: 'text', content: '' }]
      messageList.value = [...messageList.value]
      return true
    }
    return false
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
      // Sync the last text fragment — only its local segment, not
      // the accumulated fullContent (prevents multi-segment duplication).
      const textFrag = findLastTextFragment(msg)
      if (textFrag) {
        textFrag.content = streamingContent.value.slice(currentTextFragmentStartOffset)
      }

      // ── Ensure main thinking is permanently marked as completed ──
      // This is unconditional: even if _fullThinkingBuffer was already
      // cleared (e.g. transferred to tool fragments in onToolCall),
      // the thinking card must stay visible with completed=true.
      if (msg.thinking) {
        msg.thinking.completed = true
      }

      if (_fullThinkingBuffer) {
        // Flush any remaining buffered thinking chars
        finishThinkingTypewriter()
        // Route remaining thinking: if tool fragments exist, attach to
        // the last tool fragment; otherwise attach to the main thinking area.
        const toolFrags = msg.fragments?.filter((f): f is ToolSectionFragment => f.kind === 'tools') || []
        if (toolFrags.length > 0) {
          const lastFrag = toolFrags[toolFrags.length - 1]
          if (!lastFrag.thinking) {
            lastFrag.thinking = { content: '', durationMs: 0, completed: true }
          }
          lastFrag.thinking.content = _fullThinkingBuffer
          lastFrag.thinking.completed = true
        } else {
          msg.thinking = { content: _fullThinkingBuffer, durationMs: 0, completed: true }
        }
      }
      msg.timestamp = new Date().toISOString()
    })
    streamingContent.value = ''
    streamingThinking.value = ''
    _fullThinkingBuffer = ''
    _displayedThinkingLen = 0
    streamingToolCalls.value = new Map()
    if (_placeholderRaf) { cancelAnimationFrame(_placeholderRaf); _placeholderRaf = null }
    _pendingPlaceholderUpdate = null
    activePlaceholderId.value = null
  }

  // ── Thinking typewriter (composable-level: used by both sendMessage
  //    and finalizeMessage) ─────────────────────────────────────────
  /** Write thinking content to the currently active target.
   *  No dynamic "find last tool fragment" lookups — the routing
   *  decision was already made when _streamTarget was set. */
  function updateThinkingText(shown: string) {
    streamingThinking.value = shown
    updatePlaceholder((msg) => {
      if (_streamTarget === 'MAIN_THINKING') {
        if (!msg.thinking) {
          msg.thinking = { content: '', durationMs: 0, completed: false }
        }
        msg.thinking.content = shown
        msg.thinking.completed = false
      } else {
        // TOOL_THINKING → write to the LAST tool fragment's thinking
        const toolFrags = msg.fragments?.filter((f): f is ToolSectionFragment => f.kind === 'tools') || []
        const lastFrag = toolFrags[toolFrags.length - 1]
        if (!lastFrag) return  // no tool fragment yet → drop
        if (!lastFrag.thinking) {
          lastFrag.thinking = { content: '', durationMs: 0, completed: false }
        }
        lastFrag.thinking.content = shown
        lastFrag.thinking.completed = false
      }
    })
  }

  function thinkingTick(timestamp: number) {
    try {
      if (!_thinkingTickTime) _thinkingTickTime = timestamp
      const elapsed = Math.min(timestamp - _thinkingTickTime, 100)
      _thinkingTickTime = timestamp

      const pending = _fullThinkingBuffer.length - _displayedThinkingLen
      const cps = 80 // steady chars/sec for gentle reveal
      _thinkingAccumulator += (elapsed / 1000) * cps
      let toShow = Math.floor(_thinkingAccumulator)
      _thinkingAccumulator -= toShow
      toShow = Math.min(toShow, pending)

      if (toShow > 0) {
        _displayedThinkingLen += toShow
        updateThinkingText(_fullThinkingBuffer.slice(0, _displayedThinkingLen))
        anchorScroll()
      }

      if (_displayedThinkingLen < _fullThinkingBuffer.length) {
        _thinkingRaf = requestAnimationFrame(thinkingTick)
      } else {
        // Natural drain complete — release the content-typewriter lock
        _thinkingRaf = null
        _thinkingTickTime = 0
        _thinkingAccumulator = 0
        _isThinkingActive = false
      }
    } catch (e) {
      console.error('[ThinkingTypewriter]', e)
      if (_fullThinkingBuffer.length > _displayedThinkingLen) {
        _displayedThinkingLen = _fullThinkingBuffer.length
        updateThinkingText(_fullThinkingBuffer)
      }
      _thinkingRaf = null
    }
  }

  function kickThinkingTypewriter() {
    _isThinkingActive = true
    if (!_thinkingRaf) {
      _thinkingRaf = requestAnimationFrame(thinkingTick)
    }
  }

  function finishThinkingTypewriter() {
    if (_thinkingRaf) {
      cancelAnimationFrame(_thinkingRaf)
      _thinkingRaf = null
    }
    _thinkingTickTime = 0
    _thinkingAccumulator = 0
    if (_displayedThinkingLen < _fullThinkingBuffer.length) {
      _displayedThinkingLen = _fullThinkingBuffer.length
      updateThinkingText(_fullThinkingBuffer)
      anchorScroll()
    }
    _isThinkingActive = false
  }

  /** ── Clear ALL typewriter animation frame handles ─────────────────
   *  Must be called when the component unmounts or the user switches
   *  sessions while a stream is still active.  Cancels both the
   *  thinking typewriter and the content typewriter rAF loops, and
   *  resets all associated counters to prevent stale closure access
   *  to destroyed DOM nodes. */
  function clearAllTypewriterTimers() {
    if (_thinkingRaf !== null) {
      cancelAnimationFrame(_thinkingRaf)
      _thinkingRaf = null
    }
    if (_typewriterRaf !== null) {
      cancelAnimationFrame(_typewriterRaf)
      _typewriterRaf = null
    }
    _thinkingTickTime = 0
    _thinkingAccumulator = 0
    _displayedThinkingLen = 0
    _isThinkingActive = false
  }

  // ========== Send message ==========
  async function sendMessage() {
    const text = inputText.value.trim()
    const files = uploadedPreviews.value
    if ((!text && files.length === 0) || isAiResponding.value) return

    isAiResponding.value = true
    isMainThinking.value = true
    hasFinishedMainThinking = false
    currentTextFragmentStartOffset = 0
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
    let _streamDone = false
    let _lastTickTime = 0
    let _timeAccumulator = 0

    function updateDisplayText(shown: string) {
      streamingContent.value = shown
      updatePlaceholder((msg) => {
        const textFrag = findLastTextFragment(msg)
        if (textFrag) textFrag.content = shown.slice(currentTextFragmentStartOffset)
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
      // ── Playback lock ──
      // Content must NOT start playing while the thinking typewriter is
      // still revealing characters.  The lock is released by either
      // finishThinkingTypewriter() (flush) or thinkingTick draining
      // its buffer naturally.
      if (_isThinkingActive) return
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
            // First content → main thinking phase is over
            if (isMainThinking.value) isMainThinking.value = false
            hasFinishedMainThinking = true

            // ── Flush thinking typewriter NOW ──────────────────────
            // Any remaining buffered thinking chars must be revealed
            // instantly before we switch to MAIN_CONTENT.
            finishThinkingTypewriter()

            // ── Mark main thinking & tool fragments as completed ───
            // Unconditionally: even if _fullThinkingBuffer has already
            // been fully displayed, the completed flag ensures the
            // thinking card stays visible as a "completed" block.
            updatePlaceholder((msg) => {
              if (msg.thinking) msg.thinking.completed = true
              const toolFrags = msg.fragments?.filter((f): f is ToolSectionFragment => f.kind === 'tools') || []
              for (const f of toolFrags) {
                if (f.thinking) f.thinking.completed = true
              }
            })

            // ── State machine: switch to MAIN_CONTENT ──────────────
            _streamTarget = 'MAIN_CONTENT'

            // If a new text fragment was created (tool-to-text boundary),
            // record the offset so updateDisplayText only writes the
            // current segment's content to this fragment.
            if (ensureTextFragmentLast()) {
              currentTextFragmentStartOffset = fullContent.length
            }
            fullContent += content
            // Lock was released by finishThinkingTypewriter() — safe to play
            kickTypewriter()
          } catch (e) { console.error('[onTextDelta]', e) }
        },
        onThinking(content: string) {
          try {
            _fullThinkingBuffer += content

            // ── State machine: determine target ──
            // If main thinking has already finished (text or tool call
            // already arrived), this is ALWAYS tool step-thinking,
            // NEVER main thinking.
            if (hasFinishedMainThinking) {
              _streamTarget = 'TOOL_THINKING'
            } else {
              const hasToolFrags = _streamTarget === 'TOOL_INPUT' ||
                _streamTarget === 'TOOL_THINKING'
              _streamTarget = hasToolFrags ? 'TOOL_THINKING' : 'MAIN_THINKING'
            }

            // Ensure the display slot exists so the card renders.
            updatePlaceholder((msg) => {
              if (_streamTarget === 'MAIN_THINKING' && !msg.thinking) {
                msg.thinking = { content: '', durationMs: 0, completed: false }
              }
            })
            kickThinkingTypewriter()
          } catch (e) { console.error('[onThinking]', e) }
        },
        onToolCall(tc) {
          try {
            // First tool call → main thinking phase is over.
            // Subsequent step-thinking belongs in tool fragments.
            if (isMainThinking.value) isMainThinking.value = false
            hasFinishedMainThinking = true

            // ── Mark main thinking as completed BEFORE transfer ───
            // We are about to copy the thinking to a tool fragment;
            // the main thinking card must be marked completed so it
            // never disappears when the stream ends.
            updatePlaceholder((msg) => {
              if (msg.thinking) msg.thinking.completed = true
            })

            // Flush the thinking typewriter so all pre-tool thinking
            // is fully revealed before we move it to the fragment.
            finishThinkingTypewriter()
            const accumulatedThinking = _fullThinkingBuffer

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

                // ⚠️  CRITICAL: we do NOT clear msg.thinking here.
                // The accumulated pre-tool thinking stays on the main
                // thinking block so it is never lost after streaming
                // ends.  The tool fragment carries a copy in
                // frag.thinking for in-card display.
                // msg.thinking.completed was already set to true above.
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
              _fullThinkingBuffer = ''
              _displayedThinkingLen = 0
            }

            // ── State machine: tool mode activated ─────────────────
            // From this point onward, any thinking chunks belong in
            // the tool fragment (TOOL_THINKING), not the main area.
            _streamTarget = 'TOOL_INPUT'

            anchorScroll()
          } catch (e) { console.error('[onToolCall]', e) }
        },
        onToolResult(tr) {
          try {
            // ── Smart scroll: track the CSS transition ─────────────
            // If the user is at the bottom, a timed RAF burst follows
            // the ~300ms tool-output fade-in so the viewport stays
            // locked to the expanding content.  If the user scrolled
            // away, forceScroll(400) is a no-op (guarded by
            // isLockedToBottom inside useAutoScroll).
            forceScroll?.(400)
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
            finishThinkingTypewriter()
            updatePlaceholder((msg) => {
              msg.content = streamingContent.value || ''
              if (_fullThinkingBuffer) {
                msg.thinking = { content: _fullThinkingBuffer, durationMs: 0, completed: true }
              } else if (msg.thinking) {
                msg.thinking.completed = true
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
        finishThinkingTypewriter()
        updatePlaceholder((msg) => {
          msg.content = streamingContent.value + '\n\n> ⚠️ 响应已中断'
          if (_fullThinkingBuffer) {
            msg.thinking = { content: _fullThinkingBuffer, durationMs: 0, completed: true }
          } else if (msg.thinking) {
            msg.thinking.completed = true
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
        finishThinkingTypewriter()
        const msg = err instanceof Error ? err.message : '未知错误'
        updatePlaceholder((msg_) => {
          msg_.content = streamingContent.value || ''
          if (msg_.thinking) msg_.thinking.completed = true
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
      isMainThinking.value = false
      abortController.value = null
    }
  }

  return {
    inputText,
    isAiResponding,
    isMainThinking,
    uploadedPreviews,
    uploadingCount,
    uploadErrors,
    onFileSelected,
    handleFilePasted,
    removePreview,
    handleKeydown,
    cancelStreaming,
    sendMessage,
    clearAllTypewriterTimers,
  }
}
