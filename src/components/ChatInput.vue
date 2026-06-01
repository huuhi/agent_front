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

// ========== Sub-dropdown toggle with fixed positioning ==========
function toggleApiConfig(e: MouseEvent) {
  showApiConfigOptions.value = !showApiConfigOptions.value
  if (showApiConfigOptions.value) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    apiConfigOverlayStyle.value = {
      position: 'fixed',
      top: rect.bottom + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
    }
  }
}

function toggleModel(e: MouseEvent) {
  showModelOptions.value = !showModelOptions.value
  if (showModelOptions.value) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    modelOverlayStyle.value = {
      position: 'fixed',
      top: rect.bottom + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
    }
  }
}

function toggleKnowledge(e: MouseEvent) {
  showKnowledgeOptions.value = !showKnowledgeOptions.value
  if (showKnowledgeOptions.value) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    knowledgeOverlayStyle.value = {
      position: 'fixed',
      top: rect.bottom + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
    }
  }
}

function toggleMCP(e: MouseEvent) {
  showMCPOptions.value = !showMCPOptions.value
  if (showMCPOptions.value) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    mcpOverlayStyle.value = {
      position: 'fixed',
      top: rect.bottom + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
    }
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
    <!-- ========== Options bar ========== -->
    <div class="flex items-center justify-between mb-2.5 px-1">
      <!-- Left: consolidated options button -->
      <div ref="optionsPanelRef" class="relative">
        <button @click.stop="toggleOptions"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
          :class="showOptions ? 'bg-slate-100 text-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-slate-50'"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          选项
          <svg class="w-3 h-3 text-gray-300" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </button>

        <!-- Consolidated options panel (opens upward) -->
        <transition name="dropdown">
          <div v-if="showOptions" class="absolute bottom-full mb-1 left-0 w-80 bg-white border border-slate-100 rounded-xl shadow-lg z-50">
            <div class="py-2 max-h-[70vh] overflow-y-auto">
              <!-- ===== API Config ===== -->
              <div class="px-4 py-2">
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

              <!-- ===== Model (系统默认时不可选) ===== -->
              <div class="px-4 py-2">
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

              <!-- ===== Knowledge Base ===== -->
              <div class="px-4 py-2">
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

              <!-- ===== MCP Servers (overlay dropdown) ===== -->
              <div v-if="mcps.length > 0" class="px-4 py-2 border-t border-slate-50 mt-1">
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

              <!-- ===== Toggle switches (always visible at bottom) ===== -->
              <div class="px-4 py-2">
                <div class="flex items-center gap-6">
                  <label class="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
                    <span>RAG</span>
                    <button @click.stop="emit('toggleRag')" class="relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200" :class="enableRag ? 'bg-emerald-400' : 'bg-gray-200'">
                      <span class="inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-200" :class="enableRag ? 'translate-x-3.5' : 'translate-x-0.5'"></span>
                    </button>
                  </label>
                  <label class="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
                    <span>深度思考</span>
                    <button @click.stop="emit('toggleThinking')" class="relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200" :class="enableThinking ? 'bg-blue-400' : 'bg-gray-200'">
                      <span class="inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-200" :class="enableThinking ? 'translate-x-3.5' : 'translate-x-0.5'"></span>
                    </button>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </transition>
      </div>

      <!-- Right: compact indicator chips -->
      <div class="flex items-center gap-2 text-[11px] text-gray-400">
        <span v-if="selectedApiConfig" class="truncate max-w-[100px]">{{ selectedApiConfig.name || '自定义' }}</span>
        <span v-if="selectedMCPIds.length > 0" class="text-gray-300">MCP:{{ selectedMCPIds.length }}</span>
        <span v-if="selectedKnowledgeBase" class="hidden sm:inline truncate max-w-[80px]">{{ selectedKnowledgeBase.name }}</span>
      </div>
    </div>

    <!-- ===== Fixed-position sub-dropdown overlays (render outside any overflow container) ===== -->

    <!-- API Config sub-dropdown -->
    <div v-if="showApiConfigOptions" :style="apiConfigOverlayStyle" class="bg-white border border-slate-100 rounded-lg shadow-lg z-[999] overflow-hidden" @click.stop>
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

    <!-- Model sub-dropdown -->
    <div v-if="showModelOptions && selectedApiConfig?.model" :style="modelOverlayStyle" class="bg-white border border-slate-100 rounded-lg shadow-lg z-[999] overflow-hidden" @click.stop>
      <div v-for="m in selectedApiConfig.model" :key="m"
        @click="selectModel({ id: selectedApiConfig.id || '', name: m, supportsThinking: false, provider: selectedApiConfig.name || '自定义', configId: selectedApiConfig.id })"
        class="px-3 py-2 text-xs cursor-pointer transition-colors"
        :class="selectedModel.name === m ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-slate-50'"
      >{{ m }}</div>
    </div>

    <!-- Knowledge Base sub-dropdown -->
    <div v-if="showKnowledgeOptions" :style="knowledgeOverlayStyle" class="bg-white border border-slate-100 rounded-lg shadow-lg z-[999] overflow-hidden" @click.stop>
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

    <!-- MCP sub-dropdown -->
    <div v-if="showMCPOptions" :style="mcpOverlayStyle" class="bg-white border border-slate-100 rounded-lg shadow-lg z-[999] overflow-hidden" @click.stop>
      <div class="py-1 max-h-[240px] overflow-y-auto">
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

    <!-- ========== Textarea ========== -->
    <div class="bg-white border border-slate-100 rounded-2xl shadow-md transition-shadow duration-200 focus-within:shadow-lg">
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

      <!-- Bottom row -->
      <div class="flex items-center justify-between px-4 pb-3">
        <input ref="fileInput" type="file" multiple class="hidden"
          accept=".txt,.md,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.one,.jpg,.jpeg,.png,.gif,.webp"
          @change="emit('fileSelected', $event)" />
        <button @click="handleAttachClick" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-600 hover:bg-slate-50 transition-all duration-150">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
          <span>附件</span>
        </button>
        <div class="flex items-center gap-2">
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
