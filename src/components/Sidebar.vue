<script setup lang="ts">
import type { ComponentSession } from '../types/chat'
import type { MCPServerVO } from '../api/types'

defineProps<{
  sessions: ComponentSession[]
  currentSessionId: string
  loading: boolean
  errorMsg: string
  showSessionDeleteConfirm: string | null
  mcpCount: number
}>()

const emit = defineEmits<{
  selectSession: [id: string]
  createNewSession: []
  requestDeleteSession: [id: string, event: MouseEvent]
  confirmDelete: [id: string, event: MouseEvent]
  openMCP: []
  openAPIConfig: []
}>()
</script>

<template>
  <aside class="w-[260px] min-w-[260px] bg-white border-r border-slate-100 flex flex-col h-full">
    <div class="px-4 pt-5 pb-3 border-b border-slate-100">
      <div class="flex items-center gap-2 mb-4 px-1">
        <svg class="w-7 h-7" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="8" fill="#2563EB"/>
          <path d="M9 22V10L23 22V10" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="font-semibold text-sm tracking-tight text-gray-800">NexusAgent</span>
      </div>
      <button @click="emit('createNewSession')" class="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-slate-50 transition-all duration-150 border border-slate-100 hover:border-slate-200 shadow-sm">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
        新建对话
      </button>
    </div>
    <div class="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
      <div v-if="loading" class="flex items-center justify-center py-8 text-xs text-gray-400">加载中...</div>
      <div v-else-if="errorMsg" class="px-3 py-4 text-xs text-center text-red-500">{{ errorMsg }}</div>
      <div v-else-if="sessions.length === 0" class="px-3 py-8 text-xs text-center text-gray-400">暂无历史对话</div>
      <div v-for="session in sessions" :key="session.id"
        @click="emit('selectSession', session.id)"
        class="group flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 text-sm"
        :class="currentSessionId === session.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-slate-50 hover:text-gray-800'"
      >
        <svg class="w-4 h-4 shrink-0" :class="currentSessionId === session.id ? 'text-blue-500' : 'text-gray-400'" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
        <span class="truncate flex-1">{{ session.title }}</span>
        <button v-if="showSessionDeleteConfirm === session.id"
          @click="emit('confirmDelete', session.id, $event)"
          class="shrink-0 p-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors" title="确认删除"
        ><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg></button>
        <button v-else
          @click="emit('requestDeleteSession', session.id, $event)"
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
        <button @click="emit('openMCP')" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-gray-500 hover:text-gray-700 hover:bg-slate-50 transition-all duration-150">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
          MCP 管理<span class="ml-auto text-xs text-gray-400">{{ mcpCount }} 个服务器</span>
        </button>
        <button @click="emit('openAPIConfig')" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-gray-500 hover:text-gray-700 hover:bg-slate-50 transition-all duration-150">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          API 配置
        </button>
      </div>
    </div>
  </aside>
</template>
