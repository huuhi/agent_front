<script setup lang="ts">
import { onMounted } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'
import {
  fetchSessionList,
  fetchKnowledgeList,
  fetchMCPServerList,
} from './api'
import {
  renderMarkdown,
  setupCodeCopy,
  groupMessages,
} from './utils/markdown'
import { mapFileType } from './utils/helpers'
import { useAutoScroll } from './composables/useAutoScroll'
import { useSessions } from './composables/useSessions'
import { useChat } from './composables/useChat'
import { useTitleWebSocket } from './composables/useTitleWebSocket'
import Sidebar from './components/Sidebar.vue'
import MessageBubble from './components/MessageBubble.vue'
import ChatInput from './components/ChatInput.vue'
import MCPDrawer from './components/MCPDrawer.vue'
import APIConfigModal from './components/APIConfigModal.vue'
import type { ModelOption } from './types/chat'

// ========== Markdown renderer (must be configured before use) ==========
marked.use({
  renderer: {
    code({ text, lang }) {
      const language = lang || ''
      const validLang = language && hljs.getLanguage(language)
      const highlighted = validLang
        ? hljs.highlight(text, { language }).value
        : hljs.highlightAuto(text).value
      return `<div class="code-block-wrapper">
<pre><code class="hljs language-${language}">${highlighted}</code></pre>
<button class="code-copy-btn" title="复制代码">
<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
</button>
</div>`
    },
  },
})

// ========== Composables ==========
const {
  messageContainerRef,
  showScrollButton,
  scrollToBottom,
  autoScrollIfNeeded,
  handleScroll,
} = useAutoScroll()

const {
  sessionList,
  currentSessionId,
  messageList,
  knowledgeBases,
  mockMCPList,
  loading,
  errorMsg,
  showSessionDeleteConfirm,
  currentSession,
  loadMessages,
  selectSession,
  createNewSession,
  requestDeleteSession,
  confirmDelete,
  refreshSessionList,
  mapSession,
} = useSessions()

// State that useChat needs access to (to handle session updates)
import { ref, nextTick } from 'vue'
const selectedModel = ref<ModelOption>({ id: '', name: 'DeepSeek V4 Flash', supportsThinking: true, provider: 'DeepSeek' })
const selectedKnowledgeBase = ref<{ id: number | string; name: string; documentCount: number } | null>(null)
const enableRag = ref(true)
const showModelSelector = ref(false)
const showKnowledgeBaseSelector = ref(false)
const showMCPDrawer = ref(false)
const showAPIConfigModal = ref(false)
const expandedThinking = ref<Set<string>>(new Set())
const showAllAttachments = ref<Set<string>>(new Set())
const expandedSteps = ref<Set<string>>(new Set())
const toolChainState = ref<0 | 1 | 2>(Number(localStorage.getItem('toolChainState') || '0') as 0 | 1 | 2)

const {
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
} = useChat(
  messageList,
  currentSessionId,
  selectedModel,
  enableRag,
  refreshSessionList,
  scrollToBottom,
  autoScrollIfNeeded,
)

const { wsConnected, connect: connectTitleWs } = useTitleWebSocket(sessionList)

// ========== Actions ==========
function selectModel(model: ModelOption) {
  selectedModel.value = model
  showModelSelector.value = false
}

function selectKnowledgeBase(kb: typeof knowledgeBases.value[0] | null) {
  selectedKnowledgeBase.value = kb ? { id: kb.id, name: kb.name, documentCount: 0 } : null
  showKnowledgeBaseSelector.value = false
}

function toggleRag() { enableRag.value = !enableRag.value }

async function handleSelectSession(id: string) {
  await selectSession(id)
  await nextTick()
  scrollToBottom()
}

async function handleCreateNewSession() {
  await createNewSession()
  await nextTick()
  scrollToBottom()
}

function toggleThinking(id: string) {
  const s = new Set(expandedThinking.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedThinking.value = s
}

function toggleAttachments(id: string) {
  const s = new Set(showAllAttachments.value)
  s.has(id) ? s.delete(id) : s.add(id)
  showAllAttachments.value = s
}

function toggleToolStep(id: string) {
  const s = new Set(expandedSteps.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedSteps.value = s
}

function toggleToolChain() {
  toolChainState.value = ((toolChainState.value + 1) % 3) as 0 | 1 | 2
  localStorage.setItem('toolChainState', String(toolChainState.value))
}

function setToken(token: string) {
  localStorage.setItem('token', token)
}

// @ts-expect-error expose for dev console
window.__setToken = setToken

// ========== Lifecycle ==========
onMounted(async () => {
  setupCodeCopy()
  connectTitleWs()

  try {
    const [sessions, knowledgeList, mcpList] = await Promise.all([
      fetchSessionList(),
      fetchKnowledgeList().catch(() => []),
      fetchMCPServerList().catch(() => []),
    ])
    sessionList.value = sessions.map(mapSession)
    knowledgeBases.value = knowledgeList
    mockMCPList.value = mcpList
    if (sessions.length > 0) {
      const cachedId = localStorage.getItem('currentSessionId')
      const targetId = cachedId && sessions.some(s => s.sessionId === cachedId)
        ? cachedId
        : sessions[0].sessionId
      currentSessionId.value = targetId
      messageList.value = await loadMessages(targetId)
      await nextTick()
      scrollToBottom()
    }
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="flex h-screen bg-slate-50 text-gray-900 font-sans antialiased">
    <Sidebar
      :sessions="sessionList"
      :currentSessionId="currentSessionId"
      :loading="loading"
      :errorMsg="errorMsg"
      :showSessionDeleteConfirm="showSessionDeleteConfirm"
      :mcpCount="mockMCPList.length"
      @selectSession="handleSelectSession"
      @createNewSession="handleCreateNewSession"
      @requestDeleteSession="requestDeleteSession"
      @confirmDelete="confirmDelete"
      @openMCP="showMCPDrawer = true"
      @openAPIConfig="showAPIConfigModal = true"
    />

    <main class="flex-1 flex flex-col min-w-0">
      <header class="h-14 min-h-[56px] border-b border-slate-100 bg-white flex items-center justify-between px-6">
        <div class="flex items-center gap-2 text-sm min-w-0">
          <span class="text-gray-500 shrink-0">当前对话</span>
          <svg class="w-3 h-3 text-gray-300 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>
          <span class="font-medium text-gray-800 truncate">{{ currentSession?.title ?? '选择对话' }}</span>
        </div>
        <!-- Tool chain toggle — three states: hidden / collapsed / all expanded -->
        <button @click="toggleToolChain()"
          class="flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors shrink-0"
          :class="[toolChainState === 0 ? 'text-slate-300 hover:text-slate-400' : 'text-slate-500 bg-slate-50']"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
          工具调用链
          <span class="text-[9px] opacity-60">{{ toolChainState === 0 ? '' : toolChainState === 1 ? '摘要' : '展开' }}</span>
        </button>
      </header>

      <!-- Message Area -->
      <div ref="messageContainerRef" @scroll="handleScroll" class="flex-1 overflow-y-auto px-6 py-6 relative">
        <div class="max-w-3xl mx-auto space-y-6">
          <MessageBubble
            v-for="msg in messageList"
            :key="msg.id"
            :msg="msg"
            :selectedModelName="selectedModel.name"
            :isAiResponding="isAiResponding"
            :isLastMessage="msg === messageList[messageList.length - 1]"
            :expandedThinking="expandedThinking"
            :showAllAttachments="showAllAttachments"
            :toolChainState="toolChainState"
            :expandedSteps="expandedSteps"
            @toggleThinking="toggleThinking"
            @toggleAttachments="toggleAttachments"
            @toggleToolStep="toggleToolStep"
          />

          <!-- Empty State -->
          <div v-if="messageList.length === 0 && !loading" class="flex flex-col items-center justify-center py-20 text-center">
            <div class="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mb-6">
              <svg class="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
            </div>
            <h3 class="text-lg font-semibold text-gray-700 mb-2">开始新的对话</h3>
            <p class="text-sm text-gray-400 max-w-sm">向 NexusAgent 发送消息，或选择左侧的历史对话继续交流</p>
          </div>
        </div>

        <!-- Scroll to bottom button (bottom-right, appears when user scrolls up) -->
        <button v-if="showScrollButton" @click="scrollToBottom"
          class="absolute bottom-4 right-6 flex items-center gap-1.5 px-3 py-2 rounded-full bg-white border border-slate-200 shadow-md text-xs text-slate-500 hover:text-slate-700 hover:shadow-lg transition-all duration-200 z-10"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>
          回到最新
        </button>
      </div>

      <!-- Input Zone -->
      <div class="px-6 pb-4 pt-2 bg-slate-50">
        <ChatInput
          :inputText="inputText"
          :isAiResponding="isAiResponding"
          :pendingFiles="pendingFiles"
          :selectedModel="selectedModel"
          :selectedKnowledgeBase="selectedKnowledgeBase"
          :enableRag="enableRag"
          :knowledgeBases="knowledgeBases"
          :showModelSelector="showModelSelector"
          :showKnowledgeBaseSelector="showKnowledgeBaseSelector"
          @update:inputText="inputText = $event"
          @sendMessage="sendMessage"
          @handleKeydown="handleKeydown"
          @cancelStreaming="cancelStreaming"
          @selectModel="selectModel"
          @selectKnowledgeBase="selectKnowledgeBase"
          @toggleRag="toggleRag"
          @update:showModelSelector="showModelSelector = $event"
          @update:showKnowledgeBaseSelector="showKnowledgeBaseSelector = $event"
          @fileSelected="onFileSelected"
          @removePendingFile="removePendingFile"
        />
      </div>
    </main>

    <MCPDrawer
      :visible="showMCPDrawer"
      :servers="mockMCPList"
      @close="showMCPDrawer = false"
    />

    <APIConfigModal
      :visible="showAPIConfigModal"
      @close="showAPIConfigModal = false"
    />
  </div>
</template>

<style>
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; padding: 0; }
h1, h2, h3, h4, h5, h6, p, figure, blockquote, dl, dd { margin: 0; }
ul, ol { margin: 0; padding: 0; }
a { color: inherit; text-decoration: none; }
img { display: block; max-width: 100%; }
button { font: inherit; cursor: pointer; border: none; background: none; padding: 0; }
input, textarea, select { font: inherit; color: inherit; }

.markdown-body { color: #334155; line-height: 1.75; word-break: break-word; }
.markdown-body h1 { font-size: 1.375em; font-weight: 700; margin-top: 1.2em; margin-bottom: 0.5em; color: #1e293b; }
.markdown-body h2 { font-size: 1.125em; font-weight: 700; margin-top: 1.2em; margin-bottom: 0.4em; color: #1e293b; padding-bottom: 0.15em; border-bottom: 1px solid #e2e8f0; }
.markdown-body h3 { font-size: 1em; font-weight: 600; margin-top: 1em; margin-bottom: 0.3em; color: #1e293b; }
.markdown-body p { margin-bottom: 0.75em; }
.markdown-body p:last-child { margin-bottom: 0; }
.markdown-body ul, .markdown-body ol { margin-bottom: 0.75em; padding-left: 1.5em; }
.markdown-body ul { list-style: disc; }
.markdown-body ol { list-style: decimal; }
.markdown-body li { margin-bottom: 0.25em; }
.markdown-body li > ul, .markdown-body li > ol { margin-bottom: 0; }
.markdown-body strong { font-weight: 600; color: #1e293b; }
.markdown-body em { font-style: italic; }
.markdown-body code { font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace; font-size: 0.875em; padding: 0.2em 0.4em; border-radius: 4px; background: #f1f5f9; color: #0f172a; }
.markdown-body pre { margin: 0.75em 0; border-radius: 10px; overflow: hidden; border: 1px solid #e2e8f0; background: #f8fafc; }
.markdown-body pre code { display: block; padding: 1em; overflow-x: auto; font-size: 0.8125em; line-height: 1.6; background: transparent; border-radius: 0; color: #334155; }
.markdown-body hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.5em 0; }
.markdown-body blockquote { border-left: 3px solid #cbd5e1; padding-left: 1em; margin: 0.75em 0; color: #64748b; }
.markdown-body a { color: #2563eb; text-decoration: underline; }
.markdown-body table { border-collapse: collapse; width: 100%; margin: 0.75em 0; font-size: 0.875em; }
.markdown-body th, .markdown-body td { border: 1px solid #e2e8f0; padding: 0.5em 0.75em; text-align: left; }
.markdown-body th { background: #f8fafc; font-weight: 600; color: #1e293b; }

.code-block-wrapper { position: relative; }
.code-copy-btn { position: absolute; top: 0.5rem; right: 0.5rem; display: flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; border-radius: 0.5rem; color: #94a3b8; opacity: 0; transition: opacity 0.15s, background-color 0.15s, color 0.15s; }
.code-block-wrapper:hover .code-copy-btn { opacity: 1; }
.code-copy-btn:hover { background: #f1f5f9; color: #475569; }
.code-copy-btn.copied { opacity: 1; color: #10b981; }
.hljs { background: transparent !important; color: #334155 !important; }

.drawer-enter-active, .drawer-leave-active { transition: opacity 0.2s ease; }
.drawer-enter-active > div:last-child, .drawer-leave-active > div:last-child { transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from > div:last-child, .drawer-leave-to > div:last-child { transform: translateX(100%); }
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-active > div:last-child, .modal-leave-active > div:last-child { transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from > div:last-child, .modal-leave-to > div:last-child { transform: scale(0.95); opacity: 0; }

.overflow-y-auto::-webkit-scrollbar { width: 4px; }
.overflow-y-auto::-webkit-scrollbar-track { background: transparent; }
.overflow-y-auto::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 999px; }
.overflow-y-auto::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
textarea { field-sizing: content; }
</style>
