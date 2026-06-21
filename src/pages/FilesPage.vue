<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { formatFileSize, ALLOWED_EXTENSIONS, validateFile } from '../utils/helpers'
import { useToast } from '../composables/useToast'
import { uploadKnowledgeFileBinary, fetchUserFiles } from '../api'
import type { AttachedFileVO } from '../api/types'
import CustomSelect from '../components/CustomSelect.vue'
import FilePreviewModal from '../components/FilePreviewModal.vue'

const { show: showToast } = useToast()

const allFiles = ref<AttachedFileVO[]>([])
const loading = ref(true)
const uploading = ref(false)
const searchQuery = ref('')
const bizTypeFilter = ref<'all' | 'KNOWLEDGE' | 'CHAT'>('all')
const acceptTypes = '.' + ALLOWED_EXTENSIONS.join(',.')
const error = ref('')

const filteredFiles = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return allFiles.value
  return allFiles.value.filter(f =>
    f.fileName.toLowerCase().includes(q) || f.extension.toLowerCase().includes(q)
  )
})

const previewFile = ref<AttachedFileVO | null>(null)

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
    markdown: 'bg-[#F3F1FC] text-[#606CF3]',
    text: 'bg-[#F2F2F5] text-[#8A8A9E]',
    html: 'bg-[#F3F1FC] text-[#606CF3]',
    code: 'bg-[#F3F1FC] text-[#606CF3]',
    document: 'bg-[#FAF0F4] text-[#B5849E]',
    image: 'bg-[#F0F4FA] text-[#7C9ABF]',
    file: 'bg-[#F2F2F5] text-[#8A8A9E]',
  }
  return bgMap[type] || 'bg-[#F2F2F5] text-[#8A8A9E]'
}

function openPreview(file: AttachedFileVO) {
  previewFile.value = file
}

function closePreview() {
  previewFile.value = null
}

async function loadFiles() {
  loading.value = true; error.value = ''
  try {
    allFiles.value = await fetchUserFiles()
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

watch(bizTypeFilter, (bizType) => {
  fetchFiles(bizType === 'all' ? undefined : bizType)
})

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
    bizTypeFilter.value = 'all'
    await fetchFiles()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '上传失败', 'error')
  } finally {
    uploading.value = false; input.value = '' as any
  }
}

onMounted(() => loadFiles())
</script>

<template>
  <main class="flex-1 flex flex-col min-w-0" style="background:#F5F4FD;font-family:'Nunito',sans-serif">
    <!-- ====== Header ====== -->
    <header class="shrink-0 h-14 flex items-center justify-between px-6 bg-white/70 backdrop-blur-md border-b border-[#E6E5F5]">
      <h1 class="text-[15px] font-bold text-[#2D325A]">文件库</h1>
      <span class="text-[12px] text-[#7E84A3] font-medium tabular-nums">{{ filteredFiles.length }} 个文件</span>
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
        <div class="px-5 py-3 rounded-2xl bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#C47B7B] font-medium">{{ error }}</div>
      </div>
    </template>

    <template v-else>
      <div class="flex-1 flex flex-col min-h-0">
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
        </div>

        <!-- File Grid -->
        <div class="flex-1 overflow-y-auto px-6 py-5">
          <!-- Empty states -->
          <div v-if="allFiles.length === 0" class="flex flex-col items-center justify-center py-24 gap-4">
            <div class="w-16 h-16 rounded-2xl bg-[#F5F4FD] border border-[#E6E5F5] flex items-center justify-center">
              <svg class="w-7 h-7 text-[#C7C7D1]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
            </div>
            <p class="text-base font-semibold text-[#7E84A3]">暂无文件</p>
            <label class="px-5 py-2.5 rounded-2xl text-[13px] font-semibold bg-[#606CF3] text-white hover:bg-[#5358E0] cursor-pointer transition-all duration-200 active:scale-[0.97]">上传第一个文件<input type="file" hidden :accept="acceptTypes" @change="onUpload" /></label>
          </div>
          <div v-else-if="filteredFiles.length === 0" class="flex flex-col items-center justify-center py-20 gap-3">
            <div class="w-12 h-12 rounded-2xl bg-[#F5F4FD] border border-[#E6E5F5] flex items-center justify-center">
              <svg class="w-5 h-5 text-[#C7C7D1]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
            <p class="text-sm font-medium text-[#7E84A3]">没有匹配的文件</p>
            <button @click="searchQuery = ''; bizTypeFilter = 'all'" class="text-[13px] text-[#606CF3] hover:text-[#5358E0] font-semibold underline underline-offset-2">清除筛选</button>
          </div>

          <!-- Cards -->
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div v-for="file in filteredFiles" :key="file.id"
              @click="openPreview(file)"
              class="flex flex-col gap-3 px-4 py-4 rounded-2xl bg-white border border-[#E6E5F5] cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-[#D0D0E8] hover:shadow-[0_8px_24px_rgba(96,108,243,0.07)] active:scale-[0.98] group"
            >
              <div class="flex items-start gap-3.5">
                <div class="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-lg transition-all duration-200" :class="getIconBg(file.extension)">
                  <svg v-if="getFileIcon(file.extension) === 'markdown'" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 7v10l4-4 4 4V7"/><path d="M16 7v10l4-4 4 4V7"/>
                  </svg>
                  <svg v-else-if="getFileIcon(file.extension) === 'image'" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="2"/><path d="M21 15l-5-5L5 21"/>
                  </svg>
                  <svg v-else-if="getFileIcon(file.extension) === 'html'" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                  </svg>
                  <svg v-else-if="getFileIcon(file.extension) === 'code'" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                  </svg>
                  <svg v-else-if="getFileIcon(file.extension) === 'document'" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                  <svg v-else class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/>
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
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#ECFDF5] text-[#6DB89A]">
                  <span class="w-1.5 h-1.5 rounded-full bg-[#6DB89A]"></span>已完成
                </span>
                <span v-else-if="file.uploadStatus === 'PROCESSING'"
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#FFFBEB] text-[#C49B5E]">
                  <span class="w-1.5 h-1.5 rounded-full bg-[#C49B5E] animate-pulse"></span>处理中
                </span>
                <span v-else-if="file.uploadStatus === 'FAILED'"
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#FEF2F2] text-[#C47B7B]">
                  <span class="w-1.5 h-1.5 rounded-full bg-[#C47B7B]"></span>失败
                </span>
                <span v-if="file.bizType"
                  class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                  :class="file.bizType === 'KNOWLEDGE' ? 'bg-[#F3F1FC] text-[#606CF3]' : 'bg-[#F0F4FA] text-[#7C9ABF]'"
                >{{ file.bizType === 'KNOWLEDGE' ? '知识库' : '聊天' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- File Preview Modal -->
    <FilePreviewModal
      :file="previewFile"
      :visible="!!previewFile"
      @close="closePreview"
    />
  </main>
</template>
