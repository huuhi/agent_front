<script setup lang="ts">
import { ref } from 'vue'
import {
  addMCPServer,
  deleteMCPServer,
  updateMCPServer,
  fetchMCPServerDetail,
  fetchMCPServerFromService,
} from '../api'
import type { MCPServerVO, McpServerItemDTO } from '../api/types'

const props = defineProps<{
  visible: boolean
  servers: MCPServerVO[]
}>()

const emit = defineEmits<{
  close: []
  refresh: []
}>()

type View = 'list' | 'form' | 'detail' | 'service'
const currentView = ref<View>('list')
const errorMsg = ref('')
const submitting = ref(false)
const showTypeOptions = ref(false)

// Editing state — null = adding, non-null = editing
const editingServer = ref<MCPServerVO | null>(null)
const currentServer = ref<MCPServerVO | null>(null)

// Form
const formName = ref('')
const formUrl = ref('')
const formDesc = ref('')
const formLogo = ref('')
const formType = ref('streamable_http')
const formAvailable = ref(true)
const formHeader = ref('')

function resetForm() {
  formName.value = ''
  formUrl.value = ''
  formDesc.value = ''
  formLogo.value = ''
  formType.value = 'streamable_http'
  formAvailable.value = true
  formHeader.value = ''
  editingServer.value = null
}

function openAdd() {
  errorMsg.value = ''
  resetForm()
  currentView.value = 'form'
}

function openEdit(mcp: MCPServerVO) {
  errorMsg.value = ''
  editingServer.value = mcp
  formName.value = mcp.name
  formUrl.value = mcp.url
  formDesc.value = mcp.description || ''
  formLogo.value = mcp.logoUrl || ''
  formType.value = mcp.type || 'streamable_http'
  formAvailable.value = mcp.available
  formHeader.value = ''
  currentView.value = 'form'
}

async function openDetail(mcp: MCPServerVO) {
  errorMsg.value = ''
  submitting.value = true
  currentView.value = 'detail'
  try {
    currentServer.value = await fetchMCPServerDetail(Number(mcp.id))
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '获取详情失败'
  } finally {
    submitting.value = false
  }
}

// Service provider
const serviceServers = ref<MCPServerVO[]>([])
const loadingService = ref(false)

async function openService() {
  errorMsg.value = ''
  loadingService.value = true
  currentView.value = 'service'
  try {
    const data = await fetchMCPServerFromService()
    serviceServers.value = Array.isArray(data) ? data as unknown as MCPServerVO[] : []
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '获取服务列表失败'
    serviceServers.value = []
  } finally {
    loadingService.value = false
  }
}

async function importFromService(svr: MCPServerVO) {
  errorMsg.value = ''
  submitting.value = true
  try {
    await addMCPServer({
      id: 0, name: svr.name, url: svr.url,
      description: svr.description || '', logoUrl: svr.logoUrl || '',
      type: svr.type || 'streamable_http', available: svr.available,
    })
    emit('refresh')
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '导入失败'
  } finally {
    submitting.value = false
  }
}

// Save
async function handleSave() {
  if (!formName.value.trim() || !formUrl.value.trim()) return
  errorMsg.value = ''
  submitting.value = true

  let header: Record<string, unknown> | undefined
  if (formHeader.value.trim()) {
    try { header = JSON.parse(formHeader.value.trim()) }
    catch {
      errorMsg.value = 'Header 格式错误，请输入有效 JSON'
      submitting.value = false
      return
    }
  }

  try {
    const payload: McpServerItemDTO = {
      id: editingServer.value ? Number(editingServer.value.id) : 0,
      name: formName.value.trim(),
      url: formUrl.value.trim(),
      description: formDesc.value.trim() || undefined,
      logoUrl: formLogo.value.trim() || undefined,
      type: formType.value,
      available: formAvailable.value,
      header,
    }
    if (editingServer.value) {
      await updateMCPServer(payload)
    } else {
      await addMCPServer(payload)
    }
    emit('refresh')
    currentView.value = 'list'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    submitting.value = false
  }
}

async function handleDelete(id: string) {
  if (!confirm('确定删除此 MCP 服务器?')) return
  errorMsg.value = ''
  try {
    await deleteMCPServer(Number(id))
    emit('refresh')
    currentView.value = 'list'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '删除失败'
  }
}

function goBack() {
  errorMsg.value = ''
  currentView.value = 'list'
}

function close() {
  currentView.value = 'list'
  emit('close')
}
</script>

<template>
  <transition name="modal">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div @click="close" class="absolute inset-0 bg-black/20 backdrop-blur-sm"></div>
      <div class="relative w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-xl border border-slate-100 flex flex-col overflow-hidden">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div class="flex items-center gap-2">
            <button v-if="currentView !== 'list'" @click="goBack" class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-slate-50 transition-all">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <h2 class="text-lg font-semibold text-gray-800">
              <template v-if="currentView === 'form'">{{ editingServer ? '编辑 MCP 服务器' : '添加 MCP 服务器' }}</template>
              <template v-else-if="currentView === 'detail'">MCP 服务器详情</template>
              <template v-else-if="currentView === 'service'">从服务商获取 MCP</template>
              <template v-else>MCP 服务器管理</template>
            </h2>
          </div>
          <button @click="close" class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-slate-50 transition-all">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- Error -->
        <div v-if="errorMsg" class="mx-6 mt-4 px-4 py-2.5 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">{{ errorMsg }}</div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto p-6">

          <!-- ========== LIST ========== -->
          <div v-if="currentView === 'list'" class="space-y-4">
            <div class="flex items-center gap-3">
              <button @click="openAdd" class="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-slate-50 border-2 border-dashed border-slate-200 hover:border-slate-300 transition-all">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                手动添加
              </button>
              <button @click="openService" class="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-slate-50 border-2 border-dashed border-slate-200 hover:border-slate-300 transition-all">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                从服务商获取
              </button>
            </div>

            <div v-if="servers.length === 0" class="text-center py-16">
              <svg class="w-16 h-16 mx-auto text-slate-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
              <p class="text-sm text-gray-400">暂无 MCP 服务器</p>
              <p class="text-xs text-gray-300 mt-2">点击上方按钮添加或从服务商获取</p>
            </div>

            <div v-for="mcp in servers" :key="mcp.id" class="flex items-start gap-4 p-4 rounded-xl border border-slate-100 hover:border-slate-200 transition-all shadow-sm">
              <div class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <img v-if="mcp.logoUrl" :src="mcp.logoUrl" alt="" class="w-8 h-8 rounded-lg object-contain" />
                <svg v-else class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold text-gray-800">{{ mcp.name }}</span>
                  <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="mcp.available ? 'bg-emerald-400' : 'bg-gray-300'"></span>
                  <span class="text-[11px]" :class="mcp.available ? 'text-emerald-600' : 'text-gray-400'">{{ mcp.available ? '在线' : '离线' }}</span>
                </div>
                <p class="text-xs text-gray-400 mt-0.5 line-clamp-1">{{ mcp.description || '暂无描述' }}</p>
                <p class="text-[11px] text-gray-300 mt-0.5 font-mono truncate">{{ mcp.url }}</p>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button @click="openDetail(mcp)" class="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all">详情</button>
                <button @click="openEdit(mcp)" class="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-all">编辑</button>
                <button @click="handleDelete(mcp.id)" class="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all">删除</button>
              </div>
            </div>
          </div>

          <!-- ========== FORM (Add / Edit) ========== -->
          <div v-if="currentView === 'form'" class="max-w-xl mx-auto space-y-5">
            <div class="grid grid-cols-2 gap-4">
              <div class="col-span-2 sm:col-span-1">
                <label class="block text-sm font-medium text-gray-600 mb-1.5">名称 <span class="text-red-400">*</span></label>
                <input v-model="formName" type="text" placeholder="例如：Fetch网页内容抓取" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all" />
              </div>
              <div class="col-span-2 sm:col-span-1">
                <label class="block text-sm font-medium text-gray-600 mb-1.5">类型</label>
                <div class="relative">
                  <button @click="showTypeOptions = !showTypeOptions" type="button"
                    class="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white hover:border-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
                  >
                    <span :class="formType === 'streamable_http' ? 'text-gray-800' : 'text-gray-800'">{{ formType }}</span>
                    <svg class="w-4 h-4 text-gray-400 shrink-0" :class="showTypeOptions ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                  </button>
                  <div v-if="showTypeOptions" class="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    <button @click="formType = 'streamable_http'; showTypeOptions = false" type="button"
                      class="w-full px-3.5 py-2.5 text-sm text-left transition-colors"
                      :class="formType === 'streamable_http' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-slate-50'"
                    >streamable_http</button>
                    <button @click="formType = 'stdio'; showTypeOptions = false" type="button"
                      class="w-full px-3.5 py-2.5 text-sm text-left transition-colors"
                      :class="formType === 'stdio' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-slate-50'"
                    >stdio</button>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1.5">URL <span class="text-red-400">*</span></label>
              <input v-model="formUrl" type="text" placeholder="https://mcp.example.com/mcp" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all" />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1.5">描述</label>
              <input v-model="formDesc" type="text" placeholder="MCP 服务器的功能描述" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all" />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1.5">Logo URL</label>
              <input v-model="formLogo" type="text" placeholder="https://example.com/logo.png" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all" />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1.5">Header <span class="text-gray-300 font-normal">（JSON 格式，可选）</span></label>
              <textarea v-model="formHeader" placeholder='{&#10;  "Authorization": "Bearer xxx"&#10;}' rows="3" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"></textarea>
            </div>

            <label class="flex items-center gap-2.5 text-sm text-gray-600 cursor-pointer select-none p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-all">
              <input type="checkbox" v-model="formAvailable" class="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-400" />
              启用
            </label>

            <div class="flex items-center gap-3 pt-2">
              <button @click="goBack" class="flex-1 px-4 py-2.5 rounded-xl text-sm text-gray-400 hover:text-gray-600 hover:bg-slate-50 border border-slate-200 transition-all">取消</button>
              <button @click="handleSave" :disabled="submitting || !formName.trim() || !formUrl.trim()"
                class="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-all shadow-sm"
                :class="submitting || !formName.trim() || !formUrl.trim() ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'"
              >{{ submitting ? '保存中...' : editingServer ? '保存修改' : '添加服务器' }}</button>
            </div>
          </div>

          <!-- ========== DETAIL ========== -->
          <div v-if="currentView === 'detail'" class="max-w-xl mx-auto">
            <div v-if="submitting" class="flex items-center justify-center py-16">
              <div class="w-5 h-5 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin"></div>
              <span class="ml-3 text-sm text-gray-400">加载中...</span>
            </div>
            <div v-else-if="currentServer" class="space-y-6">
              <div class="flex items-center gap-4">
                <div class="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <img v-if="currentServer.logoUrl" :src="currentServer.logoUrl" alt="" class="w-10 h-10 rounded-xl object-contain" />
                  <svg v-else class="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
                </div>
                <div>
                  <div class="text-lg font-semibold text-gray-800">{{ currentServer.name }}</div>
                  <div class="flex items-center gap-1.5 mt-1">
                    <span class="w-2 h-2 rounded-full" :class="currentServer.available ? 'bg-emerald-400' : 'bg-gray-300'"></span>
                    <span class="text-sm" :class="currentServer.available ? 'text-emerald-600' : 'text-gray-400'">{{ currentServer.available ? '在线' : '离线' }}</span>
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-x-6 gap-y-4 bg-slate-50 rounded-xl p-5">
                <div>
                  <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">ID</div>
                  <div class="text-sm text-gray-700 mt-0.5">{{ currentServer.id }}</div>
                </div>
                <div>
                  <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">类型</div>
                  <div class="text-sm text-gray-700 mt-0.5">{{ currentServer.type }}</div>
                </div>
                <div class="col-span-2">
                  <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">URL</div>
                  <div class="text-sm text-gray-700 mt-0.5 font-mono break-all">{{ currentServer.url }}</div>
                </div>
                <div v-if="currentServer.strId" class="col-span-2">
                  <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">服务商 ID</div>
                  <div class="text-sm text-gray-700 mt-0.5">{{ currentServer.strId }}</div>
                </div>
                <div v-if="currentServer.description" class="col-span-2">
                  <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">描述</div>
                  <p class="text-sm text-gray-700 mt-0.5 leading-relaxed">{{ currentServer.description }}</p>
                </div>
              </div>

              <div class="flex items-center gap-3">
                <button @click="openEdit(currentServer)" class="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-all">编辑</button>
                <button @click="handleDelete(currentServer.id)" class="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 transition-all">删除</button>
              </div>
            </div>
          </div>

          <!-- ========== SERVICE PROVIDER ========== -->
          <div v-if="currentView === 'service'" class="space-y-3">
            <div v-if="loadingService" class="flex items-center justify-center py-16">
              <div class="w-5 h-5 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin"></div>
              <span class="ml-3 text-sm text-gray-400">正在获取服务列表...</span>
            </div>
            <div v-else-if="serviceServers.length === 0" class="text-center py-16">
              <svg class="w-16 h-16 mx-auto text-slate-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              <p class="text-sm text-gray-400">暂无可用服务</p>
            </div>
            <div v-for="svr in serviceServers" :key="svr.id || svr.url" class="flex items-start gap-4 p-4 rounded-xl border border-slate-100 hover:border-slate-200 transition-all shadow-sm">
              <div class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <img v-if="svr.logoUrl" :src="svr.logoUrl" alt="" class="w-8 h-8 rounded-lg object-contain" />
                <svg v-else class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-semibold text-gray-800">{{ svr.name }}</div>
                <p class="text-xs text-gray-400 mt-0.5 line-clamp-1">{{ svr.description || '暂无描述' }}</p>
                <p class="text-[11px] text-gray-300 mt-0.5 font-mono truncate">{{ svr.url }}</p>
              </div>
              <button @click="importFromService(svr)" :disabled="submitting" class="shrink-0 px-4 py-2 rounded-xl text-sm font-medium text-blue-600 hover:bg-blue-50 border border-blue-200 transition-all disabled:opacity-40">{{ submitting ? '导入中...' : '导入' }}</button>
            </div>
          </div>

        </div>
      </div>
    </div>
  </transition>
</template>
