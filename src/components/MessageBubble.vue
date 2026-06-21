<script setup lang="ts">
import { ref } from 'vue'
import { renderMarkdown } from '../utils/markdown'
import {
  highlightInput,
  friendlyError,
  formatTime,
  formatDuration,
  formatFileSize,
  isSingleImage,
} from '../utils/helpers'
import type { ComponentMessage, ComponentAttachment } from '../types/chat'
import type { AttachedFileVO } from '../api/types'
import FilePreviewModal from './FilePreviewModal.vue'

defineProps<{
  msg: ComponentMessage
  selectedModelName: string
  isAiResponding: boolean
  isLastMessage: boolean
  expandedThinking: Set<string>
  showAllAttachments: Set<string>
  toolChainState: 0 | 1 | 2
  expandedSteps: Set<string>
}>()

const emit = defineEmits<{
  toggleThinking: [id: string]
  toggleAttachments: [id: string]
  toggleToolStep: [id: string]
}>()

const lightboxUrl = ref('')
const previewAttachment = ref<AttachedFileVO | null>(null)
const copiedMsgId = ref<string | null>(null)
const isHovered = ref(false)

function openFilePreview(att: ComponentAttachment) {
  previewAttachment.value = {
    id: att.id,
    fileName: att.name,
    fileUrl: att.url,
    fileSize: att.size,
    extension: att.ext,
    uploadStatus: 'SUCCESS',
  } as AttachedFileVO
}

function closeFilePreview() {
  previewAttachment.value = null
}

/** Map file extension to a display icon name */
function getFileCardIcon(ext: string): string {
  const e = ext.toLowerCase()
  if (['md', 'txt', 'log'].includes(e)) return 'text'
  if (['html', 'htm'].includes(e)) return 'html'
  if (['js', 'ts', 'jsx', 'tsx', 'json', 'xml', 'yaml', 'yml', 'css',
      'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'hpp', 'sh', 'bash', 'zsh'].includes(e)) return 'code'
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'].includes(e)) return 'document'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(e)) return 'image'
  return 'file'
}

async function copyMessage(id: string, content: string) {
  try {
    await navigator.clipboard.writeText(content)
    copiedMsgId.value = id
    setTimeout(() => {
      if (copiedMsgId.value === id) copiedMsgId.value = null
    }, 1500)
  } catch {
    // Clipboard write may fail in non-HTTPS context — silently ignore
  }
}


</script>

<template>
  <div class="flex" :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
    @mouseenter="isHovered = true" @mouseleave="isHovered = false"
  >
    <!-- User Message -->
    <div v-if="msg.role === 'user'" class="max-w-[75%] space-y-2">
      <!-- Attachments with real image previews -->
      <div v-if="msg.attachments && msg.attachments.length > 0" class="flex flex-wrap gap-1.5 justify-end">
        <template v-for="att in msg.attachments" :key="att.id">
          <template v-if="showAllAttachments.has(msg.id) || msg.attachments.indexOf(att) < 3">
            <!-- Image attachment -->
            <div v-if="isSingleImage(msg.attachments) || att.type === 'image'"
              class="rounded-xl overflow-hidden border border-stone-100 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
              :class="isSingleImage(msg.attachments) ? 'w-48' : 'w-28'"
              @click="lightboxUrl = att.url"
            >
              <div class="bg-stone-100 flex items-center justify-center overflow-hidden" :class="isSingleImage(msg.attachments) ? 'h-28' : 'h-20'">
                <img :src="att.url" alt="" class="w-full h-full object-cover" />
              </div>
              <div class="px-2.5 py-1 bg-white flex items-center justify-between">
                <span class="text-[11px] font-medium text-stone-600 truncate">{{ att.name }}</span>
                <span class="text-[10px] text-stone-400 shrink-0">{{ formatFileSize(att.size) }}</span>
              </div>
            </div>
            <!-- Document / Code / File attachment card -->
            <div v-else
              @click="openFilePreview(att)"
              class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#F3F1FC]/50 border border-[#D0D0E8] shadow-sm cursor-pointer transition-all duration-200 hover:bg-[#E6E5F5]/70 hover:shadow-md active:scale-[0.98]"
            >
              <!-- File type icon -->
              <div class="w-9 h-9 shrink-0 rounded-lg bg-white border border-[#E6E5F5] flex items-center justify-center">
                <!-- Text (md/txt/log) -->
                <svg v-if="getFileCardIcon(att.ext) === 'text'" class="w-4.5 h-4.5 text-[#606CF3]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                <!-- HTML -->
                <svg v-else-if="getFileCardIcon(att.ext) === 'html'" class="w-4.5 h-4.5 text-[#606CF3]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                </svg>
                <!-- Code -->
                <svg v-else-if="getFileCardIcon(att.ext) === 'code'" class="w-4.5 h-4.5 text-[#606CF3]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                </svg>
                <!-- Document (PDF/docx/xlsx) -->
                <svg v-else-if="getFileCardIcon(att.ext) === 'document'" class="w-4.5 h-4.5 text-[#B5849E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                <!-- Image -->
                <svg v-else-if="getFileCardIcon(att.ext) === 'image'" class="w-4.5 h-4.5 text-[#7C9ABF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="2"/><path d="M21 15l-5-5L5 21"/>
                </svg>
                <!-- Generic file -->
                <svg v-else class="w-4.5 h-4.5 text-[#8A8A9E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/>
                </svg>
              </div>
              <!-- File info -->
              <div class="flex-1 min-w-0">
                <div class="text-[13px] font-semibold text-[#2D325A] truncate leading-snug">{{ att.name }}</div>
                <div class="text-[11px] text-[#7E84A3] mt-0.5">{{ formatFileSize(att.size) }}</div>
              </div>
            </div>
          </template>
        </template>
        <button v-if="msg.attachments.length > 3 && !showAllAttachments.has(msg.id)" @click="emit('toggleAttachments', msg.id)" class="text-[11px] text-stone-400 hover:text-stone-600 px-1.5 transition-colors">+{{ msg.attachments.length - 3 }}</button>
        <button v-if="showAllAttachments.has(msg.id) && msg.attachments.length > 3" @click="emit('toggleAttachments', msg.id)" class="text-[11px] text-stone-400 hover:text-stone-600 px-1.5 transition-colors">收起</button>
      </div>
      <!-- Lightbox -->
      <div v-if="lightboxUrl" @click="lightboxUrl = ''" class="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4 cursor-pointer">
        <img :src="lightboxUrl" class="max-w-full max-h-full rounded-xl shadow-2xl" @click.stop />
      </div>
      <div class="bg-violet-50 border border-violet-100 rounded-2xl px-4 py-3 text-sm text-stone-800 leading-relaxed whitespace-pre-wrap shadow-sm">{{ msg.content }}</div>
      <div class="text-xs text-stone-400 flex items-center justify-end gap-3">
        <button @click.stop="copyMessage(msg.id, msg.content)"
          :class="[
            copiedMsgId === msg.id ? 'text-emerald-500' : 'text-stone-400 hover:text-stone-600',
            isHovered || copiedMsgId === msg.id ? 'opacity-100' : 'opacity-0 pointer-events-none'
          ]"
          class="flex items-center gap-1 transition-all duration-150"
          title="复制消息"
        >
          <template v-if="copiedMsgId === msg.id">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            <span class="text-[10px]">已复制</span>
          </template>
          <template v-else>
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          </template>
        </button>
        <span>{{ formatTime(msg.timestamp) }}</span>
      </div>
    </div>

    <!-- Assistant Message -->
    <div v-else class="flex gap-3 max-w-[85%]">
      <div class="space-y-3 min-w-0">
        <!-- Thinking Block — collapsible, properly contained -->
        <div v-if="msg.thinking" class="mb-1 w-full overflow-hidden">
          <button @click="emit('toggleThinking', msg.id)" class="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-600 transition-colors w-full text-left">
            <svg v-if="msg.thinking.completed" class="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
            <svg v-else class="w-3.5 h-3.5 text-violet-500 shrink-0 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            <span>{{ msg.thinking.completed ? '已深度思考' : '深度思考中...' }}</span>
            <span v-if="msg.thinking.durationMs" class="text-stone-300 mx-0.5">·</span>
            <span v-if="msg.thinking.durationMs" class="text-stone-500">{{ formatDuration(msg.thinking.durationMs) }}</span>
            <svg class="w-3 h-3 text-stone-300 ml-auto shrink-0 transition-transform duration-200" :class="expandedThinking.has(msg.id) ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div v-show="expandedThinking.has(msg.id)" class="mt-2 w-full">
            <div class="text-xs text-stone-500 italic leading-relaxed bg-stone-50 rounded-lg p-3 border border-stone-100 whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto">{{ msg.thinking.content }}</div>
          </div>
        </div>
        <div v-else-if="isAiResponding && isLastMessage" class="flex items-center gap-2 text-xs text-stone-400">
          <div class="w-3 h-3 rounded-full border-2 border-violet-200 border-t-violet-500 animate-spin"></div><span>正在思考...</span>
        </div>

        <!-- Fragments: text / tool sections interleaved -->
        <template v-if="msg.fragments">
          <template v-for="(frag, fi) in msg.fragments" :key="fi">
            <div v-if="frag.kind === 'text'" class="markdown-body text-sm" v-html="renderMarkdown(frag.content)"></div>
            <div v-else-if="frag.kind === 'tools'" class="space-y-1 min-w-0">
              <!-- State 0: completely hidden — render nothing -->
              <template v-if="toolChainState === 0"></template>

              <!-- State 1: summary visible, click individual tool to expand -->
              <template v-else-if="toolChainState === 1">
                <div v-for="tc in frag.calls" :key="tc.id">
                  <button @click="emit('toggleToolStep', tc.id)"
                    class="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-stone-100 text-xs hover:bg-stone-50 transition-colors"
                  >
                    <span class="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
                      :class="tc.status === 'success' ? 'bg-emerald-100 text-emerald-600' : tc.status === 'error' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'"
                    >{{ tc.status === 'success' ? '✓' : tc.status === 'error' ? '✗' : '⟳' }}</span>
                    <span class="font-medium text-stone-700">{{ tc.name }}</span>
                    <svg class="w-3 h-3 ml-auto text-stone-300 transition-transform duration-200" :class="expandedSteps.has(tc.id) ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                  </button>
                  <Transition name="tool-expand">
                    <div v-if="expandedSteps.has(tc.id)" class="tool-details-inner mt-1.5 ml-4 pl-3 border-l-2 border-stone-100 space-y-1.5">
                      <div v-if="frag.thinking" class="mb-2">
                        <div class="text-[10px] text-stone-400 font-semibold uppercase tracking-wider mb-0.5">思考过程</div>
                        <div class="text-xs text-stone-500 italic leading-relaxed whitespace-pre-wrap">{{ frag.thinking.content }}</div>
                      </div>
                      <div>
                        <div class="text-[10px] text-stone-400 font-semibold uppercase tracking-wider">输入</div>
                        <div class="mt-0.5 bg-stone-50 border border-stone-100 rounded-lg p-2 font-mono text-[11px] text-stone-600 leading-relaxed overflow-x-auto" v-html="highlightInput(tc.input)"></div>
                      </div>
                      <Transition name="tool-output">
                        <div v-if="tc.output" :key="'out-' + tc.id">
                          <div class="text-[10px] text-stone-400 font-semibold uppercase tracking-wider">输出</div>
                          <div class="mt-0.5" :class="tc.status === 'error' ? 'bg-red-50 border border-red-100 rounded-lg p-2 text-[11px] text-red-700 leading-relaxed' : 'bg-stone-50 border border-stone-100 rounded-lg p-2 font-mono text-[11px] text-stone-600 leading-relaxed overflow-x-auto max-w-full whitespace-pre-wrap break-all'">
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
                      </Transition>
                    </div>
                  </Transition>
                </div>
              </template>

              <!-- State 2: all expanded by default, click individual to collapse -->
              <template v-else>
                <div v-for="tc in frag.calls" :key="tc.id">
                  <button @click="emit('toggleToolStep', tc.id)"
                    class="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-stone-100 text-xs hover:bg-stone-50 transition-colors"
                  >
                    <span class="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
                      :class="tc.status === 'success' ? 'bg-emerald-100 text-emerald-600' : tc.status === 'error' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'"
                    >{{ tc.status === 'success' ? '✓' : tc.status === 'error' ? '✗' : '⟳' }}</span>
                    <span class="font-medium text-stone-700">{{ tc.name }}</span>
                    <svg class="w-3 h-3 ml-auto text-stone-300 transition-transform duration-200" :class="!expandedSteps.has(tc.id) ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                  </button>
                  <!-- In state 2: shown unless collapsed by user -->
                  <Transition name="tool-expand">
                    <div v-if="!expandedSteps.has(tc.id)" class="tool-details-inner mt-1.5 ml-4 pl-3 border-l-2 border-stone-100 space-y-1.5">
                      <div v-if="frag.thinking" class="mb-2">
                        <div class="text-[10px] text-stone-400 font-semibold uppercase tracking-wider mb-0.5">思考过程</div>
                        <div class="text-xs text-stone-500 italic leading-relaxed whitespace-pre-wrap">{{ frag.thinking.content }}</div>
                      </div>
                      <div>
                        <div class="text-[10px] text-stone-400 font-semibold uppercase tracking-wider">输入</div>
                        <div class="mt-0.5 bg-stone-50 border border-stone-100 rounded-lg p-2 font-mono text-[11px] text-stone-600 leading-relaxed overflow-x-auto" v-html="highlightInput(tc.input)"></div>
                      </div>
                      <Transition name="tool-output">
                        <div v-if="tc.output" :key="'out-' + tc.id">
                          <div class="text-[10px] text-stone-400 font-semibold uppercase tracking-wider">输出</div>
                          <div :class="tc.status === 'error' ? 'bg-red-50 border border-red-100 rounded-lg p-2 text-[11px] text-red-700 leading-relaxed' : 'bg-stone-50 border border-stone-100 rounded-lg p-2 font-mono text-[11px] text-stone-600 leading-relaxed overflow-x-auto max-w-full whitespace-pre-wrap break-all'">
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
                    </Transition>
                  </div>
                </Transition>
              </div>
            </template>
            </div>
          </template>
        </template>

        <!-- Fallback: plain content -->
        <div v-else-if="msg.content" class="markdown-body text-sm" v-html="renderMarkdown(msg.content)"></div>

        <div class="text-xs text-stone-400 flex items-center gap-2">
          <button @click.stop="copyMessage(msg.id, msg.content)"
            :class="[
              copiedMsgId === msg.id ? 'text-emerald-500' : 'text-stone-400 hover:text-stone-600',
              isHovered || copiedMsgId === msg.id ? 'opacity-100' : 'opacity-0 pointer-events-none'
            ]"
            class="flex items-center gap-1 transition-all duration-150"
            title="复制消息"
          >
            <template v-if="copiedMsgId === msg.id">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              <span class="text-[10px]">已复制</span>
            </template>
            <template v-else>
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </template>
          </button>
          <span>{{ formatTime(msg.timestamp) }}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- File Preview Modal -->
  <FilePreviewModal
    :file="previewAttachment"
    :visible="!!previewAttachment"
    @close="closeFilePreview"
  />
</template>

<style scoped>
/* ── Tool output: graceful slide-in for result content ── */
.tool-output-enter-active {
  transition: max-height 0.35s cubic-bezier(0.16, 1, 0.3, 1),
              opacity 0.25s ease;
  overflow: hidden;
}
.tool-output-enter-from {
  max-height: 0;
  opacity: 0;
}
.tool-output-enter-to {
  max-height: 5000px;
  opacity: 1;
}

/* ── Tool expand/collapse: smooth reveal for details panel ── */
.tool-expand-enter-active {
  transition: max-height 0.3s cubic-bezier(0.16, 1, 0.3, 1),
              opacity 0.2s ease;
  overflow: hidden;
}
.tool-expand-leave-active {
  transition: max-height 0.2s cubic-bezier(0.16, 1, 0.3, 1),
              opacity 0.15s ease;
  overflow: hidden;
}
.tool-expand-enter-from,
.tool-expand-leave-to {
  max-height: 0;
  opacity: 0;
}
.tool-expand-enter-to,
.tool-expand-leave-from {
  max-height: 5000px;
  opacity: 1;
}
</style>
