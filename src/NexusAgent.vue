<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'
import {
  fetchSessionList,
  fetchMessages,
  deleteSession as apiDeleteSession,
  fetchKnowledgeList,
  fetchMCPServerList,
} from './api'
import type {
  SessionVO,
  MessageVO,
  AttachedFileVO,
  ToolRequestVO,
  KnowledgeVO,
  MCPServerVO,
} from './api/types'

// ========== Markdown renderer ==========
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

onMounted(() => {
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.code-copy-btn')
    if (!btn) return
    const wrapper = btn.closest('.code-block-wrapper')
    const code = wrapper?.querySelector('code')?.textContent || ''
    navigator.clipboard.writeText(code).then(() => {
      btn.classList.add('copied')
      setTimeout(() => btn.classList.remove('copied'), 1500)
    })
  })
})

// ========== Component-level types ==========
interface ComponentAttachment {
  id: string
  name: string
  url: string
  type: 'image' | 'document' | 'code'
  size: number
  ext: string
}

interface ComponentThinking {
  content: string
  durationMs: number
}

interface ComponentToolCall {
  id: string
  name: string
  status: 'running' | 'success' | 'error'
  input: string
  output?: string
  durationMs?: number
}

interface TextFragment {
  kind: 'text'
  content: string
}

interface ToolSectionFragment {
  kind: 'tools'
  calls: ComponentToolCall[]
}

type Fragment = TextFragment | ToolSectionFragment

interface ComponentMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: ComponentAttachment[]
  thinking?: ComponentThinking
  fragments?: Fragment[]
  timestamp: string
}

interface ComponentSession {
  id: string
  title: string
  createdAt: string
}

// ========== Data transformers ==========
function mapFileType(ext: string): 'image' | 'document' | 'code' {
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico']
  const codeExts = ['vue', 'ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'hpp', 'css', 'scss', 'less', 'html', 'json', 'xml', 'yaml', 'yml', 'md']
  const lower = ext.toLowerCase()
  if (imageExts.includes(lower)) return 'image'
  if (codeExts.includes(lower)) return 'code'
  return 'document'
}

function mapAttachment(vo: AttachedFileVO): ComponentAttachment {
  return { id: vo.id, name: vo.fileName, url: vo.fileUrl, type: mapFileType(vo.extension), size: vo.fileSize, ext: vo.extension }
}

/** Escape HTML for safe rendering inside v-html */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Highlight tool input: try JSON, fallback to escaped plain text */
function highlightInput(input: string): string {
  if (!input) return ''
  try {
    const parsed = JSON.parse(input)
    return hljs.highlight(JSON.stringify(parsed, null, 2), { language: 'json' }).value
  } catch {
    return esc(input)
  }
}

/** Turn raw error text into human-friendly message */
function friendlyError(output: string): string {
  const m = output.match(/(\d{3})\s+(\S+)/)
  if (m) {
    const map: Record<string, string> = {
      '400': '请求参数格式错误',
      '401': '身份验证失败，请检查 API 密钥',
      '403': '没有权限执行此操作',
      '404': '请求的资源不存在',
      '422': '请求参数格式错误',
      '429': '请求频率过高，请稍后重试',
      '500': '服务器内部错误',
      '502': '网关错误',
      '503': '服务暂时不可用',
    }
    return `${map[m[1]] || '请求失败'} (${m[1]})`
  }
  return output.length > 120 ? output.slice(0, 120) + '…' : output
}

/** Group consecutive non-USER messages into fragments of text & tool sections */
function groupMessages(raw: MessageVO[]): ComponentMessage[] {
  const result: ComponentMessage[] = []
  let seq = 0
  // Per-turn accumulator
  let fragments: Fragment[] = []
  let thinking: ComponentThinking | undefined
  let pendingReqs: ToolRequestVO[] = []
  let pendingResults: Map<string, { result: string; isError: boolean }> = new Map()

  function flushTools() {
    if (pendingReqs.length === 0) return
    const calls: ComponentToolCall[] = pendingReqs.map(req => {
      const res = pendingResults.get(req.id)
      return {
        id: req.id,
        name: req.toolName,
        status: res ? (res.isError ? 'error' : 'success') : 'running',
        input: req.arguments || '',
        output: res?.result,
      }
    })
    fragments.push({ kind: 'tools', calls })
    pendingReqs = []
    pendingResults = new Map()
  }

  function finalizeTurn() {
    flushTools()
    if (fragments.length > 0 || thinking) {
      // Build content string from text fragments for backward compat
      const content = fragments
        .filter((f): f is TextFragment => f.kind === 'text')
        .map(f => f.content)
        .join('\n\n')
      result.push({
        id: `m-${seq++}`,
        role: 'assistant',
        content,
        thinking,
        fragments: fragments.length > 0 ? fragments : undefined,
        timestamp: '',
      })
    }
    fragments = []
    thinking = undefined
  }

  for (const vo of raw) {
    if (vo.type === 'USER') {
      finalizeTurn()
      result.push({
        id: `m-${seq++}`,
        role: 'user',
        content: vo.content ?? '',
        attachments: vo.attachedFiles ? vo.attachedFiles.map(mapAttachment) : undefined,
        timestamp: '',
      })
      continue
    }

    if (vo.type === 'AI') {
      // Flush previous tool section before new AI text
      flushTools()
      if (vo.content) {
        fragments.push({ kind: 'text', content: vo.content })
      }
      if (vo.thinking && !thinking) {
        thinking = { content: vo.thinking, durationMs: 0 }
      }
      if (vo.toolRequestList) {
        pendingReqs.push(...vo.toolRequestList)
      }
    }

    if (vo.type === 'TOOL_EXECUTION_RESULT' && vo.toolResultVO) {
      pendingResults.set(vo.toolResultVO.id, {
        result: vo.toolResultVO.result,
        isError: vo.toolResultVO.isError,
      })
    }
  }

  finalizeTurn()
  return result
}

function mapSession(vo: SessionVO): ComponentSession {
  return { id: vo.sessionId, title: vo.title, createdAt: vo.createTime }
}

function setToken(token: string) {
  localStorage.setItem('token', token)
}

// ========== State ==========
const sessionList = ref<ComponentSession[]>([])
const currentSessionId = ref<string>('')
const messageList = ref<ComponentMessage[]>([])
const inputText = ref('')
const selectedModel = ref({ id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', supportsThinking: true, provider: 'DeepSeek' })
const selectedKnowledgeBase = ref<{ id: number | string; name: string; documentCount: number } | null>(null)
const enableRag = ref(true)
const showModelSelector = ref(false)
const showKnowledgeBaseSelector = ref(false)
const showMCPDrawer = ref(false)
const showAPIConfigModal = ref(false)
const showSessionDeleteConfirm = ref<string | null>(null)
const isAiResponding = ref(false)
const expandedThinking = ref<Set<string>>(new Set())
const expandedSteps = ref<Set<string>>(new Set())
const showAllAttachments = ref<Set<string>>(new Set())
const knowledgeBases = ref<KnowledgeVO[]>([])
const mockMCPList = ref<MCPServerVO[]>([])
const loading = ref(true)
const errorMsg = ref('')

const currentSession = computed(() => sessionList.value.find(s => s.id === currentSessionId.value) ?? null)

// ========== Lifecycle ==========
onMounted(async () => {
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
      currentSessionId.value = sessions[0].sessionId
      messageList.value = await loadMessages(sessions[0].sessionId)
    }
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
})

async function loadMessages(sessionId: string): Promise<ComponentMessage[]> {
  try {
    return groupMessages(await fetchMessages(sessionId))
  } catch {
    return []
  }
}

// ========== Actions ==========
async function selectSession(id: string) {
  if (id === currentSessionId.value) return
  currentSessionId.value = id
  messageList.value = await loadMessages(id)
  expandedThinking.value = new Set()
  expandedSteps.value = new Set()
  showSessionDeleteConfirm.value = null
}

async function createNewSession() {
  const newId = `local-${Date.now()}`
  sessionList.value.unshift({ id: newId, title: '新对话', createdAt: new Date().toISOString() })
  currentSessionId.value = newId
  messageList.value = []
  inputText.value = ''
}

async function requestDeleteSession(id: string, event: MouseEvent) {
  event.stopPropagation()
  if (showSessionDeleteConfirm.value === id) {
    await confirmDelete(id, event)
  } else {
    showSessionDeleteConfirm.value = id
  }
}

async function confirmDelete(id: string, event: MouseEvent) {
  event.stopPropagation()
  const idx = sessionList.value.findIndex(s => s.id === id)
  if (!id.startsWith('local-')) {
    try { await apiDeleteSession(id) } catch { /* ignore */ }
  }
  sessionList.value = sessionList.value.filter(s => s.id !== id)
  showSessionDeleteConfirm.value = null
  if (currentSessionId.value === id) {
    const next = sessionList.value[Math.min(idx, sessionList.value.length - 1)]
    if (next) {
      currentSessionId.value = next.id
      messageList.value = await loadMessages(next.id)
    } else {
      currentSessionId.value = ''
      messageList.value = []
    }
  }
}

function sendMessage() {
  const text = inputText.value.trim()
  if (!text || isAiResponding.value) return
  messageList.value.push({
    id: `msg-${Date.now()}`,
    role: 'user',
    content: text,
    timestamp: new Date().toISOString(),
  })
  inputText.value = ''
  isAiResponding.value = true
  setTimeout(() => {
    messageList.value.push({
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: '这是一个模拟的 AI 回复内容。在实际集成中，将通过 SSE 流式接口获取。',
      thinking: { content: '这是模拟的深度思考过程。', durationMs: 1500 },
      timestamp: new Date().toISOString(),
    })
    isAiResponding.value = false
  }, 1500)
}

function selectModel(model: { id: string; name: string; supportsThinking: boolean; provider: string }) {
  selectedModel.value = model
  showModelSelector.value = false
}

function selectKnowledgeBase(kb: KnowledgeVO | null) {
  selectedKnowledgeBase.value = kb ? { id: kb.id, name: kb.name, documentCount: 0 } : null
  showKnowledgeBaseSelector.value = false
}

function toggleRag() { enableRag.value = !enableRag.value }

function toggleThinking(id: string) {
  const s = new Set(expandedThinking.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedThinking.value = s
}

function toggleToolStep(id: string) {
  const s = new Set(expandedSteps.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedSteps.value = s
}

function toggleAttachments(id: string) {
  const s = new Set(showAllAttachments.value)
  s.has(id) ? s.delete(id) : s.add(id)
  showAllAttachments.value = s
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
}

function renderMarkdown(content: string): string {
  return marked.parse(content, { async: false }) as string
}

function generateThumbnail(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
    <rect width="320" height="200" fill="#F1F5F9"/>
    <rect x="80" y="40" width="160" height="120" rx="8" fill="#CBD5E1"/>
    <circle cx="128" cy="76" r="14" fill="#94A3B8"/>
    <polygon points="96,138 144,110 176,128 200,114 224,138" fill="#94A3B8"/>
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function isSingleImage(attachments: ComponentAttachment[]): boolean {
  return attachments.length === 1 && attachments[0].type === 'image'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null) return ''
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function getFileTypeColor(type: ComponentAttachment['type']): string {
  switch (type) {
    case 'image': return 'bg-pink-50 text-pink-700 border-pink-100'
    case 'document': return 'bg-blue-50 text-blue-700 border-blue-100'
    case 'code': return 'bg-amber-50 text-amber-700 border-amber-100'
  }
}

// @ts-expect-error expose for dev console
window.__setToken = setToken
</script>

<template>
  <div class="flex h-screen bg-slate-50 text-gray-900 font-sans antialiased">
    <!-- ===== Sidebar ===== -->
    <aside class="w-[260px] min-w-[260px] bg-white border-r border-slate-100 flex flex-col h-full">
      <div class="px-4 pt-5 pb-3 border-b border-slate-100">
        <div class="flex items-center gap-2 mb-4 px-1">
          <svg class="w-7 h-7" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#2563EB"/>
            <path d="M9 22V10L23 22V10" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="font-semibold text-sm tracking-tight text-gray-800">NexusAgent</span>
        </div>
        <button @click="createNewSession" class="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-slate-50 transition-all duration-150 border border-slate-100 hover:border-slate-200 shadow-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          新建对话
        </button>
      </div>
      <div class="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        <div v-if="loading" class="flex items-center justify-center py-8 text-xs text-gray-400">加载中...</div>
        <div v-else-if="errorMsg" class="px-3 py-4 text-xs text-center text-red-500">{{ errorMsg }}</div>
        <div v-else-if="sessionList.length === 0" class="px-3 py-8 text-xs text-center text-gray-400">暂无历史对话</div>
        <div v-for="session in sessionList" :key="session.id"
          @click="selectSession(session.id)"
          class="group flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 text-sm"
          :class="currentSessionId === session.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-slate-50 hover:text-gray-800'"
        >
          <svg class="w-4 h-4 shrink-0" :class="currentSessionId === session.id ? 'text-blue-500' : 'text-gray-400'" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
          <span class="truncate flex-1">{{ session.title }}</span>
          <button v-if="showSessionDeleteConfirm === session.id"
            @click="confirmDelete(session.id, $event)"
            class="shrink-0 p-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors" title="确认删除"
          ><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg></button>
          <button v-else
            @click="requestDeleteSession(session.id, $event)"
            class="shrink-0 p-1 rounded-lg opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all duration-150" title="删除对话"
          ><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
        </div>
      </div>
      <div class="border-t border-slate-100 px-3 py-3">
        <div class="flex items-center gap-3 px-2 mb-3">
          <svg class="w-8 h-8 shrink-0" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="16" fill="#64748B"/>
            <circle cx="16" cy="12" r="4" fill="white" opacity="0.9"/>
            <ellipse cx="16" cy="24" rx="8" ry="5" fill="white" opacity="0.9"/>
          </svg>
          <div class="flex-1 min-w-0"><div class="text-sm font-medium text-gray-800 truncate">用户</div><div class="text-xs text-gray-400">已登录</div></div>
        </div>
        <div class="space-y-1">
          <button @click="showMCPDrawer = true" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-gray-500 hover:text-gray-700 hover:bg-slate-50 transition-all duration-150">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
            MCP 管理<span class="ml-auto text-xs text-gray-400">{{ mockMCPList.length }} 个服务器</span>
          </button>
          <button @click="showAPIConfigModal = true" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-gray-500 hover:text-gray-700 hover:bg-slate-50 transition-all duration-150">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            API 配置
          </button>
        </div>
      </div>
    </aside>

    <!-- ===== Main Workspace ===== -->
    <main class="flex-1 flex flex-col min-w-0">
      <header class="h-14 min-h-[56px] border-b border-slate-100 bg-white flex items-center px-6">
        <div class="flex items-center gap-2 text-sm">
          <span class="text-gray-500">当前对话</span>
          <svg class="w-3 h-3 text-gray-300" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>
          <span class="font-medium text-gray-800 truncate max-w-md">{{ currentSession?.title ?? '选择对话' }}</span>
        </div>
      </header>

      <!-- ===== Message Area ===== -->
      <div class="flex-1 overflow-y-auto px-6 py-6">
        <div class="max-w-3xl mx-auto space-y-6">
          <div v-for="msg in messageList" :key="msg.id" class="flex" :class="msg.role === 'user' ? 'justify-end' : 'justify-start'">
            <!-- ─── User Message ─── -->
            <div v-if="msg.role === 'user'" class="max-w-[75%] space-y-2">
              <div v-if="msg.attachments && msg.attachments.length > 0" class="flex flex-wrap gap-1.5 justify-end">
                <div v-if="isSingleImage(msg.attachments)" class="rounded-xl overflow-hidden border border-slate-100 shadow-sm w-48">
                  <div class="h-28 bg-slate-100 flex items-center justify-center overflow-hidden">
                    <img :src="generateThumbnail()" alt="" class="w-full h-full object-cover" />
                  </div>
                  <div class="px-2.5 py-1 bg-white flex items-center justify-between">
                    <span class="text-[11px] font-medium text-gray-600 truncate">{{ msg.attachments[0].name }}</span>
                    <span class="text-[10px] text-gray-400">{{ formatFileSize(msg.attachments[0].size) }}</span>
                  </div>
                </div>
                <template v-else>
                  <template v-for="att in msg.attachments" :key="att.id">
                    <template v-if="showAllAttachments.has(msg.id) || msg.attachments.indexOf(att) < 3">
                      <div class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border shadow-sm text-[11px]" :class="getFileTypeColor(att.type)">
                        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" v-if="att.type === 'document'"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" v-else-if="att.type === 'code'"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
                        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" v-else><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                        <span class="font-medium truncate max-w-[80px]">{{ att.name }}</span>
                        <span class="text-gray-400">{{ formatFileSize(att.size) }}</span>
                      </div>
                    </template>
                  </template>
                  <button v-if="msg.attachments.length > 3 && !showAllAttachments.has(msg.id)" @click="toggleAttachments(msg.id)" class="text-[11px] text-gray-400 hover:text-gray-600 px-1.5 transition-colors">+{{ msg.attachments.length - 3 }}</button>
                  <button v-if="showAllAttachments.has(msg.id) && msg.attachments.length > 3" @click="toggleAttachments(msg.id)" class="text-[11px] text-gray-400 hover:text-gray-600 px-1.5 transition-colors">收起</button>
                </template>
              </div>
              <div class="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap shadow-sm">{{ msg.content }}</div>
              <div class="text-xs text-gray-400 text-right">{{ formatTime(msg.timestamp) }}</div>
            </div>

            <!-- ─── Assistant Message ─── -->
            <div v-else class="flex gap-3 max-w-[85%]">
              <svg class="w-8 h-8 shrink-0 mt-0.5" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="8" fill="#2563EB"/>
                <path d="M9 22V10L23 22V10" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <div class="space-y-3">
                <!-- Thinking Block -->
                <div v-if="msg.thinking" class="mb-1">
                  <button @click="toggleThinking(msg.id)" class="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                    <svg class="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    <span>已深度思考</span><span class="text-gray-300">·</span><span class="text-gray-500">{{ formatDuration(msg.thinking.durationMs) }}</span>
                    <svg class="w-3 h-3 text-gray-300 transition-transform duration-200" :class="expandedThinking.has(msg.id) ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                  </button>
                  <div v-show="expandedThinking.has(msg.id)" class="mt-1.5 pl-5">
                    <div class="text-xs text-gray-500 italic leading-relaxed bg-gray-50 rounded-lg p-3 border border-slate-100">{{ msg.thinking.content }}</div>
                  </div>
                </div>
                <div v-else-if="isAiResponding && msg === messageList[messageList.length - 1]" class="flex items-center gap-2 text-xs text-gray-400">
                  <div class="w-3 h-3 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin"></div><span>正在思考...</span>
                </div>

                <!-- ─── Fragments: text / tool sections interleaved ─── -->
                <template v-if="msg.fragments">
                  <template v-for="(frag, fi) in msg.fragments" :key="fi">
                    <!-- Text fragment -->
                    <div v-if="frag.kind === 'text'" class="markdown-body text-sm" v-html="renderMarkdown(frag.content)"></div>

                    <!-- Tool section -->
                    <div v-else-if="frag.kind === 'tools'" class="space-y-1">
                      <div v-for="tc in frag.calls" :key="tc.id">
                        <button @click="toggleToolStep(tc.id)"
                          class="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-100 text-xs hover:bg-slate-50 transition-colors"
                        >
                          <span class="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
                            :class="tc.status === 'success' ? 'bg-emerald-100 text-emerald-600' : tc.status === 'error' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'"
                          >{{ tc.status === 'success' ? '✓' : tc.status === 'error' ? '✗' : '⟳' }}</span>
                          <span class="font-medium text-slate-700">{{ tc.name }}</span>
                          <svg class="w-3 h-3 ml-auto text-slate-300 transition-transform duration-200" :class="expandedSteps.has(tc.id) ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                        </button>
                        <div v-show="expandedSteps.has(tc.id)" class="mt-1.5 ml-4 pl-3 border-l-2 border-slate-100 space-y-1.5">
                          <div>
                            <div class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">输入</div>
                            <div class="mt-0.5 bg-slate-50 border border-slate-100 rounded-lg p-2 font-mono text-[11px] text-slate-600 leading-relaxed overflow-x-auto" v-html="highlightInput(tc.input)"></div>
                          </div>
                          <div v-if="tc.output">
                            <div class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">输出</div>
                            <div class="mt-0.5" :class="tc.status === 'error' ? 'bg-red-50 border border-red-100 rounded-lg p-2 text-[11px] text-red-700 leading-relaxed' : 'bg-gray-50 border border-slate-100 rounded-lg p-2 font-mono text-[11px] text-gray-600 leading-relaxed'">
                              <template v-if="tc.status === 'error'">
                                <div class="flex items-center gap-1 mb-0.5 font-medium">
                                  <svg class="w-3 h-3 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
                                  <span>失败</span>
                                </div>
                                <p>{{ friendlyError(tc.output) }}</p>
                              </template>
                              <template v-else>{{ tc.output }}</template>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>
                </template>

                <!-- Fallback: plain content (messages without fragments) -->
                <div v-else-if="msg.content" class="markdown-body text-sm" v-html="renderMarkdown(msg.content)"></div>

                <div class="text-xs text-gray-400 flex items-center gap-2">
                  <span>{{ formatTime(msg.timestamp) }}</span>
                  <span class="w-1 h-1 rounded-full bg-gray-300"></span>
                  <span class="text-gray-400">{{ selectedModel.name }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div v-if="messageList.length === 0 && !loading" class="flex flex-col items-center justify-center py-20 text-center">
            <div class="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mb-6">
              <svg class="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
            </div>
            <h3 class="text-lg font-semibold text-gray-700 mb-2">开始新的对话</h3>
            <p class="text-sm text-gray-400 max-w-sm">向 NexusAgent 发送消息，或选择左侧的历史对话继续交流</p>
          </div>
        </div>
      </div>

      <!-- ===== Input Zone ===== -->
      <div class="px-6 pb-4 pt-2 bg-slate-50">
        <div class="max-w-3xl mx-auto">
          <div class="flex items-center gap-2 mb-2.5 px-1">
            <div class="relative">
              <button @click="showModelSelector = !showModelSelector" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-white border border-transparent hover:border-slate-100 transition-all duration-150">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                {{ selectedModel.name }}<svg class="w-3 h-3 text-gray-300" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
              </button>
              <div v-if="showModelSelector" class="absolute bottom-full mb-1 left-0 w-64 bg-white border border-slate-100 rounded-xl shadow-lg overflow-hidden z-50">
                <div class="py-1">
                  <div @click="selectModel({ id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', supportsThinking: true, provider: 'DeepSeek' })" class="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors" :class="selectedModel.id === 'deepseek-v4-pro' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-slate-50'">
                    <div class="flex-1"><div class="font-medium">DeepSeek V4 Pro</div><div class="text-xs text-gray-400">DeepSeek</div></div>
                  </div>
                  <div @click="selectModel({ id: 'gpt-4o', name: 'GPT-4o', supportsThinking: false, provider: 'OpenAI' })" class="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors" :class="selectedModel.id === 'gpt-4o' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-slate-50'">
                    <div class="flex-1"><div class="font-medium">GPT-4o</div><div class="text-xs text-gray-400">OpenAI</div></div>
                  </div>
                </div>
              </div>
            </div>
            <div class="relative">
              <button @click="showKnowledgeBaseSelector = !showKnowledgeBaseSelector" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-white border border-transparent hover:border-slate-100 transition-all duration-150">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                {{ selectedKnowledgeBase ? selectedKnowledgeBase.name : '无知识库' }}<svg class="w-3 h-3 text-gray-300" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
              </button>
              <div v-if="showKnowledgeBaseSelector" class="absolute bottom-full mb-1 left-0 w-56 bg-white border border-slate-100 rounded-xl shadow-lg overflow-hidden z-50">
                <div class="py-1">
                  <div @click="selectKnowledgeBase(null)" class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-slate-50 cursor-pointer transition-colors" :class="!selectedKnowledgeBase ? 'bg-blue-50 text-blue-700' : ''">
                    <span>无知识库</span><svg v-if="!selectedKnowledgeBase" class="w-4 h-4 ml-auto text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                  </div>
                  <div v-for="kb in knowledgeBases" :key="kb.id" @click="selectKnowledgeBase(kb)" class="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors" :class="selectedKnowledgeBase?.id === kb.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-slate-50'">
                    <div class="flex-1"><div class="font-medium">{{ kb.name }}</div><div class="text-xs text-gray-400">{{ kb.describe || '暂无描述' }}</div></div>
                    <svg v-if="selectedKnowledgeBase?.id === kb.id" class="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                  </div>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500">
              <span>RAG</span>
              <button @click="toggleRag" class="relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200" :class="enableRag ? 'bg-emerald-400' : 'bg-gray-200'">
                <span class="inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-200" :class="enableRag ? 'translate-x-3.5' : 'translate-x-0.5'"></span>
              </button>
            </div>
          </div>
          <div class="bg-white border border-slate-100 rounded-2xl shadow-md transition-shadow duration-200 focus-within:shadow-lg">
            <textarea v-model="inputText" @keydown="handleKeydown" placeholder="给 NexusAgent 发送消息，或者询问知识库..." rows="1"
              class="w-full resize-none bg-transparent px-5 pt-4 pb-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none leading-relaxed"
              @input="($event.target as HTMLTextAreaElement).style.height = 'auto'; ($event.target as HTMLTextAreaElement).style.height = Math.min(($event.target as HTMLTextAreaElement).scrollHeight, 80) + 'px'"
            ></textarea>
            <div class="flex items-center justify-between px-4 pb-3">
              <button class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-600 hover:bg-slate-50 transition-all duration-150">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                <span>附件</span>
              </button>
              <div class="flex items-center gap-2">
                <span v-if="isAiResponding" class="text-xs text-gray-400 animate-pulse">AI 响应中...</span>
                <button @click="sendMessage" :disabled="!inputText.trim() || isAiResponding"
                  class="flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-150"
                  :class="inputText.trim() && !isAiResponding ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm' : 'bg-slate-100 text-gray-300 cursor-not-allowed'"
                ><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"/></svg></button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- ===== MCP Drawer ===== -->
    <transition name="drawer">
      <div v-if="showMCPDrawer" class="fixed inset-0 z-50 flex">
        <div @click="showMCPDrawer = false" class="absolute inset-0 bg-black/20 backdrop-blur-sm"></div>
        <div class="relative ml-auto w-[400px] h-full bg-white shadow-xl">
          <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 class="text-base font-semibold text-gray-800">MCP 服务器管理</h2>
            <button @click="showMCPDrawer = false" class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-slate-50 transition-all">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div v-if="mockMCPList.length === 0" class="p-5 text-xs text-gray-400 text-center">暂无 MCP 服务器</div>
          <div v-else class="p-5 space-y-3">
            <div v-for="mcp in mockMCPList" :key="mcp.id" class="flex items-center gap-3 p-4 rounded-xl border border-slate-100 hover:border-slate-200 transition-all shadow-sm">
              <div class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <img v-if="mcp.logoUrl" :src="mcp.logoUrl" alt="" class="w-8 h-8 rounded-lg object-contain" />
                <svg v-else class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2"><span class="text-sm font-medium text-gray-800">{{ mcp.name }}</span><span class="w-1.5 h-1.5 rounded-full" :class="mcp.available ? 'bg-emerald-400' : 'bg-gray-300'"></span></div>
                <div class="text-xs text-gray-400 truncate mt-0.5">{{ mcp.description }}</div>
                <div class="text-xs text-gray-300 truncate mt-0.5">{{ mcp.url }}</div>
              </div>
              <span class="text-xs font-medium px-2 py-1 rounded-full" :class="mcp.available ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-50 text-gray-400'">{{ mcp.available ? '在线' : '离线' }}</span>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- ===== API Config Modal ===== -->
    <transition name="modal">
      <div v-if="showAPIConfigModal" class="fixed inset-0 z-50 flex items-center justify-center">
        <div @click="showAPIConfigModal = false" class="absolute inset-0 bg-black/20 backdrop-blur-sm"></div>
        <div class="relative w-[480px] bg-white rounded-2xl shadow-xl border border-slate-100">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 class="text-base font-semibold text-gray-800">API 配置</h2>
            <button @click="showAPIConfigModal = false" class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-slate-50 transition-all">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="p-6 space-y-5">
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1.5">Token</label>
              <div class="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50 text-sm text-gray-400">
                <span>已保存在本地存储</span><button class="ml-auto text-xs text-blue-500 hover:text-blue-600 font-medium">更换</button>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1.5">API 端点</label>
              <input type="text" value="http://localhost:8080" readonly class="w-full px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50 text-sm text-gray-600 focus:outline-none" />
            </div>
            <div class="flex items-center justify-between pt-2 border-t border-slate-100">
              <span class="text-xs text-gray-400">在 console 执行 __setToken('jwt') 设置令牌</span>
              <button @click="showAPIConfigModal = false" class="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-xl transition-all shadow-sm">关闭</button>
            </div>
          </div>
        </div>
      </div>
    </transition>
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
