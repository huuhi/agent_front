<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { formatFileSize, mapFileType, ALLOWED_EXTENSIONS, validateFile } from '../utils/helpers'
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
const isImageFile = (ext: string) => ['jpg','jpeg','png','gif','webp','svg','bmp','ico'].includes(ext.toLowerCase())

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}

function getExtColor(ext: string): string {
  const c: Record<string, string> = {
    pdf: 'bg-red-100 text-red-700', doc: 'bg-blue-100 text-blue-700', docx: 'bg-blue-100 text-blue-700',
    xls: 'bg-emerald-100 text-emerald-700', xlsx: 'bg-emerald-100 text-emerald-700',
    ppt: 'bg-orange-100 text-orange-700', pptx: 'bg-orange-100 text-orange-700',
    jpg: 'bg-rose-100 text-rose-700', jpeg: 'bg-rose-100 text-rose-700', png: 'bg-rose-100 text-rose-700',
    gif: 'bg-pink-100 text-pink-700', webp: 'bg-rose-100 text-rose-700', svg: 'bg-rose-100 text-rose-700',
    json: 'bg-amber-100 text-amber-700', xml: 'bg-amber-100 text-amber-700', yaml: 'bg-amber-100 text-amber-700',
    yml: 'bg-amber-100 text-amber-700', csv: 'bg-emerald-100 text-emerald-700',
    md: 'bg-sky-100 text-sky-700', txt: 'bg-stone-100 text-stone-700',
    html: 'bg-indigo-100 text-indigo-700', css: 'bg-violet-100 text-violet-700',
    js: 'bg-yellow-100 text-yellow-700', ts: 'bg-blue-100 text-blue-700',
    py: 'bg-blue-100 text-blue-700', java: 'bg-red-100 text-red-700',
    go: 'bg-cyan-100 text-cyan-700', rs: 'bg-orange-100 text-orange-700',
  }
  return c[ext.toLowerCase()] || 'bg-stone-100 text-stone-600'
}

function openPreview(file: AttachedFileVO) {
  previewFile.value = file
}

function closePreview() {
  previewFile.value = null
}

// ── Knowledge ──
const knowledgeBases = ref<KnowledgeVO[]>([])
const selectedKb = ref<KnowledgeDetailVO | null>(null)
const kbLoading = ref(false)


const showCreateKb = ref(false)
const kbForm = ref({ name: '', describe: '', isPublic: false })
const creating = ref(false)

const showAddFiles = ref(false)
const selectedFileIds = ref<Set<number>>(new Set())
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

function toggleFileSelection(id: number) {
  const s = new Set(selectedFileIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selectedFileIds.value = s
}

function fileInCurrentKb(fileId: number): boolean {
  return selectedKb.value?.knowledgeBaseFileList?.some((f: { id: number }) => f.id === fileId) ?? false
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
  <main class="flex-1 flex flex-col min-w-0 bg-white">
    <!-- Header -->
    <header class="h-12 min-h-[56px] border-b border-stone-100 bg-white/80 backdrop-blur-sm flex items-center justify-between px-4 shrink-0">
      <div class="flex items-center gap-2">
        <button @click="sidebarCollapsed = !sidebarCollapsed" class="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-all" :title="sidebarCollapsed ? '展开' : '收起'">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
      </div>
      <div class="flex items-center gap-1 bg-stone-100 rounded-lg p-0.5">
        <button @click="activeTab = 'files'" class="px-3 py-1.5 text-[12px] font-medium rounded-lg transition-colors" :class="activeTab === 'files' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'">全部文件</button>
        <button @click="activeTab = 'knowledge'" class="px-3 py-1.5 text-[12px] font-medium rounded-lg transition-colors" :class="activeTab === 'knowledge' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'">知识库</button>
      </div>
      <div class="w-7"></div>
    </header>

    <template v-if="loading">
      <div class="flex-1 flex items-center justify-center">
        <div class="flex items-center gap-2"><div class="w-4 h-4 rounded-full border-2 border-stone-200 border-t-stone-400 animate-spin"></div><span class="text-xs text-stone-400">加载中...</span></div>
      </div>
    </template>
    <template v-else-if="error">
      <div class="flex-1 flex items-center justify-center px-4"><div class="px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">{{ error }}</div></div>
    </template>

    <template v-else>
      <!-- ======================== FILES TAB ======================== -->
      <div v-show="activeTab === 'files'" class="flex-1 flex flex-col min-h-0">
        <div class="flex items-center gap-3 px-5 py-3 border-b border-stone-100">
          <div class="relative flex-1">
            <svg class="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input v-model="searchQuery" type="text" placeholder="搜索文件..." class="w-full pl-9 pr-3 py-1.5 rounded-lg border border-stone-200 text-[12px] placeholder-stone-300 focus:outline-none focus:border-stone-400 transition-colors" />
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
          <label class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors shrink-0" :class="uploading ? 'opacity-50 pointer-events-none' : ''">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4"/></svg>
            {{ uploading ? '上传中...' : '上传' }}
            <input type="file" hidden :disabled="uploading" :accept="acceptTypes" @change="onUpload" />
          </label>
          <span class="text-[11px] text-stone-400 shrink-0 tabular-nums whitespace-nowrap">{{ filteredFiles.length }} / {{ allFiles.length }}</span>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-3">
          <!-- Empty -->
          <div v-if="allFiles.length === 0" class="flex flex-col items-center justify-center py-20 gap-3">
            <div class="w-12 h-12 rounded-xl bg-stone-50 border border-stone-100 flex items-center justify-center">
              <svg class="w-5 h-5 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
            </div>
            <p class="text-sm font-medium text-stone-500">暂无文件</p>
            <label class="px-4 py-2 rounded-lg text-xs font-medium border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors cursor-pointer">上传第一个文件<input type="file" hidden :accept="acceptTypes" @change="onUpload" /></label>
          </div>
          <div v-else-if="filteredFiles.length === 0" class="flex flex-col items-center justify-center py-16 gap-2">
            <p class="text-sm text-stone-500">没有匹配的文件</p>
            <button @click="searchQuery = ''; bizTypeFilter = 'all'" class="text-xs text-stone-400 hover:text-stone-600 underline">清除筛选</button>
          </div>

          <!-- File grid -->
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            <div v-for="file in filteredFiles" :key="file.id"
              @click="openPreview(file)"
              class="flex flex-col gap-2 px-3 py-3 rounded-lg border border-stone-100 hover:border-stone-200 hover:shadow-sm transition-all cursor-pointer group"
            >
              <div class="flex items-start gap-3">
                <!-- Extension badge -->
                <div class="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-[10px] font-bold uppercase leading-none tracking-tight"
                  :class="getExtColor(file.extension)"
                >{{ file.extension.slice(0, 4) }}</div>
                <div class="flex-1 min-w-0">
                  <div class="text-[12px] font-medium text-stone-800 truncate leading-tight">{{ file.fileName }}</div>
                  <div class="flex items-center gap-2 text-[10px] text-stone-400 mt-0.5">
                    <span>{{ formatFileSize(file.fileSize) }}</span>
                    <span>·</span>
                    <span>{{ fmtDate(file.createTime) }}</span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-1.5">
                <span v-if="file.uploadStatus === 'SUCCESS'"
                  class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-medium"
                >已完成</span>
                <span v-else-if="file.uploadStatus"
                  class="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium"
                >{{ file.uploadStatus }}</span>
                <span v-if="file.bizType"
                  class="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 font-medium"
                >{{ file.bizType === 'KNOWLEDGE' ? '知识库' : '聊天' }}</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- ==================== KNOWLEDGE TAB ==================== -->
      <div v-show="activeTab === 'knowledge'" class="flex-1 flex min-h-0">
        <aside class="w-[180px] shrink-0 border-r border-stone-100 flex flex-col bg-stone-50/50">
          <div class="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
            <span class="text-[10px] font-semibold text-stone-500 uppercase tracking-widest">知识库</span>
            <button @click="openCreateKb" class="p-1 rounded text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4"/></svg>
            </button>
          </div>
          <div class="flex-1 overflow-y-auto py-1">
            <div v-if="knowledgeBases.length === 0" class="px-4 py-8 text-center text-[11px] text-stone-400">暂无</div>
            <button v-for="kb in knowledgeBases" :key="kb.id" @click="selectKb(kb)"
              class="w-full text-left px-4 py-2 text-[12px] transition-colors border-l-2"
              :class="selectedKb?.id === kb.id ? 'border-stone-800 bg-white text-stone-800 font-medium' : 'border-transparent text-stone-500 hover:text-stone-700 hover:bg-white/50'"
            ><div class="truncate">{{ kb.name }}</div></button>
          </div>
        </aside>

        <div class="flex-1 flex flex-col min-w-0">
          <div v-if="!selectedKb" class="flex-1 flex items-center justify-center"><p class="text-sm text-stone-400">选择一个知识库</p></div>
          <template v-else>
            <div class="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
              <div class="flex items-center gap-3 min-w-0">
                <div>
                  <h3 class="text-sm font-semibold text-stone-800">{{ selectedKb.name }}</h3>
                  <p v-if="selectedKb.describe" class="text-[11px] text-stone-400 mt-0.5">{{ selectedKb.describe }}</p>
                </div>
                <span class="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0" :class="selectedKb.isPublic ? 'bg-emerald-50 text-emerald-600' : 'bg-stone-100 text-stone-500'">{{ selectedKb.isPublic ? '公开' : '私有' }}</span>
              </div>
              <button @click="openAddFiles" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors shrink-0">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4"/></svg>添加文件
              </button>
            </div>

            <div class="flex-1 overflow-y-auto px-5 py-4">
              <div v-if="kbLoading" class="flex items-center justify-center py-12"><div class="w-4 h-4 rounded-full border-2 border-stone-200 border-t-stone-400 animate-spin"></div></div>
              <div v-else-if="!selectedKb.knowledgeBaseFileList?.length" class="flex flex-col items-center justify-center py-16 gap-3">
                <div class="w-10 h-10 rounded-lg bg-stone-50 border border-stone-100 flex items-center justify-center"><svg class="w-4 h-4 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg></div>
                <p class="text-xs text-stone-500">暂无文件</p>
                <button @click="openAddFiles" class="text-[11px] text-stone-400 hover:text-stone-600 underline">从已有文件添加</button>
              </div>
              <div v-else class="space-y-1">
                <div class="text-[11px] text-stone-400 mb-3">{{ selectedKb.knowledgeBaseFileList?.length || 0 }} 个文件</div>
                <div v-for="(f, idx) in selectedKb.knowledgeBaseFileList" :key="f.id + '-' + idx" class="flex items-start gap-3 py-3 border-b border-stone-50 last:border-0">
                  <div class="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-[10px] font-bold uppercase"
                    :class="getExtColor(f.extension)"
                  >{{ f.extension.slice(0, 4) }}</div>
                  <div class="flex-1 min-w-0">
                    <div class="text-[12px] font-medium text-stone-700 truncate">{{ f.fileName }}</div>
                    <div class="flex items-center gap-1.5 text-[10px] text-stone-400 mt-1">
                      <span>{{ formatFileSize(f.fileSize) }}</span>
                      <span>·</span>
                      <span>{{ fmtDate(f.createTime) }}</span>
                    </div>
                    <div class="flex items-center gap-1.5 mt-1">
                      <span class="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        :class="f.uploadStatus === 'SUCCESS' ? 'bg-emerald-50 text-emerald-600' : f.uploadStatus === 'PROCESSING' ? 'bg-amber-50 text-amber-600' : f.uploadStatus === 'FAILED' ? 'bg-red-50 text-red-600' : 'bg-stone-100 text-stone-500'"
                      >{{ { SUCCESS: '完成', PROCESSING: '处理中', FAILED: '失败' }[f.uploadStatus] || f.uploadStatus }}</span>
                      <span v-if="f.failReason" class="text-[10px] text-red-400">{{ f.failReason }}</span>
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
    <transition name="modal">
      <div v-if="showCreateKb" class="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
        <div @click="showCreateKb = false" class="absolute inset-0 bg-black/15 cursor-pointer"></div>
        <div @click.stop class="relative w-[360px] bg-white rounded-xl shadow-lg border border-stone-200 overflow-hidden">
          <div class="px-5 py-3 border-b border-stone-100"><h3 class="text-sm font-semibold text-stone-800">新建知识库</h3></div>
          <div class="p-5 space-y-4">
            <div>
              <label class="block text-[11px] font-medium text-stone-600 mb-1">名称 <span class="text-red-400">*</span></label>
              <input v-model="kbForm.name" type="text" placeholder="知识库名称" class="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm placeholder-stone-300 focus:outline-none focus:border-stone-400" />
            </div>
            <div>
              <label class="block text-[11px] font-medium text-stone-600 mb-1">描述</label>
              <textarea v-model="kbForm.describe" rows="2" placeholder="选填" class="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm placeholder-stone-300 focus:outline-none focus:border-stone-400 resize-none"></textarea>
            </div>
            <label class="flex items-center gap-3 cursor-pointer pt-1">
              <button type="button" role="switch" :aria-checked="kbForm.isPublic" @click="kbForm.isPublic = !kbForm.isPublic"
                class="relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none"
                :class="kbForm.isPublic ? 'bg-stone-800' : 'bg-stone-200'"
              ><span class="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition" :class="kbForm.isPublic ? 'translate-x-4' : 'translate-x-0'" /></button>
              <span class="text-xs font-medium text-stone-600">公开知识库</span>
            </label>
          </div>
          <div class="flex items-center justify-end gap-2 px-5 py-3 bg-stone-50 border-t border-stone-100">
            <button @click="showCreateKb = false" class="px-3 py-1.5 rounded-lg text-[11px] font-medium text-stone-500 hover:text-stone-700 hover:bg-stone-100">取消</button>
            <button @click="saveKb" :disabled="creating || !kbForm.name.trim()"
              class="px-4 py-1.5 rounded-lg text-[11px] font-medium text-white"
              :class="creating || !kbForm.name.trim() ? 'bg-stone-300 cursor-not-allowed' : 'bg-stone-800 hover:bg-stone-900'"
            >{{ creating ? '创建中...' : '创建' }}</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- ====== Add Files Modal ====== -->
    <transition name="modal">
      <div v-if="showAddFiles" class="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
        <div @click="showAddFiles = false" class="absolute inset-0 bg-black/15 cursor-pointer"></div>
        <div @click.stop class="relative w-[500px] bg-white rounded-xl shadow-lg border border-stone-200 max-h-[70vh] flex flex-col overflow-hidden">
          <div class="px-5 py-3 border-b border-stone-100 flex items-center justify-between shrink-0">
            <h3 class="text-sm font-semibold text-stone-800">选择文件</h3>
            <button @click="showAddFiles = false" class="p-1 rounded text-stone-300 hover:text-stone-500 hover:bg-stone-100"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12"/></svg></button>
          </div>
          <div class="flex-1 overflow-y-auto p-3">
            <div v-if="allFiles.length === 0" class="py-12 text-center text-sm text-stone-400">暂无文件，请在「全部文件」中上传</div>
            <div v-else class="space-y-0.5">
              <div v-for="file in allFiles" :key="file.id"
                @click="!fileInCurrentKb(Number(file.id)) && toggleFileSelection(Number(file.id))"
                class="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm"
                :class="selectedFileIds.has(Number(file.id)) ? 'bg-stone-100' : !fileInCurrentKb(Number(file.id)) ? 'hover:bg-stone-50' : ''"
                :style="fileInCurrentKb(Number(file.id)) ? 'opacity:0.4;cursor:default' : ''"
              >
                <div class="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0"
                  :class="fileInCurrentKb(Number(file.id)) ? 'border-stone-200 bg-stone-100' : selectedFileIds.has(Number(file.id)) ? 'border-stone-800 bg-stone-800' : 'border-stone-300'"
                >
                  <svg v-if="selectedFileIds.has(Number(file.id))" class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
                  <svg v-else-if="fileInCurrentKb(Number(file.id))" class="w-3 h-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                </div>
                <div class="w-7 h-7 rounded flex items-center justify-center shrink-0 text-[9px] font-bold uppercase bg-stone-50 border border-stone-100" :class="getExtColor(file.extension)">{{ file.extension.slice(0, 3) }}</div>
                <div class="flex-1 min-w-0">
                  <div class="text-[12px] text-stone-800 truncate" :class="fileInCurrentKb(Number(file.id)) ? 'text-stone-400' : ''">{{ file.fileName }}</div>
                  <div class="text-[10px] text-stone-400 mt-0.5">{{ formatFileSize(file.fileSize) }}</div>
                </div>
                <span v-if="fileInCurrentKb(Number(file.id))" class="text-[10px] text-stone-400">已添加</span>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-end gap-2 px-5 py-3 bg-stone-50 border-t border-stone-100 shrink-0">
            <button @click="showAddFiles = false" class="px-3 py-1.5 rounded-lg text-[11px] font-medium text-stone-500 hover:text-stone-700 hover:bg-stone-100">取消</button>
            <button @click="confirmAddFiles" :disabled="selectedFileIds.size === 0 || addingFiles"
              class="px-4 py-1.5 rounded-lg text-[11px] font-medium text-white"
              :class="selectedFileIds.size === 0 || addingFiles ? 'bg-stone-300 cursor-not-allowed' : 'bg-stone-800 hover:bg-stone-900'"
            >{{ addingFiles ? '添加中...' : `添加所选 (${selectedFileIds.size})` }}</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- ====== File Preview Modal ====== -->
    <transition name="modal">
      <div v-if="previewFile" class="fixed inset-0 z-50 flex items-center justify-center p-8">
        <div @click="closePreview" class="absolute inset-0 bg-black/40 cursor-pointer"></div>
        <div @click.stop class="relative max-w-3xl w-full max-h-[85vh] bg-white rounded-xl shadow-xl border border-stone-200 flex flex-col overflow-hidden">
          <!-- Preview header -->
          <div class="px-5 py-3 border-b border-stone-100 flex items-center justify-between shrink-0">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-[10px] font-bold uppercase" :class="getExtColor(previewFile.extension)">{{ previewFile.extension.slice(0, 4) }}</div>
              <div class="min-w-0">
                <h3 class="text-sm font-semibold text-stone-800 truncate">{{ previewFile.fileName }}</h3>
                <p class="text-[11px] text-stone-400">{{ formatFileSize(previewFile.fileSize) }}</p>
              </div>
            </div>
            <button @click="closePreview" class="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <!-- Preview body -->
          <div class="flex-1 overflow-y-auto bg-stone-50/50">
            <!-- Image -->
            <img v-if="isImageFile(previewFile.extension)"
              :src="previewFile.fileUrl"
              :alt="previewFile.fileName"
              class="max-w-full max-h-[70vh] mx-auto p-5 object-contain"
            />

            <!-- Unsupported (text files downloaded by OSS, cannot preview inline) -->
            <div v-else class="flex flex-col items-center justify-center py-16 gap-3">
              <div class="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center">
                <svg class="w-6 h-6 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              </div>
              <a :href="previewFile.fileUrl" target="_blank" class="text-sm text-stone-500 hover:text-stone-700 underline">下载文件</a>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </main>
</template>
