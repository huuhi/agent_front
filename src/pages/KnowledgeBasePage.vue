<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { marked } from 'marked'
import { formatFileSize, ALLOWED_EXTENSIONS, validateFile } from '../utils/helpers'
import { useToast } from '../composables/useToast'
import { useAppState } from '../composables/useAppState'
import CustomSelect from '../components/CustomSelect.vue'
import {
  fetchKnowledgeList,
  fetchKnowledgeDetail,
  createKnowledge,
  uploadKnowledgeFileBinary,
  uploadKnowledgeFile,
  fetchUserFiles,
} from '../api'
import type { KnowledgeVO, KnowledgeDetailVO, AttachedFileVO } from '../api/types'

const { show: showToast } = useToast()
const { sidebarCollapsed } = useAppState()

const loading = ref(true)
const error = ref('')
const activeTab = ref<'files' | 'knowledge'>('files')

// ── Files ──
const allFiles = ref<AttachedFileVO[]>([])
const uploading = ref(false)
const searchQuery = ref('')
const bizTypeFilter = ref<'all' | 'KNOWLEDGE' | 'CHAT'>('all')
const acceptTypes = '.' + ALLOWED_EXTENSIONS.join(',.')

const filteredFiles = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return allFiles.value
  return allFiles.value.filter(f =>
    f.fileName.toLowerCase().includes(q) || f.extension.toLowerCase().includes(q)
  )
})

// ── File preview ──
const previewFile = ref<AttachedFileVO | null>(null)
const previewContent = ref('')
const previewRenderedHtml = ref('')
const previewLoading = ref(false)

const isImageFile = (ext: string) => ['jpg','jpeg','png','gif','webp','svg','bmp','ico'].includes(ext.toLowerCase())
const isTextFile = (ext: string) => ['md','txt','html','htm','css','js','ts','json','xml','yaml','yml','log','csv'].includes(ext.toLowerCase())
const isMarkdownFile = (ext: string) => ext.toLowerCase() === 'md'
const isHtmlFile = (ext: string) => ['html','htm'].includes(ext.toLowerCase())

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const month = d.getMonth() + 1
  const day = d.getDate()
  return `${month}/${day} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}

function getFileIcon(ext: string): string {
  const e = ext.toLowerCase()
  const typeMap: Record<string, string> = {
    md: 'markdown', txt: 'text', html: 'html', htm: 'html',
    css: 'code', js: 'code', ts: 'code', jsx: 'code', tsx: 'code',
    json: 'code', xml: 'code', yaml: 'code', yml: 'code',
    pdf: 'document', doc: 'document', docx: 'document',
    xls: 'document', xlsx: 'document',
    ppt: 'document', pptx: 'document',
    csv: 'document',
    jpg: 'image', jpeg: 'image', png: 'image', gif: 'image',
    webp: 'image', svg: 'image', bmp: 'image', ico: 'image',
    py: 'code', java: 'code', go: 'code', rs: 'code',
    log: 'text',
  }
  return typeMap[e] || 'file'
}

function getIconBg(ext: string): string {
  const type = getFileIcon(ext)
  const bgMap: Record<string, string> = {
    markdown: 'bg-sky-50 text-sky-500',
    text: 'bg-stone-50 text-stone-400',
    html: 'bg-orange-50 text-orange-500',
    code: 'bg-violet-50 text-violet-500',
    document: 'bg-rose-50 text-rose-500',
    image: 'bg-pink-50 text-pink-500',
    file: 'bg-lavender-50 text-lavender-500',
  }
  return bgMap[type] || 'bg-stone-50 text-stone-400'
}

function openPreview(file: AttachedFileVO) {
  previewFile.value = file
  previewContent.value = ''
  if (isTextFile(file.extension) && !isImageFile(file.extension)) {
    loadPreviewContent(file)
  }
}

async function loadPreviewContent(file: AttachedFileVO) {
  previewLoading.value = true
  try {
    const res = await fetch(file.fileUrl)
    const text = await res.text()
    previewContent.value = text
    if (isMarkdownFile(file.extension)) {
      previewRenderedHtml.value = marked.parse(text) as string
    }
  } catch {
    previewContent.value = '加载文件内容失败'
    previewRenderedHtml.value = ''
  } finally {
    previewLoading.value = false
  }
}

function closePreview() {
  previewFile.value = null
  previewContent.value = ''
  previewRenderedHtml.value = ''
}

// ── Knowledge ──
const knowledgeBases = ref<KnowledgeVO[]>([])
const selectedKb = ref<KnowledgeDetailVO | null>(null)
const kbLoading = ref(false)

const showCreateKb = ref(false)
const kbForm = ref({ name: '', describe: '', isPublic: false })
const creating = ref(false)

const showAddFiles = ref(false)
const selectedFileIds = ref<Set<string>>(new Set())
const addingFiles = ref(false)

// ========== Data ==========
async function loadAll() {
  loading.value = true; error.value = ''
  try {
    const [kbs, files] = await Promise.all([
      fetchKnowledgeList().catch(() => [] as KnowledgeVO[]),
      fetchUserFiles().catch(() => [] as AttachedFileVO[]),
    ])
    knowledgeBases.value = kbs
    allFiles.value = files
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function fetchFiles(bizType?: string) {
  try {
    allFiles.value = await fetchUserFiles('', bizType)
  } catch { /* ignore */ }
}

watch(activeTab, (tab) => {
  if (tab === 'files') {
    fetchFiles(bizTypeFilter.value === 'all' ? undefined : bizTypeFilter.value)
  }
})

watch(bizTypeFilter, (bizType) => {
  if (activeTab.value !== 'files') return
  fetchFiles(bizType === 'all' ? undefined : bizType)
})

async function selectKb(kb: KnowledgeVO) {
  selectedKb.value = null
  kbLoading.value = true
  try {
    selectedKb.value = await fetchKnowledgeDetail(kb.id)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '加载失败', 'error')
  } finally {
    kbLoading.value = false
  }
}

function openCreateKb() {
  kbForm.value = { name: '', describe: '', isPublic: false }
  showCreateKb.value = true
}

async function saveKb() {
  if (!kbForm.value.name.trim()) return
  creating.value = true
  try {
    await createKnowledge({
      name: kbForm.value.name.trim(),
      describe: kbForm.value.describe.trim(),
      isPublic: kbForm.value.isPublic,
      languageCode: null,
    })
    showToast('已创建')
    showCreateKb.value = false
    knowledgeBases.value = await fetchKnowledgeList()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '创建失败', 'error')
  } finally {
    creating.value = false
  }
}

async function onUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return
  const file = input.files[0]
  const err = validateFile(file, 0)
  if (err) { showToast(err, 'error'); input.value = '' as any; return }
  uploading.value = true
  try {
    await uploadKnowledgeFileBinary(input.files[0])
    showToast('已上传')
    activeTab.value = 'files'
    bizTypeFilter.value = 'all'
    await fetchFiles()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '上传失败', 'error')
  } finally {
    uploading.value = false; input.value = '' as any
  }
}

function openAddFiles() {
  selectedFileIds.value = new Set()
  showAddFiles.value = true
}

function toggleFileSelection(id: string) {
  const s = new Set(selectedFileIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selectedFileIds.value = s
}

function fileInCurrentKb(fileId: string): boolean {
  return selectedKb.value?.knowledgeBaseFileList?.some((f) => String(f.id) === fileId) ?? false
}

async function confirmAddFiles() {
  if (!selectedFileIds.value.size || !selectedKb.value) return
  addingFiles.value = true
  try {
    await uploadKnowledgeFile({
      fileIds: Array.from(selectedFileIds.value),
      knowledgeId: selectedKb.value.id,
    })
    showToast(`已添加 ${selectedFileIds.value.size} 个文件`)
    showAddFiles.value = false
    selectedKb.value = await fetchKnowledgeDetail(selectedKb.value.id)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '添加失败', 'error')
  } finally {
    addingFiles.value = false
  }
}

onMounted(loadAll)
</script>

<template>
  <main class="flex-1 flex flex-col min-w-0" style="background:#F5F4FD;font-family:'Nunito',sans-serif">
    <!-- ====== Header ====== -->
    <header class="shrink-0 h-14 flex items-center justify-between px-6 bg-white/70 backdrop-blur-md border-b border-[#E6E5F5]">
      <div class="flex items-center gap-3">
        <!-- <button @click="sidebarCollapsed = !sidebarCollapsed" class="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl text-[#7E84A3] hover:text-[#606CF3] hover:bg-[#F5F4FD] transition-all duration-200">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
        <h1 class="text-base font-bold text-[#2D325A] tracking-tight">文件中心</h1> -->
      </div>
      <div class="flex items-center gap-1.5 bg-[#F5F4FD] rounded-2xl p-1">
        <button @click="activeTab = 'files'" class="relative px-4 py-1.5 text-[13px] font-semibold rounded-xl transition-all duration-200" :class="activeTab === 'files' ? 'text-[#606CF3] bg-white shadow-sm' : 'text-[#7E84A3] hover:text-[#2D325A]'">
          <span>全部文件</span>
        </button>
        <button @click="activeTab = 'knowledge'" class="relative px-4 py-1.5 text-[13px] font-semibold rounded-xl transition-all duration-200" :class="activeTab === 'knowledge' ? 'text-[#606CF3] bg-white shadow-sm' : 'text-[#7E84A3] hover:text-[#2D325A]'">
          <span>知识库</span>
        </button>
      </div>
      <div class="w-8"></div>
    </header>

    <!-- ====== Loading ====== -->
    <template v-if="loading && allFiles.length === 0">
      <div class="flex-1 flex items-center justify-center">
        <div class="flex flex-col items-center gap-3">
          <div class="w-8 h-8 rounded-full border-[3px] border-[#E6E5F5] border-t-[#606CF3] animate-spin"></div>
          <span class="text-sm text-[#7E84A3] font-medium">加载中...</span>
        </div>
      </div>
    </template>
    <template v-else-if="error && allFiles.length === 0">
      <div class="flex-1 flex items-center justify-center px-4">
        <div class="px-5 py-3 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-500 font-medium">{{ error }}</div>
      </div>
    </template>

    <template v-else>
      <!-- ======================== FILES TAB ======================== -->
      <div v-show="activeTab === 'files'" class="flex-1 flex flex-col min-h-0">
        <!-- Search & Filter Bar -->
        <div class="shrink-0 flex items-center gap-3 px-6 py-4 border-b border-[#E6E5F5] bg-white/40">
          <div class="relative flex-1 max-w-md">
            <svg class="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#C7C7D1]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input v-model="searchQuery" type="text" placeholder="搜索文件..." class="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-[#E6E5F5] text-sm text-[#2D325A] placeholder-[#C7C7D1] bg-white focus:outline-none focus:border-[#606CF3] focus:ring-2 focus:ring-[#606CF3]/10 transition-all duration-200" />
          </div>
          <CustomSelect
            :model-value="bizTypeFilter"
            @update:model-value="bizTypeFilter = $event as 'all' | 'KNOWLEDGE' | 'CHAT'"
            :options="[
              { value: 'all', label: '全部类型' },
              { value: 'KNOWLEDGE', label: '知识库文件' },
              { value: 'CHAT', label: '聊天文件' },
            ]"
          />
          <label class="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-semibold cursor-pointer bg-[#606CF3] text-white hover:bg-[#5358E0] active:scale-[0.97] transition-all duration-200 shrink-0" :class="uploading ? 'opacity-60 pointer-events-none' : ''">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            <span>{{ uploading ? '上传中...' : '上传文件' }}</span>
            <input type="file" hidden :disabled="uploading" :accept="acceptTypes" @change="onUpload" />
          </label>
          <span class="text-[12px] text-[#7E84A3] font-medium whitespace-nowrap tabular-nums">{{ filteredFiles.length }} / {{ allFiles.length }}</span>
        </div>

        <!-- File Grid -->
        <div class="flex-1 overflow-y-auto px-6 py-5">
          <!-- Empty state -->
          <div v-if="allFiles.length === 0" class="flex flex-col items-center justify-center py-24 gap-4">
            <div class="w-16 h-16 rounded-2xl bg-[#F5F4FD] border border-[#E6E5F5] flex items-center justify-center">
              <svg class="w-7 h-7 text-[#C7C7D1]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
            </div>
            <p class="text-base font-semibold text-[#7E84A3]">暂无文件</p>
            <label class="px-5 py-2.5 rounded-2xl text-[13px] font-semibold bg-[#606CF3] text-white hover:bg-[#5358E0] cursor-pointer transition-all duration-200 active:scale-[0.97]">上传第一个文件<input type="file" hidden :accept="acceptTypes" @change="onUpload" /></label>
          </div>
          <div v-else-if="filteredFiles.length === 0" class="flex flex-col items-center justify-center py-20 gap-3">
            <div class="w-12 h-12 rounded-2xl bg-[#F5F4FD] border border-[#E6E5F5] flex items-center justify-center">
              <svg class="w-5 h-5 text-[#C7C7D1]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
            <p class="text-sm font-medium text-[#7E84A3]">没有匹配的文件</p>
            <button @click="searchQuery = ''; bizTypeFilter = 'all'" class="text-[13px] text-[#606CF3] hover:text-[#5358E0] font-semibold underline underline-offset-2">清除筛选</button>
          </div>

          <!-- Cards -->
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div v-for="file in filteredFiles" :key="file.id"
              @click="openPreview(file)"
              class="flex flex-col gap-3 px-4 py-4 rounded-2xl bg-white border border-[#E6E5F5] cursor-pointer transition-all duration-200 hover:border-[#D0D0E8] hover:shadow-[0_4px_20px_rgba(96,108,243,0.08)] hover:scale-[1.02] active:scale-[0.98] group"
            >
              <!-- Icon + Name -->
              <div class="flex items-start gap-3.5">
                <div class="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-lg transition-all duration-200 group-hover:scale-110" :class="getIconBg(file.extension)">
                  <!-- Markdown -->
                  <svg v-if="getFileIcon(file.extension) === 'markdown'" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 7v10l4-4 4 4V7"/>
                    <path d="M16 7v10l4-4 4 4V7"/>
                  </svg>
                  <!-- Image -->
                  <svg v-else-if="getFileIcon(file.extension) === 'image'" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="4"/>
                    <circle cx="8" cy="8" r="2"/>
                    <path d="M21 15l-5-5L5 21"/>
                  </svg>
                  <!-- HTML -->
                  <svg v-else-if="getFileIcon(file.extension) === 'html'" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="16 18 22 12 16 6"/>
                    <polyline points="8 6 2 12 8 18"/>
                  </svg>
                  <!-- Code -->
                  <svg v-else-if="getFileIcon(file.extension) === 'code'" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="16 18 22 12 16 6"/>
                    <polyline points="8 6 2 12 8 18"/>
                  </svg>
                  <!-- Document -->
                  <svg v-else-if="getFileIcon(file.extension) === 'document'" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                  </svg>
                  <!-- Text -->
                  <svg v-else-if="getFileIcon(file.extension) === 'text'" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                  <!-- Generic file -->
                  <svg v-else class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
                    <polyline points="13 2 13 9 20 9"/>
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[13px] font-semibold text-[#2D325A] truncate leading-snug">{{ file.fileName }}</div>
                  <div class="flex items-center gap-2 text-[11px] text-[#7E84A3] mt-1">
                    <span>{{ formatFileSize(file.fileSize) }}</span>
                    <span class="text-[#E6E5F5]">·</span>
                    <span>{{ fmtDate(file.createTime) }}</span>
                  </div>
                </div>
              </div>

              <!-- Badges -->
              <div class="flex items-center gap-2 flex-wrap">
                <span v-if="file.uploadStatus === 'SUCCESS'"
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-600"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  已完成
                </span>
                <span v-else-if="file.uploadStatus === 'PROCESSING'"
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-600"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                  处理中
                </span>
                <span v-else-if="file.uploadStatus === 'FAILED'"
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-500"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                  失败
                </span>
                <span v-if="file.bizType"
                  class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                  :class="file.bizType === 'KNOWLEDGE' ? 'bg-violet-50 text-violet-600' : 'bg-sky-50 text-sky-600'"
                >{{ file.bizType === 'KNOWLEDGE' ? '知识库' : '聊天' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ==================== KNOWLEDGE TAB ==================== -->
      <div v-show="activeTab === 'knowledge'" class="flex-1 flex min-h-0">
        <!-- KB Sidebar -->
        <aside class="w-[200px] shrink-0 border-r border-[#E6E5F5] flex flex-col bg-white/50">
          <div class="px-4 py-3.5 border-b border-[#E6E5F5] flex items-center justify-between">
            <span class="text-[11px] font-bold text-[#7E84A3] uppercase tracking-[0.08em]">知识库</span>
            <button @click="openCreateKb" class="w-7 h-7 rounded-xl flex items-center justify-center text-[#7E84A3] hover:text-[#606CF3] hover:bg-[#F5F4FD] transition-all duration-200">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            </button>
          </div>
          <div class="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
            <div v-if="knowledgeBases.length === 0" class="px-4 py-10 text-center text-[12px] text-[#C7C7D1] font-medium">暂无知识库</div>
            <button v-for="kb in knowledgeBases" :key="kb.id" @click="selectKb(kb)"
              class="w-full text-left px-3.5 py-2.5 text-[13px] font-medium rounded-xl transition-all duration-200"
              :class="selectedKb?.id === kb.id ? 'bg-[#F5F4FD] text-[#606CF3] font-semibold' : 'text-[#7E84A3] hover:text-[#2D325A] hover:bg-[#F5F4FD]/50'"
            >
              <div class="flex items-center gap-2.5">
                <svg class="w-4 h-4 shrink-0" :class="selectedKb?.id === kb.id ? 'text-[#606CF3]' : 'text-[#C7C7D1]'" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2 8l6-4 6 4-6 4-6-4zM2 16l6-4 6 4-6 4-6-4zM14 12l6-4 6 4-6 4-6-4z"/><path d="M2 8v8M14 12v8"/></svg>
                <span class="truncate">{{ kb.name }}</span>
              </div>
            </button>
          </div>
        </aside>

        <!-- KB Detail -->
        <div class="flex-1 flex flex-col min-w-0">
          <div v-if="!selectedKb" class="flex-1 flex items-center justify-center">
            <div class="flex flex-col items-center gap-3">
              <div class="w-14 h-14 rounded-2xl bg-[#F5F4FD] border border-[#E6E5F5] flex items-center justify-center">
                <svg class="w-6 h-6 text-[#C7C7D1]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2 8l6-4 6 4-6 4-6-4zM2 16l6-4 6 4-6 4-6-4zM14 12l6-4 6 4-6 4-6-4z"/><path d="M2 8v8M14 12v8"/></svg>
              </div>
              <span class="text-sm font-semibold text-[#7E84A3]">选择一个知识库</span>
            </div>
          </div>
          <template v-else>
            <!-- KB Header -->
            <div class="shrink-0 px-6 py-3.5 border-b border-[#E6E5F5] flex items-center justify-between bg-white/40">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-9 h-9 rounded-xl bg-[#F5F4FD] flex items-center justify-center text-[#606CF3]">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2 8l6-4 6 4-6 4-6-4zM2 16l6-4 6 4-6 4-6-4zM14 12l6-4 6 4-6 4-6-4z"/><path d="M2 8v8M14 12v8"/></svg>
                </div>
                <div class="min-w-0">
                  <h3 class="text-[14px] font-bold text-[#2D325A] truncate">{{ selectedKb.name }}</h3>
                  <p v-if="selectedKb.describe" class="text-[12px] text-[#7E84A3] mt-0.5 truncate">{{ selectedKb.describe }}</p>
                </div>
                <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold" :class="selectedKb.isPublic ? 'bg-emerald-50 text-emerald-600' : 'bg-[#F5F4FD] text-[#7E84A3]'">
                  <span class="w-1.5 h-1.5 rounded-full" :class="selectedKb.isPublic ? 'bg-emerald-500' : 'bg-[#C7C7D1]'"></span>
                  {{ selectedKb.isPublic ? '公开' : '私有' }}
                </span>
              </div>
              <button @click="openAddFiles" class="flex items-center gap-2 px-4 py-2 rounded-2xl text-[12px] font-semibold bg-[#606CF3] text-white hover:bg-[#5358E0] transition-all duration-200 active:scale-[0.97] shrink-0">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                添加文件
              </button>
            </div>

            <!-- KB Files -->
            <div class="flex-1 overflow-y-auto px-6 py-5">
              <div v-if="kbLoading" class="flex items-center justify-center py-16">
                <div class="w-7 h-7 rounded-full border-[3px] border-[#E6E5F5] border-t-[#606CF3] animate-spin"></div>
              </div>
              <div v-else-if="!selectedKb.knowledgeBaseFileList?.length" class="flex flex-col items-center justify-center py-20 gap-4">
                <div class="w-14 h-14 rounded-2xl bg-[#F5F4FD] border border-[#E6E5F5] flex items-center justify-center">
                  <svg class="w-6 h-6 text-[#C7C7D1]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
                </div>
                <p class="text-sm font-semibold text-[#7E84A3]">暂无文件</p>
                <button @click="openAddFiles" class="text-[13px] text-[#606CF3] hover:text-[#5358E0] font-semibold underline underline-offset-2">从已有文件添加</button>
              </div>
              <div v-else class="space-y-2">
                <div class="text-[12px] font-semibold text-[#7E84A3] mb-3">{{ selectedKb.knowledgeBaseFileList?.length || 0 }} 个文件</div>
                <div v-for="(f, idx) in selectedKb.knowledgeBaseFileList" :key="f.id + '-' + idx"
                  @click="openPreview(f)"
                  class="flex items-start gap-3.5 px-4 py-3.5 rounded-2xl bg-white border border-[#E6E5F5] cursor-pointer transition-all duration-200 hover:border-[#D0D0E8] hover:shadow-[0_4px_16px_rgba(96,108,243,0.06)] hover:scale-[1.01] active:scale-[0.99] last:mb-0"
                >
                  <div class="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center text-base" :class="getIconBg(f.extension)">
                    <svg v-if="getFileIcon(f.extension) === 'markdown'" class="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M4 7v10l4-4 4 4V7"/><path d="M16 7v10l4-4 4 4V7"/>
                    </svg>
                    <svg v-else-if="getFileIcon(f.extension) === 'image'" class="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="2"/><path d="M21 15l-5-5L5 21"/>
                    </svg>
                    <svg v-else-if="getFileIcon(f.extension) === 'html'" class="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                    </svg>
                    <svg v-else class="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/>
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-[13px] font-semibold text-[#2D325A] truncate">{{ f.fileName }}</div>
                    <div class="flex items-center gap-2 text-[11px] text-[#7E84A3] mt-0.5">
                      <span>{{ formatFileSize(f.fileSize) }}</span>
                      <span class="text-[#E6E5F5]">·</span>
                      <span>{{ fmtDate(f.createTime) }}</span>
                    </div>
                    <div class="flex items-center gap-2 mt-1.5">
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        :class="f.uploadStatus === 'SUCCESS' ? 'bg-emerald-50 text-emerald-600' : f.uploadStatus === 'PROCESSING' ? 'bg-amber-50 text-amber-600' : f.uploadStatus === 'FAILED' ? 'bg-red-50 text-red-500' : 'bg-stone-50 text-stone-400'"
                      >
                        <span class="w-1.5 h-1.5 rounded-full"
                          :class="f.uploadStatus === 'SUCCESS' ? 'bg-emerald-500' : f.uploadStatus === 'PROCESSING' ? 'bg-amber-500 animate-pulse' : f.uploadStatus === 'FAILED' ? 'bg-red-500' : 'bg-stone-300'"
                        ></span>
                        {{ { SUCCESS: '完成', PROCESSING: '处理中', FAILED: '失败' }[f.uploadStatus] || f.uploadStatus }}
                      </span>
                      <span v-if="f.failReason" class="text-[11px] text-red-400 font-medium">{{ f.failReason }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>

    <!-- ====== Create KB Modal ====== -->
    <transition name="cute-modal">
      <div v-if="showCreateKb" class="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
        <div @click="showCreateKb = false" class="absolute inset-0 bg-black/10 backdrop-blur-sm cursor-pointer"></div>
        <div @click.stop class="relative w-[380px] bg-white rounded-2xl shadow-[0_8px_32px_rgba(45,50,90,0.12)] border border-[#E6E5F5] overflow-hidden">
          <div class="px-6 py-4 border-b border-[#E6E5F5] flex items-center justify-between">
            <h3 class="text-[15px] font-bold text-[#2D325A]">新建知识库</h3>
            <button @click="showCreateKb = false" class="w-7 h-7 rounded-lg flex items-center justify-center text-[#C7C7D1] hover:text-[#7E84A3] hover:bg-[#F5F4FD] transition-all"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12"/></svg></button>
          </div>
          <div class="p-6 space-y-4">
            <div>
              <label class="block text-[12px] font-semibold text-[#555770] mb-1.5">名称 <span class="text-[#FF6B6B]">*</span></label>
              <input v-model="kbForm.name" type="text" placeholder="知识库名称" class="w-full px-3.5 py-2.5 rounded-xl border border-[#E6E5F5] text-sm text-[#2D325A] placeholder-[#C7C7D1] bg-white focus:outline-none focus:border-[#606CF3] focus:ring-2 focus:ring-[#606CF3]/10 transition-all" />
            </div>
            <div>
              <label class="block text-[12px] font-semibold text-[#555770] mb-1.5">描述</label>
              <textarea v-model="kbForm.describe" rows="2" placeholder="为知识库添加一段描述..." class="w-full px-3.5 py-2.5 rounded-xl border border-[#E6E5F5] text-sm text-[#2D325A] placeholder-[#C7C7D1] bg-white focus:outline-none focus:border-[#606CF3] focus:ring-2 focus:ring-[#606CF3]/10 transition-all resize-none"></textarea>
            </div>
            <label class="flex items-center gap-3 cursor-pointer pt-1">
              <button type="button" role="switch" :aria-checked="kbForm.isPublic" @click="kbForm.isPublic = !kbForm.isPublic"
                class="relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none"
                :class="kbForm.isPublic ? 'bg-[#606CF3]' : 'bg-[#E6E5F5]'"
              ><span class="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200" :class="kbForm.isPublic ? 'translate-x-4' : 'translate-x-0'" /></button>
              <span class="text-[13px] font-semibold text-[#555770]">公开知识库</span>
            </label>
          </div>
          <div class="flex items-center justify-end gap-2.5 px-6 py-4 bg-[#F5F4FD] border-t border-[#E6E5F5]">
            <button @click="showCreateKb = false" class="px-4 py-2 rounded-xl text-[12px] font-semibold text-[#7E84A3] hover:text-[#2D325A] hover:bg-white transition-all">取消</button>
            <button @click="saveKb" :disabled="creating || !kbForm.name.trim()"
              class="px-5 py-2 rounded-xl text-[12px] font-semibold text-white transition-all duration-200"
              :class="creating || !kbForm.name.trim() ? 'bg-[#C7C7D1] cursor-not-allowed' : 'bg-[#606CF3] hover:bg-[#5358E0] active:scale-[0.97]'"
            >{{ creating ? '创建中...' : '创建' }}</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- ====== Add Files Modal ====== -->
    <transition name="cute-modal">
      <div v-if="showAddFiles" class="fixed inset-0 z-50 flex items-start justify-center pt-[8vh]">
        <div @click="showAddFiles = false" class="absolute inset-0 bg-black/10 backdrop-blur-sm cursor-pointer"></div>
        <div @click.stop class="relative w-[520px] bg-white rounded-2xl shadow-[0_8px_32px_rgba(45,50,90,0.12)] border border-[#E6E5F5] max-h-[75vh] flex flex-col overflow-hidden">
          <div class="px-6 py-4 border-b border-[#E6E5F5] flex items-center justify-between shrink-0">
            <h3 class="text-[15px] font-bold text-[#2D325A]">选择文件</h3>
            <button @click="showAddFiles = false" class="w-7 h-7 rounded-lg flex items-center justify-center text-[#C7C7D1] hover:text-[#7E84A3] hover:bg-[#F5F4FD] transition-all"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12"/></svg></button>
          </div>
          <div class="flex-1 overflow-y-auto p-3">
            <div v-if="allFiles.length === 0" class="py-14 text-center text-sm font-medium text-[#C7C7D1]">暂无文件，请在「全部文件」中上传</div>
            <div v-else class="space-y-1">
              <div v-for="file in allFiles" :key="file.id"
                @click="!fileInCurrentKb(String(file.id)) && toggleFileSelection(String(file.id))"
                class="flex items-center gap-3.5 px-4 py-2.5 rounded-xl cursor-pointer transition-all duration-200"
                :class="selectedFileIds.has(String(file.id)) ? 'bg-[#F5F4FD]' : !fileInCurrentKb(String(file.id)) ? 'hover:bg-[#F5F4FD]/50' : ''"
                :style="fileInCurrentKb(String(file.id)) ? 'opacity:0.4;cursor:default' : ''"
              >
                <div class="w-4.5 h-4.5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all duration-200"
                  :class="fileInCurrentKb(String(file.id)) ? 'border-[#E6E5F5] bg-[#F5F4FD]' : selectedFileIds.has(String(file.id)) ? 'border-[#606CF3] bg-[#606CF3]' : 'border-[#D0D0E8]'"
                >
                  <svg v-if="selectedFileIds.has(String(file.id))" class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
                  <svg v-else-if="fileInCurrentKb(String(file.id))" class="w-3 h-3 text-[#C7C7D1]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                </div>
                <div class="w-8 h-8 rounded-xl shrink-0 flex items-center justify-center text-sm" :class="getIconBg(file.extension)">
                  <svg v-if="getFileIcon(file.extension) === 'markdown'" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 7v10l4-4 4 4V7"/><path d="M16 7v10l4-4 4 4V7"/></svg>
                  <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[13px] font-semibold text-[#2D325A] truncate" :class="fileInCurrentKb(String(file.id)) ? 'text-[#C7C7D1]' : ''">{{ file.fileName }}</div>
                  <div class="text-[11px] text-[#7E84A3] mt-0.5">{{ formatFileSize(file.fileSize) }}</div>
                </div>
                <span v-if="fileInCurrentKb(String(file.id))" class="text-[11px] font-semibold text-[#C7C7D1]">已添加</span>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-end gap-2.5 px-6 py-4 bg-[#F5F4FD] border-t border-[#E6E5F5] shrink-0">
            <button @click="showAddFiles = false" class="px-4 py-2 rounded-xl text-[12px] font-semibold text-[#7E84A3] hover:text-[#2D325A] hover:bg-white transition-all">取消</button>
            <button @click="confirmAddFiles" :disabled="selectedFileIds.size === 0 || addingFiles"
              class="px-5 py-2 rounded-xl text-[12px] font-semibold text-white transition-all duration-200"
              :class="selectedFileIds.size === 0 || addingFiles ? 'bg-[#C7C7D1] cursor-not-allowed' : 'bg-[#606CF3] hover:bg-[#5358E0] active:scale-[0.97]'"
            >{{ addingFiles ? '添加中...' : `添加所选 (${selectedFileIds.size})` }}</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- ====== File Preview Modal (Glassmorphism) ====== -->
    <transition name="preview">
      <div v-if="previewFile" class="fixed inset-0 z-50 flex items-center justify-center p-6 md:p-10">
        <div @click="closePreview" class="absolute inset-0 bg-[#2D325A]/30 backdrop-blur-sm cursor-pointer"></div>
        <div @click.stop class="relative w-full max-w-4xl max-h-[85vh] bg-white/95 backdrop-blur-xl rounded-2xl shadow-[0_16px_48px_rgba(45,50,90,0.2)] border border-white/60 flex flex-col overflow-hidden">
          <!-- Preview Header -->
          <div class="shrink-0 px-6 py-4 border-b border-[#E6E5F5] flex items-center justify-between">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center" :class="getIconBg(previewFile.extension)">
                <svg v-if="getFileIcon(previewFile.extension) === 'markdown'" class="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 7v10l4-4 4 4V7"/><path d="M16 7v10l4-4 4 4V7"/></svg>
                <svg v-else-if="getFileIcon(previewFile.extension) === 'image'" class="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="2"/><path d="M21 15l-5-5L5 21"/></svg>
                <svg v-else class="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
              </div>
              <div class="min-w-0">
                <h3 class="text-[14px] font-bold text-[#2D325A] truncate">{{ previewFile.fileName }}</h3>
                <p class="text-[12px] text-[#7E84A3]">{{ formatFileSize(previewFile.fileSize) }}</p>
              </div>
            </div>
            <button @click="closePreview" class="w-8 h-8 rounded-xl flex items-center justify-center text-[#7E84A3] hover:text-[#2D325A] hover:bg-[#F5F4FD] transition-all duration-200">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <!-- Preview Body -->
          <div class="flex-1 overflow-y-auto bg-[#Faf9fd]">
            <!-- Loading -->
            <div v-if="previewLoading && isTextFile(previewFile.extension) && !isImageFile(previewFile.extension)" class="flex items-center justify-center py-20">
              <div class="flex flex-col items-center gap-3">
                <div class="w-6 h-6 rounded-full border-[3px] border-[#E6E5F5] border-t-[#606CF3] animate-spin"></div>
                <span class="text-sm font-medium text-[#7E84A3]">加载中...</span>
              </div>
            </div>

            <!-- Image -->
            <img v-else-if="isImageFile(previewFile.extension)"
              :src="previewFile.fileUrl"
              :alt="previewFile.fileName"
              class="max-w-full max-h-[70vh] mx-auto p-6 object-contain"
            />

            <!-- Markdown rendered -->
            <div v-else-if="isMarkdownFile(previewFile.extension) && previewRenderedHtml" class="p-6 markdown-preview" v-html="previewRenderedHtml">
            </div>

            <!-- HTML iframe -->
            <iframe v-else-if="isHtmlFile(previewFile.extension) && previewContent"
              :srcdoc="previewContent"
              class="w-full h-[65vh] border-0"
              sandbox="allow-same-origin"
              title="HTML Preview"
            ></iframe>

            <!-- Text fallback -->
            <pre v-else-if="previewContent" class="p-6 text-sm text-[#2D325A] leading-relaxed whitespace-pre-wrap font-mono">{{ previewContent }}</pre>

            <!-- Unsupported / download -->
            <div v-else-if="!isTextFile(previewFile.extension)" class="flex flex-col items-center justify-center py-20 gap-4">
              <div class="w-14 h-14 rounded-2xl bg-[#F5F4FD] border border-[#E6E5F5] flex items-center justify-center">
                <svg class="w-6 h-6 text-[#C7C7D1]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              </div>
              <a :href="previewFile.fileUrl" target="_blank" class="px-5 py-2.5 rounded-2xl text-[13px] font-semibold bg-[#606CF3] text-white hover:bg-[#5358E0] transition-all duration-200 inline-flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                下载文件
              </a>
            </div>

            <!-- No content yet (text files that haven't loaded) -->
            <div v-else class="flex items-center justify-center py-20">
              <span class="text-sm text-[#7E84A3]">点击加载内容</span>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </main>
</template>

<style scoped>
/* Cute Modal Transition */
.cute-modal-enter-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.cute-modal-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.cute-modal-enter-from,
.cute-modal-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-8px);
}

/* Preview Modal Transition */
.preview-enter-active {
  transition: opacity 0.25s ease;
}
.preview-leave-active {
  transition: opacity 0.2s ease;
}
.preview-enter-from,
.preview-leave-to {
  opacity: 0;
}
.preview-enter-active > div:last-child {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
}
.preview-leave-active > div:last-child {
  transition: transform 0.18s ease, opacity 0.18s ease;
}
.preview-enter-from > div:last-child {
  transform: scale(0.92) translateY(12px);
  opacity: 0;
}
.preview-leave-to > div:last-child {
  transform: scale(0.96) translateY(6px);
  opacity: 0;
}

/* Markdown preview styles */
.markdown-preview h1 { font-size: 1.5em; font-weight: 700; margin: 1em 0 0.5em; color: #2D325A; }
.markdown-preview h2 { font-size: 1.25em; font-weight: 700; margin: 1em 0 0.4em; color: #2D325A; }
.markdown-preview h3 { font-size: 1.1em; font-weight: 600; margin: 0.8em 0 0.3em; color: #2D325A; }
.markdown-preview p { margin-bottom: 0.6em; line-height: 1.7; color: #444; }
.markdown-preview ul, .markdown-preview ol { margin-bottom: 0.6em; padding-left: 1.5em; }
.markdown-preview li { margin-bottom: 0.2em; }
.markdown-preview code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85em;
  padding: 0.15em 0.4em;
  border-radius: 6px;
  background: #F5F4FD;
  color: #606CF3;
}
.markdown-preview pre {
  margin: 0.8em 0;
  padding: 1em;
  border-radius: 12px;
  background: #F5F4FD;
  border: 1px solid #E6E5F5;
  overflow-x: auto;
}
.markdown-preview pre code {
  background: none;
  padding: 0;
  color: #2D325A;
}
.markdown-preview blockquote {
  border-left: 3px solid #606CF3;
  padding-left: 1em;
  margin: 0.6em 0;
  color: #7E84A3;
}
.markdown-preview a { color: #606CF3; text-decoration: underline; }
.markdown-preview hr { border: none; border-top: 1px solid #E6E5F5; margin: 1.2em 0; }
.markdown-preview table { border-collapse: collapse; width: 100%; margin: 0.6em 0; font-size: 0.875em; }
.markdown-preview th, .markdown-preview td { border: 1px solid #E6E5F5; padding: 0.4em 0.6em; text-align: left; }
.markdown-preview th { background: #F5F4FD; font-weight: 600; color: #2D325A; }
.markdown-preview img { max-width: 100%; border-radius: 12px; }
</style>
