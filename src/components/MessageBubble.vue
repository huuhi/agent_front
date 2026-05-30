<script setup lang="ts">
import { renderMarkdown } from '../utils/markdown'
import {
  highlightInput,
  friendlyError,
  formatTime,
  formatDuration,
  formatFileSize,
  getFileTypeColor,
  generateThumbnail,
  isSingleImage,
} from '../utils/helpers'
import type { ComponentMessage } from '../types/chat'

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

function toolGroupStatusIcon(calls: { status: string }[]): string {
  if (calls.some(c => c.status === 'running')) return '⟳'
  if (calls.some(c => c.status === 'error')) return '✗'
  return '✓'
}

function toolGroupStatusClass(calls: { status: string }[]): string {
  if (calls.some(c => c.status === 'running')) return 'bg-amber-100 text-amber-600'
  if (calls.some(c => c.status === 'error')) return 'bg-red-100 text-red-600'
  return 'bg-emerald-100 text-emerald-600'
}

function toolGroupLabel(calls: { name: string; status: string }[]): string {
  if (calls.length === 1) return calls[0].name
  const running = calls.filter(c => c.status === 'running').length
  if (running > 0) return `${calls.length} 个工具调用 (${running} 执行中)`
  return `${calls.length} 个工具调用`
}
</script>

<template>
  <div class="flex" :class="msg.role === 'user' ? 'justify-end' : 'justify-start'">
    <!-- User Message -->
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
          <button v-if="msg.attachments.length > 3 && !showAllAttachments.has(msg.id)" @click="emit('toggleAttachments', msg.id)" class="text-[11px] text-gray-400 hover:text-gray-600 px-1.5 transition-colors">+{{ msg.attachments.length - 3 }}</button>
          <button v-if="showAllAttachments.has(msg.id) && msg.attachments.length > 3" @click="emit('toggleAttachments', msg.id)" class="text-[11px] text-gray-400 hover:text-gray-600 px-1.5 transition-colors">收起</button>
        </template>
      </div>
      <div class="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap shadow-sm">{{ msg.content }}</div>
      <div class="text-xs text-gray-400 text-right">{{ formatTime(msg.timestamp) }}</div>
    </div>

    <!-- Assistant Message -->
    <div v-else class="flex gap-3 max-w-[85%]">
      <svg class="w-8 h-8 shrink-0 mt-0.5" viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="8" fill="#2563EB"/>
        <path d="M9 22V10L23 22V10" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="space-y-3">
        <!-- Thinking Block — always expandable, even during streaming -->
        <div v-if="msg.thinking" class="mb-1">
          <button @click="emit('toggleThinking', msg.id)" class="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
            <svg v-if="msg.thinking.completed" class="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
            <svg v-else class="w-3.5 h-3.5 text-blue-500 shrink-0 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            <span>{{ msg.thinking.completed ? '已深度思考' : '深度思考中...' }}</span>
            <span v-if="msg.thinking.durationMs" class="text-gray-300 mx-0.5">·</span>
            <span v-if="msg.thinking.durationMs" class="text-gray-500">{{ formatDuration(msg.thinking.durationMs) }}</span>
            <svg class="w-3 h-3 text-gray-300 transition-transform duration-200" :class="expandedThinking.has(msg.id) ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div v-show="expandedThinking.has(msg.id)" class="mt-1.5 pl-5">
            <div class="text-xs text-gray-500 italic leading-relaxed bg-gray-50 rounded-lg p-3 border border-slate-100 whitespace-pre-wrap">{{ msg.thinking.content }}</div>
          </div>
        </div>
        <div v-else-if="isAiResponding && isLastMessage" class="flex items-center gap-2 text-xs text-gray-400">
          <div class="w-3 h-3 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin"></div><span>正在思考...</span>
        </div>

        <!-- Fragments: text / tool sections interleaved -->
        <template v-if="msg.fragments">
          <template v-for="(frag, fi) in msg.fragments" :key="fi">
            <div v-if="frag.kind === 'text'" class="markdown-body text-sm" v-html="renderMarkdown(frag.content)"></div>
            <div v-else-if="frag.kind === 'tools'" class="space-y-1">
              <!-- State 0: completely hidden — render nothing -->
              <template v-if="toolChainState === 0"></template>

              <!-- State 1: summary visible, click individual tool to expand -->
              <template v-else-if="toolChainState === 1">
                <div v-for="tc in frag.calls" :key="tc.id">
                  <button @click="emit('toggleToolStep', tc.id)"
                    class="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-100 text-xs hover:bg-slate-50 transition-colors"
                  >
                    <span class="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
                      :class="tc.status === 'success' ? 'bg-emerald-100 text-emerald-600' : tc.status === 'error' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'"
                    >{{ tc.status === 'success' ? '✓' : tc.status === 'error' ? '✗' : '⟳' }}</span>
                    <span class="font-medium text-slate-700">{{ tc.name }}</span>
                    <svg class="w-3 h-3 ml-auto text-slate-300 transition-transform duration-200" :class="expandedSteps.has(tc.id) ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                  </button>
                  <div v-show="expandedSteps.has(tc.id)" class="mt-1.5 ml-4 pl-3 border-l-2 border-slate-100 space-y-1.5">
                    <div v-if="frag.thinking" class="mb-2">
                      <div class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-0.5">思考过程</div>
                      <div class="text-xs text-gray-500 italic leading-relaxed whitespace-pre-wrap">{{ frag.thinking.content }}</div>
                    </div>
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
              </template>

              <!-- State 2: all expanded by default, click individual to collapse -->
              <template v-else>
                <div v-for="tc in frag.calls" :key="tc.id">
                  <button @click="emit('toggleToolStep', tc.id)"
                    class="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-100 text-xs hover:bg-slate-50 transition-colors"
                  >
                    <span class="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
                      :class="tc.status === 'success' ? 'bg-emerald-100 text-emerald-600' : tc.status === 'error' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'"
                    >{{ tc.status === 'success' ? '✓' : tc.status === 'error' ? '✗' : '⟳' }}</span>
                    <span class="font-medium text-slate-700">{{ tc.name }}</span>
                    <svg class="w-3 h-3 ml-auto text-slate-300 transition-transform duration-200" :class="!expandedSteps.has(tc.id) ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                  </button>
                  <!-- In state 2: shown unless collapsed by user -->
                  <div v-show="!expandedSteps.has(tc.id)" class="mt-1.5 ml-4 pl-3 border-l-2 border-slate-100 space-y-1.5">
                    <div v-if="frag.thinking" class="mb-2">
                      <div class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-0.5">思考过程</div>
                      <div class="text-xs text-gray-500 italic leading-relaxed whitespace-pre-wrap">{{ frag.thinking.content }}</div>
                    </div>
                    <div>
                      <div class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">输入</div>
                      <div class="mt-0.5 bg-slate-50 border border-slate-100 rounded-lg p-2 font-mono text-[11px] text-slate-600 leading-relaxed overflow-x-auto" v-html="highlightInput(tc.input)"></div>
                    </div>
                    <div v-if="tc.output">
                      <div class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">输出</div>
                      <div :class="tc.status === 'error' ? 'bg-red-50 border border-red-100 rounded-lg p-2 text-[11px] text-red-700 leading-relaxed' : 'bg-gray-50 border border-slate-100 rounded-lg p-2 font-mono text-[11px] text-gray-600 leading-relaxed'">
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
              </template>
            </div>
          </template>
        </template>

        <!-- Fallback: plain content -->
        <div v-else-if="msg.content" class="markdown-body text-sm" v-html="renderMarkdown(msg.content)"></div>

        <div class="text-xs text-gray-400 flex items-center gap-2">
          <span>{{ formatTime(msg.timestamp) }}</span>
          <span class="w-1 h-1 rounded-full bg-gray-300"></span>
          <span class="text-gray-400">{{ selectedModelName }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
