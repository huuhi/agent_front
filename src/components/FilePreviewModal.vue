<template>
  <Teleport to="body">
    <Transition name="preview">
      <div
        v-if="visible && file"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10"
      >
        <!-- Backdrop -->
        <div
          @click="emit('close')"
          class="absolute inset-0 bg-[#2D325A]/30 backdrop-blur-md cursor-pointer"
        ></div>

        <!-- Modal Card -->
        <div
          @click.stop
          @keydown.escape="emit('close')"
          class="relative w-[70vw] max-w-5xl h-[85vh] max-h-[85vh] bg-white/95 backdrop-blur-xl rounded-2xl shadow-[0_16px_48px_rgba(45,50,90,0.2)] border border-[#E6E5F5]/60 flex flex-col overflow-hidden"
        >
          <!-- ====== Header ====== -->
          <div class="shrink-0 px-6 py-4 border-b border-[#E6E5F5] flex items-center justify-between gap-4">
            <div class="flex items-center gap-3 min-w-0">
              <!-- File type icon badge -->
              <div
                class="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center"
                :class="iconMeta.bg"
              >
                <!-- Image -->
                <svg v-if="iconMeta.type === 'image'" class="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="2"/><path d="M21 15l-5-5L5 21"/>
                </svg>
                <!-- PDF -->
                <svg v-else-if="iconMeta.type === 'pdf'" class="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <path d="M9 15h6"/><path d="M12 12v6"/>
                </svg>
                <!-- Document (Word) -->
                <svg v-else-if="iconMeta.type === 'doc'" class="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                </svg>
                <!-- Spreadsheet (Excel) -->
                <svg v-else-if="iconMeta.type === 'xls'" class="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <path d="M8 13l4 4m0-4l-4 4"/>
                </svg>
                <!-- Code (Markdown / HTML) -->
                <svg v-else-if="iconMeta.type === 'code'" class="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                </svg>
                <!-- Text -->
                <svg v-else class="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>

              <!-- File name + size -->
              <div class="min-w-0">
                <h3 class="text-[14px] font-bold text-[#2D325A] truncate max-w-[40vw]">
                  {{ file.fileName }}
                </h3>
                <p class="text-[12px] text-[#7E84A3] mt-0.5">{{ formatFileSize(file.fileSize) }}</p>
              </div>

              <!-- Ext badge -->
              <span class="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#F5F4FD] text-[#7E84A3] border border-[#E6E5F5]">
                .{{ file.extension }}
              </span>
            </div>

            <!-- Close button -->
            <button
              @click="emit('close')"
              class="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-[#7E84A3] hover:text-[#606CF3] hover:bg-[#F5F4FD] transition-all duration-200"
              title="关闭"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <!-- ====== Body ====== -->
          <div class="flex-1 overflow-y-auto bg-[#FAF9FD] min-h-0">

            <!-- Loading spinner -->
            <div v-if="loading" class="flex items-center justify-center h-full min-h-[200px]">
              <div class="flex flex-col items-center gap-3">
                <div class="w-8 h-8 rounded-full border-[3px] border-[#E6E5F5] border-t-[#606CF3] animate-spin"></div>
                <span class="text-[13px] font-medium text-[#7E84A3]">加载中...</span>
              </div>
            </div>

            <!-- Error -->
            <div v-else-if="errorMsg" class="flex items-center justify-center h-full min-h-[200px]">
              <div class="flex flex-col items-center gap-3 px-6">
                <div class="w-12 h-12 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center">
                  <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
                </div>
                <p class="text-[13px] font-medium text-red-400 text-center">{{ errorMsg }}</p>
                <button @click="retry" class="text-[12px] font-semibold text-[#606CF3] hover:underline underline-offset-2">重试</button>
              </div>
            </div>

            <!-- ====== Image ====== -->
            <img
              v-else-if="isImage(file.extension) && file.fileUrl"
              :src="file.fileUrl"
              :alt="file.fileName"
              class="max-w-full max-h-[70vh] mx-auto p-6 object-contain"
            />

            <!-- ====== PDF (Blob → iframe) ====== -->
            <iframe
              v-else-if="isPdf(file.extension) && pdfBlobUrl"
              :src="pdfBlobUrl"
              class="w-full h-full border-none"
              title="PDF Preview"
            ></iframe>

            <!-- ====== Word (docx-preview renderAsync) ====== -->
            <div
              v-else-if="isDocx(file.extension) && !loading"
              ref="docxContainer"
              class="p-6 docx-wrapper"
            ></div>

            <!-- ====== Excel (SheetJS → HTML table) ====== -->
            <div
              v-else-if="isXlsx(file.extension) && excelHtml"
              class="xlsx-preview p-4 overflow-auto"
              v-html="excelHtml"
            ></div>

            <!-- ====== Markdown (markdown-it) ====== -->
            <div
              v-else-if="isMd(file.extension) && renderedHtml"
              class="p-6 markdown-preview"
              v-html="renderedHtml"
            ></div>

            <!-- ====== HTML (iframe srcdoc) ====== -->
            <iframe
              v-else-if="isHtml(file.extension) && textContent"
              :srcdoc="textContent"
              class="w-full h-full border-0"
              sandbox="allow-same-origin"
              title="HTML Preview"
            ></iframe>

            <!-- ====== Plain text ====== -->
            <pre
              v-else-if="isPlainText(file.extension) && textContent"
              class="p-6 text-sm text-[#2D325A] leading-relaxed whitespace-pre-wrap font-mono"
            >{{ textContent }}</pre>

            <!-- ====== Unsupported ====== -->
            <div v-else-if="!isSupported(file.extension)" class="flex flex-col items-center justify-center h-full min-h-[200px] gap-4">
              <div class="w-14 h-14 rounded-2xl bg-[#F5F4FD] border border-[#E6E5F5] flex items-center justify-center">
                <svg class="w-6 h-6 text-[#C7C7D1]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
              </div>
              <p class="text-sm font-semibold text-[#7E84A3]">此文件类型暂不支持预览</p>
              <p class="text-[12px] text-[#C7C7D1]">.{{ file.extension }} 文件</p>
            </div>

            <!-- Fallback / content not yet loaded (safety net) -->
            <div v-else class="flex items-center justify-center h-full min-h-[200px]">
              <span class="text-sm text-[#C7C7D1]">暂无预览内容</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * FilePreviewModal.vue
 * ──────────────────────────────────────────────────────────
 * Frontend‑only file preview modal.  No file URLs are sent
 * to any third‑party service. All rendering is done locally.
 *
 * Required dependencies:
 *   npm install docx-preview xlsx markdown-it
 *   npm install -D @types/markdown-it
 *
 * Lifecycle:
 *   - PDF    → fetch Blob → URL.createObjectURL → <iframe>
 *   - docx   → fetch Blob → docx-preview.renderAsync
 *   - xlsx   → fetch ArrayBuffer → SheetJS → HTML <table>
 *   - md     → fetch text → markdown-it → HTML
 *   - html   → fetch text → <iframe srcdoc>
 *   - txt    → fetch text → <pre>
 *   - images → direct <img src="fileUrl">
 *
 * Blob URLs are revoked on close / component unmount.
 * ──────────────────────────────────────────────────────────
 */
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import type { AttachedFileVO } from '../api/types'
import { formatFileSize } from '../utils/helpers'

const props = defineProps<{
  file: AttachedFileVO | null
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

// ===================== State =====================

const loading = ref(false)
const errorMsg = ref('')
let retryFile: AttachedFileVO | null = null

// PDF Blob URL (must be revoked)
const pdfBlobUrl = ref<string | null>(null)

// Text content (for html, plain text)
const textContent = ref('')

// Rendered HTML (markdown-it)
const renderedHtml = ref('')

// Rendered Excel HTML (SheetJS sheet_to_html)
const excelHtml = ref('')

// docx-preview container ref
const docxContainer = ref<HTMLDivElement | null>(null)

// ===================== Type helpers =====================

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico']
const PDF_EXTS = ['pdf']
const DOCX_EXTS = ['doc', 'docx']
const XLSX_EXTS = ['xls', 'xlsx']
const MD_EXTS = ['md']
const HTML_EXTS = ['html', 'htm']
const PLAIN_TEXT_EXTS = [
  'txt', 'csv', 'log', 'env', 'sh', 'bat',
  'css', 'scss', 'less',
  'js', 'jsx', 'ts', 'tsx', 'vue',
  'json', 'xml', 'yaml', 'yml',
  'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'hpp',
]

function isImage(ext: string) { return IMAGE_EXTS.includes(ext.toLowerCase()) }
function isPdf(ext: string) { return PDF_EXTS.includes(ext.toLowerCase()) }
function isDocx(ext: string) { return DOCX_EXTS.includes(ext.toLowerCase()) }
function isXlsx(ext: string) { return XLSX_EXTS.includes(ext.toLowerCase()) }
function isMd(ext: string) { return MD_EXTS.includes(ext.toLowerCase()) }
function isHtml(ext: string) { return HTML_EXTS.includes(ext.toLowerCase()) }
function isPlainText(ext: string) {
  const e = ext.toLowerCase()
  return PLAIN_TEXT_EXTS.includes(e) && !MD_EXTS.includes(e) && !HTML_EXTS.includes(e)
}
function isSupported(ext: string) {
  const e = ext.toLowerCase()
  return [...IMAGE_EXTS, ...PDF_EXTS, ...DOCX_EXTS, ...XLSX_EXTS, ...MD_EXTS, ...HTML_EXTS, ...PLAIN_TEXT_EXTS].includes(e)
}

// ===================== Icon meta =====================

const iconMeta = computed(() => {
  if (!props.file) return { type: 'text', bg: 'bg-stone-50 text-stone-400' }
  const e = props.file.extension.toLowerCase()
  if (IMAGE_EXTS.includes(e))  return { type: 'image', bg: 'bg-pink-50 text-pink-500' }
  if (PDF_EXTS.includes(e))    return { type: 'pdf',   bg: 'bg-rose-50 text-rose-500' }
  if (DOCX_EXTS.includes(e))   return { type: 'doc',   bg: 'bg-blue-50 text-blue-500' }
  if (XLSX_EXTS.includes(e))   return { type: 'xls',   bg: 'bg-emerald-50 text-emerald-600' }
  if (MD_EXTS.includes(e))     return { type: 'code',  bg: 'bg-sky-50 text-sky-500' }
  if (HTML_EXTS.includes(e))   return { type: 'code',  bg: 'bg-orange-50 text-orange-500' }
  if (PLAIN_TEXT_EXTS.includes(e)) return { type: 'text', bg: 'bg-stone-50 text-stone-400' }
  return { type: 'text', bg: 'bg-stone-50 text-stone-400' }
})

// ===================== AbortController =====================

let abortController: AbortController | null = null

// ===================== Load & Render =====================

async function loadAndRender(file: AttachedFileVO) {
  cleanup()
  loading.value = true
  errorMsg.value = ''
  retryFile = file

  abortController = new AbortController()
  const signal = abortController.signal
  const ext = file.extension.toLowerCase()

  try {
    // ── Images ──
    if (isImage(ext)) {
      loading.value = false
      return
    }

    // ── PDF: fetch → Blob → objectURL ──
    if (isPdf(ext)) {
      const response = await fetch(file.fileUrl, { signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      pdfBlobUrl.value = URL.createObjectURL(blob)
      loading.value = false
      return
    }

    // ── Word: fetch → Blob → docx-preview.renderAsync ──
    if (isDocx(ext)) {
      const { renderAsync } = await import('docx-preview')
      const response = await fetch(file.fileUrl, { signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      loading.value = false
      // Wait for Vue to render the container
      await nextTick()
      if (docxContainer.value) {
        await renderAsync(blob, docxContainer.value, undefined, {
          className: 'docx-render',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
        })
      }
      return
    }

    // ── Excel: fetch → ArrayBuffer → SheetJS → HTML ──
    if (isXlsx(ext)) {
      const XLSX = await import('xlsx')
      const response = await fetch(file.fileUrl, { signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = await response.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      excelHtml.value = XLSX.utils.sheet_to_html(sheet)
      loading.value = false
      return
    }

    // ── Markdown: fetch → text → markdown-it ──
    if (isMd(ext)) {
      const response = await fetch(file.fileUrl, { signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const raw = await response.text()
      const MarkdownIt = (await import('markdown-it')).default
      const hljs = (await import('highlight.js')).default
      const md = new MarkdownIt({
        html: true,
        linkify: true,
        highlight(str: string, lang: string): string {
          if (lang && hljs.getLanguage(lang)) {
            try {
              return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`
            } catch { /* fall through */ }
          }
          return `<pre class="hljs"><code>${MarkdownIt.prototype.utils?.escapeHtml?.(str) ?? str}</code></pre>`
        },
      })
      renderedHtml.value = md.render(raw)
      loading.value = false
      return
    }

    // ── HTML: fetch → text → iframe srcdoc ──
    if (isHtml(ext)) {
      const response = await fetch(file.fileUrl, { signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      textContent.value = await response.text()
      loading.value = false
      return
    }

    // ── Plain text ──
    if (isPlainText(ext)) {
      const response = await fetch(file.fileUrl, { signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      textContent.value = await response.text()
      loading.value = false
      return
    }

    // Unsupported
    loading.value = false
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    errorMsg.value = e instanceof Error ? e.message : '加载失败'
    loading.value = false
  }
}

// ===================== Retry =====================

function retry() {
  if (retryFile) loadAndRender(retryFile)
}

// ===================== Cleanup =====================

function cleanup() {
  abortController?.abort()
  abortController = null

  if (pdfBlobUrl.value) {
    URL.revokeObjectURL(pdfBlobUrl.value)
    pdfBlobUrl.value = null
  }

  textContent.value = ''
  renderedHtml.value = ''
  excelHtml.value = ''
}

// ===================== Watchers =====================

watch(
  () => [props.visible, props.file] as const,
  ([visible, file]) => {
    if (visible && file) {
      loadAndRender(file)
    } else {
      cleanup()
    }
  },
)

// ===================== Lifecycle =====================

onBeforeUnmount(() => cleanup())
</script>

<style scoped>
/* ===== Preview Transition ===== */
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

/* ===== Markdown preview ===== */
.markdown-preview h1 { font-size: 1.5em; font-weight: 700; margin: 1em 0 0.5em; color: #2D325A; }
.markdown-preview h2 { font-size: 1.25em; font-weight: 700; margin: 1em 0 0.4em; color: #2D325A; }
.markdown-preview h3 { font-size: 1.1em; font-weight: 600; margin: 0.8em 0 0.3em; color: #2D325A; }
.markdown-preview h4 { font-size: 1em; font-weight: 600; margin: 0.6em 0 0.2em; color: #2D325A; }
.markdown-preview p  { margin-bottom: 0.6em; line-height: 1.7; color: #444; }
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

/* ===== docx-preview wrapper ===== */
.docx-wrapper {
  min-height: 200px;
}
.docx-wrapper :deep(.docx-render) {
  width: 100% !important;
}
.docx-wrapper :deep(.docx-render table) {
  border-collapse: collapse;
  width: 100%;
}
.docx-wrapper :deep(.docx-render td),
.docx-wrapper :deep(.docx-render th) {
  border: 1px solid #E6E5F5;
  padding: 4px 8px;
}
.docx-wrapper :deep(.docx-render img) {
  max-width: 100%;
}

/* ===== Excel preview (SheetJS sheet_to_html overrides) ===== */
.xlsx-preview {
  min-height: 200px;
}
.xlsx-preview :deep(table) {
  border-collapse: collapse;
  width: auto;
  min-width: 100%;
  font-size: 13px;
  font-family: 'JetBrains Mono', 'Menlo', monospace;
}
.xlsx-preview :deep(td),
.xlsx-preview :deep(th) {
  border: 1px solid #E6E5F5 !important;
  padding: 6px 12px !important;
  text-align: left;
  white-space: nowrap;
  color: #2D325A;
}
.xlsx-preview :deep(th) {
  background: #F5F4FD !important;
  font-weight: 600;
  color: #2D325A;
  border-bottom: 2px solid #D0D0E8 !important;
}
.xlsx-preview :deep(tr:nth-child(even)) {
  background: #FAF9FD;
}
.xlsx-preview :deep(tr:nth-child(odd)) {
  background: #FFFFFF;
}
.xlsx-preview :deep(tr:hover) {
  background: #F0EFFA !important;
}
</style>
