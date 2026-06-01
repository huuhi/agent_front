<script setup lang="ts">
import { ref } from 'vue'
import { addMCPServer, deleteMCPServer, toggleMCPServer } from '../api'
import type { MCPServerVO } from '../api/types'

const props = defineProps<{
  visible: boolean
  servers: MCPServerVO[]
}>()

const emit = defineEmits<{
  close: []
  refresh: []
}>()

// Add server form
const showForm = ref(false)
const adding = ref(false)
const newName = ref('')
const newUrl = ref('')
const newDesc = ref('')

function resetForm() {
  newName.value = ''
  newUrl.value = ''
  newDesc.value = ''
  showForm.value = false
}

async function handleAdd() {
  if (!newName.value.trim() || !newUrl.value.trim()) return
  adding.value = true
  try {
    await addMCPServer({
      name: newName.value.trim(),
      url: newUrl.value.trim(),
      description: newDesc.value.trim() || undefined,
    })
    resetForm()
    emit('refresh')
  } catch (e) {
    console.error('[AddMCP]', e)
  } finally {
    adding.value = false
  }
}

async function handleToggle(mcp: MCPServerVO) {
  try {
    await toggleMCPServer(mcp.id, !mcp.available)
    emit('refresh')
  } catch (e) {
    console.error('[ToggleMCP]', e)
  }
}

async function handleDelete(id: string) {
  if (!confirm('确定删除此 MCP 服务器?')) return
  try {
    await deleteMCPServer(id)
    emit('refresh')
  } catch (e) {
    console.error('[DeleteMCP]', e)
  }
}
</script>

<template>
  <transition name="drawer">
    <div v-if="visible" class="fixed inset-0 z-50 flex">
      <div @click="emit('close')" class="absolute inset-0 bg-black/20 backdrop-blur-sm"></div>
      <div class="relative ml-auto w-[420px] h-full bg-white shadow-xl flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h2 class="text-base font-semibold text-gray-800">MCP 服务器管理</h2>
          <button @click="emit('close')" class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-slate-50 transition-all">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-5 space-y-3">
          <!-- Add Server Button / Form -->
          <button v-if="!showForm" @click="showForm = true"
            class="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-slate-50 border border-dashed border-slate-200 transition-all"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            添加 MCP 服务器
          </button>

          <div v-else class="rounded-xl border border-slate-100 p-4 space-y-3 bg-slate-50/50">
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">名称 <span class="text-red-400">*</span></label>
              <input v-model="newName" type="text" placeholder="例如：文件系统" class="w-full px-3 py-2 rounded-lg border border-slate-100 text-sm focus:outline-none focus:border-blue-300 bg-white" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">URL <span class="text-red-400">*</span></label>
              <input v-model="newUrl" type="text" placeholder="http://localhost:3000/mcp" class="w-full px-3 py-2 rounded-lg border border-slate-100 text-sm focus:outline-none focus:border-blue-300 bg-white" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">描述</label>
              <input v-model="newDesc" type="text" placeholder="可选" class="w-full px-3 py-2 rounded-lg border border-slate-100 text-sm focus:outline-none focus:border-blue-300 bg-white" />
            </div>
            <div class="flex items-center justify-between pt-1">
              <button @click="resetForm" class="text-xs text-gray-400 hover:text-gray-600">取消</button>
              <button @click="handleAdd" :disabled="adding || !newName.trim() || !newUrl.trim()"
                class="px-4 py-1.5 text-xs font-medium text-white rounded-lg transition-all shadow-sm"
                :class="adding || !newName.trim() || !newUrl.trim() ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'"
              >{{ adding ? '添加中...' : '添加' }}</button>
            </div>
          </div>

          <!-- Empty State -->
          <div v-if="servers.length === 0 && !showForm" class="text-center py-10">
            <svg class="w-12 h-12 mx-auto text-slate-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
            <p class="text-xs text-gray-400">暂无 MCP 服务器</p>
            <p class="text-xs text-gray-300 mt-1">点击上方按钮添加</p>
          </div>

          <!-- Server Cards -->
          <div v-for="mcp in servers" :key="mcp.id"
            class="flex items-start gap-3 p-4 rounded-xl border transition-all shadow-sm"
            :class="mcp.available ? 'border-slate-100 hover:border-slate-200' : 'border-slate-50 bg-slate-50/50'"
          >
            <div class="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
              <img v-if="mcp.logoUrl" :src="mcp.logoUrl" alt="" class="w-7 h-7 rounded-lg object-contain" />
              <svg v-else class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium" :class="mcp.available ? 'text-gray-800' : 'text-gray-400'">{{ mcp.name }}</span>
                <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="mcp.available ? 'bg-emerald-400' : 'bg-gray-300'"></span>
                <span class="text-[10px]" :class="mcp.available ? 'text-emerald-600' : 'text-gray-400'">{{ mcp.available ? '在线' : '离线' }}</span>
              </div>
              <div class="text-xs text-gray-400 truncate mt-0.5">{{ mcp.description || '暂无描述' }}</div>
              <div class="text-[11px] text-gray-300 truncate mt-0.5 font-mono">{{ mcp.url }}</div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <!-- Toggle -->
              <button @click="handleToggle(mcp)"
                class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200"
                :class="mcp.available ? 'bg-emerald-400' : 'bg-gray-200'"
              >
                <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200" :class="mcp.available ? 'translate-x-[18px]' : 'translate-x-[3px]'"></span>
              </button>
              <!-- Delete -->
              <button @click="handleDelete(mcp.id)" class="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all" title="删除">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>
