<script setup lang="ts">
import type { MCPServerVO } from '../api/types'

defineProps<{
  visible: boolean
  servers: MCPServerVO[]
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <transition name="drawer">
    <div v-if="visible" class="fixed inset-0 z-50 flex">
      <div @click="emit('close')" class="absolute inset-0 bg-black/20 backdrop-blur-sm"></div>
      <div class="relative ml-auto w-[400px] h-full bg-white shadow-xl">
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 class="text-base font-semibold text-gray-800">MCP 服务器管理</h2>
          <button @click="emit('close')" class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-slate-50 transition-all">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div v-if="servers.length === 0" class="p-5 text-xs text-gray-400 text-center">暂无 MCP 服务器</div>
        <div v-else class="p-5 space-y-3">
          <div v-for="mcp in servers" :key="mcp.id" class="flex items-center gap-3 p-4 rounded-xl border border-slate-100 hover:border-slate-200 transition-all shadow-sm">
            <div class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
              <img v-if="mcp.logoUrl" :src="mcp.logoUrl" alt="" class="w-8 h-8 rounded-lg object-contain" />
              <svg v-else class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2"><span class="text-sm font-medium text-gray-800">{{ mcp.name }}</span><span class="w-1.5 h-1.5 rounded-full" :class="mcp.available ? 'bg-emerald-400' : 'bg-gray-300'"></span></div>
              <div class="text-xs text-gray-400 truncate mt-0.5">{{ mcp.description }}</div>
              <div class="text-xs text-gray-300 truncate mt-0.5">{{ mcp.url }}</div>
            </div>
            <span class="text-xs font-medium px-2 py-1 rounded-full" :class="mcp.available ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-50 text-gray-400'">{{ mcp.available ? '在线' : '离线' }}</span>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>
