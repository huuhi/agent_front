<script setup lang="ts">
import { ref, watch } from 'vue'
import { formatFileSize, isImageFile } from '../utils/helpers'
import type { ModelOption } from '../types/chat'
import type { KnowledgeVO } from '../api/types'

const props = defineProps<{
  inputText: string
  isAiResponding: boolean
  pendingFiles: File[]
  selectedModel: ModelOption
  selectedKnowledgeBase: { id: number | string; name: string; documentCount: number } | null
  enableRag: boolean
  knowledgeBases: KnowledgeVO[]
  showModelSelector: boolean
  showKnowledgeBaseSelector: boolean
}>()

const emit = defineEmits<{
  'update:inputText': [value: string]
  sendMessage: []
  handleKeydown: [e: KeyboardEvent]
  cancelStreaming: []
  selectModel: [model: ModelOption]
  selectKnowledgeBase: [kb: KnowledgeVO | null]
  toggleRag: []
  'update:showModelSelector': [value: boolean]
  'update:showKnowledgeBaseSelector': [value: boolean]
  fileSelected: [event: Event]
  removePendingFile: [index: number]
}>()

const fileInput = ref<HTMLInputElement | null>(null)

function handleAttachClick() {
  fileInput.value?.click()
}

function onTextareaInput(e: Event) {
  const el = e.target as HTMLTextAreaElement
  emit('update:inputText', el.value)
  // Auto-resize up to 35vh
  el.style.height = 'auto'
  const maxH = window.innerHeight * 0.35
  el.style.height = Math.min(el.scrollHeight, maxH) + 'px'
}

// Reset textarea height when input is cleared programmatically (after send)
watch(() => props.inputText, (val) => {
  if (!val) {
    const el = document.querySelector<HTMLTextAreaElement>('.chat-textarea')
    el?.style && (el.style.height = 'auto')
  }
})
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <div class="flex items-center gap-2 mb-2.5 px-1">
      <div class="relative">
        <button @click="emit('update:showModelSelector', !showModelSelector)" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-white border border-transparent hover:border-slate-100 transition-all duration-150">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
          {{ selectedModel.name }}<svg class="w-3 h-3 text-gray-300" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </button>
        <div v-if="showModelSelector" class="absolute bottom-full mb-1 left-0 w-64 bg-white border border-slate-100 rounded-xl shadow-lg overflow-hidden z-50">
          <div class="py-1">
            <div @click="emit('selectModel', { id: '', name: 'DeepSeek V4 Flash', supportsThinking: true, provider: 'DeepSeek' })" class="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors" :class="selectedModel.name === 'DeepSeek V4 Flash' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-slate-50'">
              <div class="flex-1"><div class="font-medium">DeepSeek V4 Flash</div><div class="text-xs text-gray-400">DeepSeek</div></div>
            </div>
            <div @click="emit('selectModel', { id: '', name: 'DeepSeek V4 Pro', supportsThinking: true, provider: 'DeepSeek' })" class="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors" :class="selectedModel.name === 'DeepSeek V4 Pro' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-slate-50'">
              <div class="flex-1"><div class="font-medium">DeepSeek V4 Pro</div><div class="text-xs text-gray-400">DeepSeek</div></div>
            </div>
          </div>
        </div>
      </div>
      <div class="relative">
        <button @click="emit('update:showKnowledgeBaseSelector', !showKnowledgeBaseSelector)" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-white border border-transparent hover:border-slate-100 transition-all duration-150">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
          {{ selectedKnowledgeBase ? selectedKnowledgeBase.name : '无知识库' }}<svg class="w-3 h-3 text-gray-300" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </button>
        <div v-if="showKnowledgeBaseSelector" class="absolute bottom-full mb-1 left-0 w-56 bg-white border border-slate-100 rounded-xl shadow-lg overflow-hidden z-50">
          <div class="py-1">
            <div @click="emit('selectKnowledgeBase', null)" class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-slate-50 cursor-pointer transition-colors" :class="!selectedKnowledgeBase ? 'bg-blue-50 text-blue-700' : ''">
              <span>无知识库</span><svg v-if="!selectedKnowledgeBase" class="w-4 h-4 ml-auto text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
            </div>
            <div v-for="kb in knowledgeBases" :key="kb.id" @click="emit('selectKnowledgeBase', kb)" class="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors" :class="selectedKnowledgeBase?.id === kb.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-slate-50'">
              <div class="flex-1"><div class="font-medium">{{ kb.name }}</div><div class="text-xs text-gray-400">{{ kb.describe || '暂无描述' }}</div></div>
              <svg v-if="selectedKnowledgeBase?.id === kb.id" class="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
            </div>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500">
        <span>RAG</span>
        <button @click="emit('toggleRag')" class="relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200" :class="enableRag ? 'bg-emerald-400' : 'bg-gray-200'">
          <span class="inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-200" :class="enableRag ? 'translate-x-3.5' : 'translate-x-0.5'"></span>
        </button>
      </div>
    </div>
    <div class="bg-white border border-slate-100 rounded-2xl shadow-md transition-shadow duration-200 focus-within:shadow-lg">
      <textarea :value="inputText" @input="onTextareaInput"
        @keydown="emit('handleKeydown', $event)"
        placeholder="给 NexusAgent 发送消息，或者询问知识库..." rows="1"
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
</style>
