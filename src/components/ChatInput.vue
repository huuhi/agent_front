<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { formatFileSize, isImageFile } from '../utils/helpers'
import type { ModelOption } from '../types/chat'
import type { KnowledgeVO, UserApiConfigVO, MCPServerVO } from '../api/types'

const props = defineProps<{
  inputText: string
  isAiResponding: boolean
  pendingFiles: File[]
  selectedModel: ModelOption
  selectedKnowledgeBase: { id: number | string; name: string; documentCount: number } | null
  enableRag: boolean
  enableThinking: boolean
  knowledgeBases: KnowledgeVO[]
  userApiConfigs: UserApiConfigVO[]
  selectedApiConfig: UserApiConfigVO | null
  mcps: MCPServerVO[]
  selectedMCPIds: string[]
}>()

const emit = defineEmits<{
  'update:inputText': [value: string]
  sendMessage: []
  handleKeydown: [e: KeyboardEvent]
  cancelStreaming: []
  selectModel: [model: ModelOption]
  selectKnowledgeBase: [kb: KnowledgeVO | null]
  toggleRag: []
  toggleThinking: []
  fileSelected: [event: Event]
  removePendingFile: [index: number]
  selectApiConfig: [config: UserApiConfigVO | null]
  toggleMCP: [id: string]
}>()

// ========== Options panel state ==========
const showOptions = ref(false)
const showApiConfigOptions = ref(false)
const showModelOptions = ref(false)
const showKnowledgeOptions = ref(false)
const showMCPOptions = ref(false)

// Refs for positioned sub-dropdown overlays
const apiConfigBtnRef = ref<HTMLElement | null>(null)
const modelBtnRef = ref<HTMLElement | null>(null)
const knowledgeBtnRef = ref<HTMLElement | null>(null)
const mcpBtnRef = ref<HTMLElement | null>(null)

// Fixed position styles for sub-dropdown overlays
const apiConfigOverlayStyle = ref<Record<string, string>>({})
const modelOverlayStyle = ref<Record<string, string>>({})
const knowledgeOverlayStyle = ref<Record<string, string>>({})
const mcpOverlayStyle = ref<Record<string, string>>({})

const fileInput = ref<HTMLInputElement | null>(null)

// ========== Click outside to close options panel ==========
const optionsPanelRef = ref<HTMLElement | null>(null)

function onDocumentClick(e: MouseEvent) {
  if (!showOptions.value) return
  const el = optionsPanelRef.value
  if (el && !el.contains(e.target as Node)) {
    closeAll()
  }
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))

function closeAll() {
  showOptions.value = false
  showApiConfigOptions.value = false
  showModelOptions.value = false
  showKnowledgeOptions.value = false
  showMCPOptions.value = false
}

function toggleOptions() {
  showOptions.value = !showOptions.value
  if (!showOptions.value) closeAll()
}

// ========== Sub-dropdown toggle with smart positioning ==========
const OVERLAY_ESTIMATED_HEIGHT = 260

function calcOverlayPosition(e: MouseEvent): Record<string, string> {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top

  if (spaceBelow < OVERLAY_ESTIMATED_HEIGHT && spaceAbove > spaceBelow) {
    return {
      position: 'fixed',
      bottom: (window.innerHeight - rect.top + 4) + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
    }
  }
  return {
    position: 'fixed',
    top: (rect.bottom + 4) + 'px',
    left: rect.left + 'px',
    width: rect.width + 'px',
  }
}

function toggleApiConfig(e: MouseEvent) {
  showApiConfigOptions.value = !showApiConfigOptions.value
  if (showApiConfigOptions.value) {
    apiConfigOverlayStyle.value = calcOverlayPosition(e)
    showModelOptions.value = false
    showKnowledgeOptions.value = false
    showMCPOptions.value = false
  }
}

function toggleModel(e: MouseEvent) {
  showModelOptions.value = !showModelOptions.value
  if (showModelOptions.value) {
    modelOverlayStyle.value = calcOverlayPosition(e)
    showApiConfigOptions.value = false
    showKnowledgeOptions.value = false
    showMCPOptions.value = false
  }
}

function toggleKnowledge(e: MouseEvent) {
  showKnowledgeOptions.value = !showKnowledgeOptions.value
  if (showKnowledgeOptions.value) {
    knowledgeOverlayStyle.value = calcOverlayPosition(e)
    showApiConfigOptions.value = false
    showModelOptions.value = false
    showMCPOptions.value = false
  }
}

function toggleMCP(e: MouseEvent) {
  showMCPOptions.value = !showMCPOptions.value
  if (showMCPOptions.value) {
    mcpOverlayStyle.value = calcOverlayPosition(e)
    showApiConfigOptions.value = false
    showModelOptions.value = false
    showKnowledgeOptions.value = false
  }
}

function handleAttachClick() {
  fileInput.value?.click()
}

function onTextareaInput(e: Event) {
  const el = e.target as HTMLTextAreaElement
  emit('update:inputText', el.value)
  el.style.height = 'auto'
  const maxH = window.innerHeight * 0.35
  el.style.height = Math.min(el.scrollHeight, maxH) + 'px'
}

watch(() => props.inputText, (val) => {
  if (!val) {
    const el = document.querySelector<HTMLTextAreaElement>('.chat-textarea')
    el?.style && (el.style.height = 'auto')
  }
})

function selectApiConfig(cfg: UserApiConfigVO | null) {
  emit('selectApiConfig', cfg)
  showApiConfigOptions.value = false
}

function selectModel(model: ModelOption) {
  emit('selectModel', model)
  showModelOptions.value = false
}

function selectKnowledgeBase(kb: KnowledgeVO | null) {
  emit('selectKnowledgeBase', kb)
  showKnowledgeOptions.value = false
}
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <!-- ===== Textarea + bottom bar ===== -->
    <div class="bg-white border border-slate-100 rounded-2xl shadow-md transition-shadow duration-200 focus-within:shadow-lg relative">
      <textarea :value="inputText" @input="onTextareaInput"
        @keydown="emit('handleKeydown', $event)"
        placeholder="给 NexusAgent 发送消息..." rows="1"
        class="w-full resize-none bg-transparent px-5 pt-4 pb-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none leading-relaxed chat-textarea"
      ></textarea>

      <!-- Pending files -->
      <div v-if="pendingFiles.length > 0" class="flex flex-wrap gap-1.5 px-4 pb-2">
        <div v-for="(file, fi) in pendingFiles" :key="fi"
          class="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 border border-slate-100 text-[11px]"
        >
          <svg class="w-3.5 h-3.5 shrink-0" :class="isImageFile(file) ? 'text-pink-400' : 'text-blue-400'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path v-if="isImageFile(file)" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
          </svg>
          <span class="text-gray-600 truncate max-w-[120px]">{{ file.name }}</span>
          <span class="text-gray-400">{{ formatFileSize(file.size) }}</span>
          <button @click="emit('removePendingFile', fi)" class="text-gray-400 hover:text-red-500 ml-0.5 transition-colors">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      <!-- Bottom bar: ⚙ left / 📎 + send right -->
      <div class="flex items-center justify-between px-4 pb-3">
        <div class="flex items-center gap-0.5">
          <button @click.stop="emit('toggleThinking')"
            tabindex="0"
            :aria-pressed="enableThinking ? 'true' : 'false'"
            class="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
            :class="enableThinking ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-gray-600 hover:bg-slate-50'"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" class="shrink-0">
              <path d="M7.06431 5.93342C7.68763 5.93342 8.19307 6.43904 8.19322 7.06233C8.19322 7.68573 7.68772 8.19123 7.06431 8.19123C6.44099 8.19113 5.9354 7.68567 5.9354 7.06233C5.93555 6.43911 6.44108 5.93353 7.06431 5.93342Z" fill="currentColor"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M8.6815 0.963693C10.1169 0.447019 11.6266 0.374829 12.5633 1.31135C13.5 2.24805 13.4277 3.75776 12.911 5.19319C12.7126 5.74431 12.4386 6.31796 12.0965 6.89729C12.4969 7.54638 12.8141 8.19018 13.036 8.80647C13.5527 10.2419 13.6251 11.7516 12.6883 12.6883C11.7516 13.625 10.242 13.5527 8.8065 13.036C8.19022 12.8141 7.54641 12.4969 6.89732 12.0965C6.31797 12.4386 5.74435 12.7125 5.19322 12.911C3.75777 13.4276 2.2481 13.5 1.31138 12.5633C0.374859 11.6266 0.447049 10.1168 0.963724 8.68147C1.17185 8.10338 1.46321 7.50063 1.82896 6.8924C1.52182 6.35711 1.27235 5.82825 1.08872 5.31819C0.572068 3.88278 0.499714 2.37306 1.43638 1.43635C2.37308 0.499655 3.8828 0.572044 5.31822 1.08869C5.82828 1.27232 6.35715 1.5218 6.89243 1.82893C7.50066 1.46318 8.10341 1.17181 8.6815 0.963693ZM11.3573 8.01154C10.9083 8.62253 10.3901 9.22873 9.80943 9.8094C9.22877 10.3901 8.62255 10.9083 8.01158 11.3572C8.4257 11.5841 8.8287 11.7688 9.21275 11.9071C10.5456 12.3868 11.4246 12.2547 11.8397 11.8397C12.2548 11.4246 12.3869 10.5456 11.9071 9.21272C11.7688 8.82866 11.5841 8.42568 11.3573 8.01154ZM2.56529 8.02912C2.37344 8.39322 2.21495 8.74796 2.09263 9.08772C1.61291 10.4204 1.74512 11.2995 2.16001 11.7147C2.57505 12.1297 3.45415 12.2618 4.78697 11.7821C5.11057 11.6656 5.44786 11.5164 5.7938 11.3367C5.249 10.9223 4.70922 10.4533 4.19029 9.9344C3.57578 9.31987 3.03169 8.67633 2.56529 8.02912ZM6.90708 3.2469C6.24065 3.70479 5.5646 4.26321 4.91392 4.91389C4.26325 5.56456 3.70482 6.24063 3.24693 6.90705C3.72674 7.63325 4.32777 8.37459 5.03892 9.08576C5.64943 9.69627 6.28183 10.2265 6.90806 10.6678C7.59368 10.2025 8.2908 9.63076 8.96079 8.96076C9.6308 8.29075 10.2025 7.59366 10.6678 6.90803C10.2265 6.2818 9.69631 5.6494 9.08579 5.03889C8.37462 4.32773 7.63328 3.72672 6.90708 3.2469ZM11.7147 2.15998C11.2996 1.74509 10.4204 1.61288 9.08775 2.0926C8.74835 2.21479 8.39382 2.37271 8.03013 2.56428C8.67728 3.03065 9.31995 3.5758 9.93443 4.19026C10.4534 4.7092 10.9223 5.24896 11.3368 5.79377C11.5164 5.44785 11.6656 5.11052 11.7821 4.78694C12.2618 3.45416 12.1297 2.57502 11.7147 2.15998ZM4.91197 2.2176C3.57922 1.73788 2.70004 1.86995 2.28501 2.28498C1.87001 2.70003 1.73791 3.5792 2.21763 4.91194C2.31709 5.18822 2.44112 5.47427 2.58677 5.7674C3.01931 5.1887 3.51474 4.6158 4.06529 4.06526C4.61584 3.5147 5.18872 3.01928 5.76743 2.58674C5.47431 2.4411 5.18824 2.31706 4.91197 2.2176Z" fill="currentColor"/>
            </svg>
            <span>深度思考</span>
          </button>
          <div ref="optionsPanelRef" class="relative">
            <button @click.stop="toggleOptions"
              class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150"
              :class="showOptions ? 'bg-slate-100 text-gray-600' : 'text-gray-400 hover:text-gray-600 hover:bg-slate-50'"
              title="更多选项"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              选项
            </button>

            <!-- Options panel (opens upward) -->
            <transition name="dropdown">
              <div v-if="showOptions" class="absolute bottom-full mb-1 left-0 w-80 bg-white border border-slate-100 rounded-xl shadow-lg z-50">
                <div class="py-2 max-h-[50vh] overflow-y-auto">
                  <!-- API Config -->
                  <div class="px-4 py-2 border-b border-slate-50">
                    <div class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">API 配置</div>
                    <div class="relative">
                      <button ref="apiConfigBtnRef" @click.stop="toggleApiConfig($event)"
                        class="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-100 text-xs text-gray-700 hover:border-slate-200 transition-all"
                      >
                        <span class="flex-1 text-left truncate">{{ selectedApiConfig ? (selectedApiConfig.name || selectedApiConfig.baseUrl) : '系统默认' }}</span>
                        <svg class="w-3 h-3 text-gray-300 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
                      </button>
                    </div>
                  </div>

                  <!-- Model -->
                  <div class="px-4 py-2 border-b border-slate-50">
                    <div class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">模型</div>
                    <div v-if="!selectedApiConfig" class="px-3 py-2 rounded-lg text-xs text-gray-400 bg-slate-50 border border-slate-100">
                      系统默认
                    </div>
                    <div v-else class="relative">
                      <button ref="modelBtnRef" @click.stop="toggleModel($event)"
                        class="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-100 text-xs text-gray-700 hover:border-slate-200 transition-all"
                      >
                        <span class="flex-1 text-left truncate">{{ selectedModel.name }}</span>
                        <svg class="w-3 h-3 text-gray-300 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
                      </button>
                    </div>
                  </div>

                  <!-- Knowledge Base -->
                  <div class="px-4 py-2 border-b border-slate-50">
                    <div class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">知识库</div>
                    <div class="relative">
                      <button ref="knowledgeBtnRef" @click.stop="toggleKnowledge($event)"
                        class="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-100 text-xs text-gray-700 hover:border-slate-200 transition-all"
                      >
                        <span class="flex-1 text-left truncate">{{ selectedKnowledgeBase ? selectedKnowledgeBase.name : '无知识库' }}</span>
                        <svg class="w-3 h-3 text-gray-300 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
                      </button>
                    </div>
                  </div>

                  <!-- MCP Servers -->
                  <div v-if="mcps.length > 0" class="px-4 py-2 border-b border-slate-50">
                    <div class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">MCP 服务器</div>
                    <div class="relative">
                      <button ref="mcpBtnRef" @click.stop="toggleMCP($event)"
                        class="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-100 text-xs text-gray-700 hover:border-slate-200 transition-all"
                      >
                        <span class="flex-1 text-left truncate">{{ selectedMCPIds.length > 0 ? `已选 ${selectedMCPIds.length} 个` : '未选择' }}</span>
                        <svg class="w-3 h-3 text-gray-300 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
                      </button>
                    </div>
                  </div>

                  <!-- RAG toggle -->
                  <div class="px-4 py-2">
                    <button @click.stop="emit('toggleRag')"
                      class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                      :class="enableRag ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'text-gray-400 hover:text-gray-600 hover:bg-slate-50 border border-transparent hover:border-slate-100'"
                    >
                      <svg class="w-3.5 h-3.5" :class="enableRag ? 'text-emerald-500' : 'text-gray-300'" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                      <span class="flex-1 text-left">RAG 知识库检索</span>
                      <span class="text-[10px]" :class="enableRag ? 'text-emerald-500' : 'text-gray-300'">{{ enableRag ? '已开启' : '已关闭' }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </transition>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <input ref="fileInput" type="file" multiple class="hidden"
            accept=".txt,.md,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.one,.jpg,.jpeg,.png,.gif,.webp"
            @change="emit('fileSelected', $event)" />
          <button @click="handleAttachClick" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-600 hover:bg-slate-50 transition-all duration-150" title="上传附件">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
          </button>
          <span v-if="isAiResponding" class="text-xs text-gray-400 animate-pulse">AI 响应中...</span>
          <div class="relative w-9 h-9">
            <button v-if="isAiResponding" @click="emit('cancelStreaming')"
              class="absolute inset-0 flex items-center justify-center rounded-xl bg-red-100 text-red-500 hover:bg-red-200 transition-all duration-150 shadow-sm"
              title="停止生成"
            ><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg></button>
            <button v-else @click="emit('sendMessage')"
              class="absolute inset-0 flex items-center justify-center rounded-xl transition-all duration-150"
              :class="(inputText.trim() || pendingFiles.length > 0) ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm' : 'bg-slate-100 text-slate-300'"
              :disabled="!inputText.trim() && pendingFiles.length === 0"
            ><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"/></svg></button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== Fixed-position sub-dropdown overlays ===== -->

    <!-- API Config sub-dropdown -->
    <div v-if="showApiConfigOptions" :style="apiConfigOverlayStyle" class="bg-white border border-slate-100 rounded-lg shadow-lg z-[999] overflow-hidden" @click.stop>
      <div class="py-1 max-h-[200px] overflow-y-auto">
        <div @click="selectApiConfig(null)" class="px-3 py-2 text-xs cursor-pointer transition-colors" :class="!selectedApiConfig ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-slate-50'">系统默认</div>
        <div v-for="cfg in userApiConfigs" :key="cfg.id || cfg.baseUrl"
          @click="selectApiConfig(cfg)"
          class="px-3 py-2 text-xs cursor-pointer transition-colors"
          :class="selectedApiConfig?.id === cfg.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-slate-50'"
        >
          <div class="font-medium">{{ cfg.name || cfg.baseUrl }}</div>
          <div class="text-[10px] text-gray-400 mt-0.5">{{ cfg.model?.length ? cfg.model.join('、') : '无模型' }}</div>
        </div>
      </div>
    </div>

    <!-- Model sub-dropdown -->
    <div v-if="showModelOptions && selectedApiConfig?.model" :style="modelOverlayStyle" class="bg-white border border-slate-100 rounded-lg shadow-lg z-[999] overflow-hidden" @click.stop>
      <div class="py-1 max-h-[200px] overflow-y-auto">
        <div v-for="m in selectedApiConfig.model" :key="m"
          @click="selectModel({ id: selectedApiConfig.id || '', name: m, supportsThinking: false, provider: selectedApiConfig.name || '自定义', configId: selectedApiConfig.id })"
          class="px-3 py-2 text-xs cursor-pointer transition-colors"
          :class="selectedModel.name === m ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-slate-50'"
        >{{ m }}</div>
      </div>
    </div>

    <!-- Knowledge Base sub-dropdown -->
    <div v-if="showKnowledgeOptions" :style="knowledgeOverlayStyle" class="bg-white border border-slate-100 rounded-lg shadow-lg z-[999] overflow-hidden" @click.stop>
      <div class="py-1 max-h-[200px] overflow-y-auto">
        <div @click="selectKnowledgeBase(null)" class="px-3 py-2 text-xs cursor-pointer transition-colors" :class="!selectedKnowledgeBase ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-slate-50'">无知识库</div>
        <div v-for="kb in knowledgeBases" :key="kb.id"
          @click="selectKnowledgeBase(kb)"
          class="px-3 py-2 text-xs cursor-pointer transition-colors"
          :class="selectedKnowledgeBase?.id === kb.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-slate-50'"
        >
          <div class="font-medium">{{ kb.name }}</div>
          <div class="text-[10px] text-gray-400 mt-0.5">{{ kb.describe || '暂无描述' }}</div>
        </div>
      </div>
    </div>

    <!-- MCP sub-dropdown -->
    <div v-if="showMCPOptions" :style="mcpOverlayStyle" class="bg-white border border-slate-100 rounded-lg shadow-lg z-[999] overflow-hidden" @click.stop>
      <div class="py-1 max-h-[200px] overflow-y-auto">
        <label v-for="mcp in mcps" :key="mcp.id"
          class="flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors hover:bg-slate-50 text-xs"
          :class="!mcp.available ? 'opacity-40' : ''"
        >
          <input type="checkbox" :checked="selectedMCPIds.includes(mcp.id)"
            @change="emit('toggleMCP', mcp.id)"
            class="w-3.5 h-3.5 rounded border-slate-300 text-blue-500 focus:ring-blue-400"
          />
          <span class="flex items-center gap-1.5 text-gray-700">
            <span class="w-1.5 h-1.5 rounded-full" :class="mcp.available ? 'bg-emerald-400' : 'bg-gray-300'"></span>
            {{ mcp.name }}
          </span>
        </label>
      </div>
    </div>
  </div>
</template>

<style>
.chat-textarea {
  max-height: 35vh;
}
.chat-textarea::-webkit-scrollbar { width: 4px; }
.chat-textarea::-webkit-scrollbar-track { background: transparent; }
.chat-textarea::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 999px; }
.chat-textarea::-webkit-resizer { display: none; }

.dropdown-enter-active, .dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.dropdown-enter-from, .dropdown-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
