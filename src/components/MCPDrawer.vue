<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import {
  addMCPServer,
  batchAddMCPServer,
  deleteMCPServer,
  updateMCPServer,
  fetchMCPServerDetail,
  fetchMCPServerFromService,
  fetchMCPConfig,
  saveMCPConfig,
  uploadImage,
} from '../api'
import type { MCPServerVO, McpServerItemDTO } from '../api/types'
import { useToast } from '../composables/useToast'

const { show: showToast } = useToast()

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
const logoError = ref(false)
const uploadingLogo = ref(false)
const logoInputRef = ref<HTMLInputElement | null>(null)

async function onUploadLogo(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadingLogo.value = true
  try {
    const url = await uploadImage(file)
    formLogo.value = url
    logoError.value = false
  } catch {
    logoError.value = true
  } finally {
    uploadingLogo.value = false
    input.value = ''
  }
}

// Delete confirmation
const deleteConfirmId = ref<string | null>(null)

// Batch import
const importingAll = ref(false)
/** Per-item import loading state — tracks which servers are currently being imported */
const importingIds = ref<Set<string>>(new Set())
/** Selected servers from the service provider view for batch import */
const importSelection = ref<Set<string>>(new Set())

// MCP API Key
const mcpKey = ref('')
const mcpKeyInput = ref('')
const savingKey = ref(false)
const showMcpKeyInput = ref(false)

async function loadMCPKey() {
  try {
    mcpKey.value = await fetchMCPConfig()
  } catch { /* ignore */ }
}

async function saveMCPKey() {
  if (!mcpKeyInput.value.trim()) return
  savingKey.value = true
  try {
    await saveMCPConfig(mcpKeyInput.value.trim())
    mcpKey.value = await fetchMCPConfig()
    mcpKeyInput.value = ''
    showMcpKeyInput.value = false
    errorMsg.value = ''
    showToast('MCP Key 已保存')
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    savingKey.value = false
  }
}

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
  serviceServers.value = []     // Clear stale data before loading (Issue 3)
  importSelection.value = new Set()  // Reset selection
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
  const key = svr.id || svr.url || svr.name
  errorMsg.value = ''
  importingIds.value = new Set(importingIds.value).add(key)
  try {
    await addMCPServer({
      id: 0, strId: svr.strId || undefined, name: svr.name, url: svr.url,
      description: svr.description || '', logoUrl: svr.logoUrl || '',
      type: svr.type || 'streamable_http', available: svr.available,
    })
    emit('refresh')
    showToast('导入成功')
    // Remove from selection once imported
    const sel = new Set(importSelection.value)
    sel.delete(key)
    importSelection.value = sel
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '导入失败'
  } finally {
    const next = new Set(importingIds.value)
    next.delete(key)
    importingIds.value = next
  }
}

function toggleSelectService(key: string) {
  const next = new Set(importSelection.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  importSelection.value = next
}

function toggleSelectAll() {
  if (importSelection.value.size === serviceServers.value.length) {
    importSelection.value = new Set()
  } else {
    importSelection.value = new Set(serviceServers.value.map(svr => svr.id || svr.url || svr.name))
  }
}

async function importSelected() {
  const selected = serviceServers.value.filter(svr => importSelection.value.has(svr.id || svr.url || svr.name))
  if (selected.length === 0) return
  errorMsg.value = ''
  importingAll.value = true
  try {
    const payloads = selected.map(svr => ({
      id: 0, strId: svr.strId || undefined, name: svr.name, url: svr.url,
      description: svr.description || '', logoUrl: svr.logoUrl || '',
      type: svr.type || 'streamable_http', available: svr.available,
    }))
    await batchAddMCPServer(payloads)
    emit('refresh')
    showToast('批量导入成功')
    importSelection.value = new Set()
    currentView.value = 'list'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '批量导入失败'
  } finally {
    importingAll.value = false
  }
}

async function importAllFromService() {
  errorMsg.value = ''
  importingAll.value = true
  try {
    const payloads = serviceServers.value.map(svr => ({
      id: 0, strId: svr.strId || undefined, name: svr.name, url: svr.url,
      description: svr.description || '', logoUrl: svr.logoUrl || '',
      type: svr.type || 'streamable_http', available: svr.available,
    }))
    await batchAddMCPServer(payloads)
    emit('refresh')
    showToast('批量导入成功')
    currentView.value = 'list'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '批量导入失败'
  } finally {
    importingAll.value = false
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
      showToast('MCP 服务器已更新')
    } else {
      await addMCPServer(payload)
      showToast('MCP 服务器已添加')
    }
    emit('refresh')
    currentView.value = 'list'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    submitting.value = false
  }
}

function handleDelete(id: string) {
  deleteConfirmId.value = id
}

async function confirmDelete() {
  const id = deleteConfirmId.value
  if (!id) return
  deleteConfirmId.value = null
  errorMsg.value = ''
  try {
    await deleteMCPServer(Number(id))
    emit('refresh')
    showToast('MCP 服务器已删除')
    currentView.value = 'list'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '删除失败'
  }
}

function goBack() {
  errorMsg.value = ''
  currentView.value = 'list'
}

// Load MCP API Key only when the drawer opens, not on every navigation
watch(() => props.visible, (v) => {
  if (v) loadMCPKey()
})

function close() {
  currentView.value = 'list'
  emit('close')
}

// Keyboard: Escape goes back or closes
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (currentView.value !== 'list') {
      goBack()
    } else {
      close()
    }
  }
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <transition name="modal">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div @click="currentView !== 'list' ? goBack() : close()" class="absolute inset-0 bg-black/20 backdrop-blur-sm cursor-pointer"></div>
      <div @click.stop class="relative w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-xl border border-stone-100 flex flex-col overflow-hidden">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-stone-100 shrink-0">
          <div class="flex items-center gap-2">
            <button v-if="currentView !== 'list'" @click="goBack" class="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-50 transition-all">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <h2 class="text-lg font-semibold text-stone-800">
              <template v-if="currentView === 'form'">{{ editingServer ? '编辑 MCP 服务器' : '添加 MCP 服务器' }}</template>
              <template v-else-if="currentView === 'detail'">MCP 服务器详情</template>
              <template v-else-if="currentView === 'service'">从服务商获取 MCP</template>
              <template v-else>MCP 服务器管理</template>
            </h2>
          </div>
          <div class="flex items-center gap-3">
            <div v-if="currentView === 'list'" class="flex items-center gap-2 text-xs">
              <template v-if="mcpKey">
                <span class="text-stone-400">Key:</span>
                <code class="font-mono text-stone-600 bg-stone-50 px-1.5 py-0.5 rounded border border-stone-100">{{ mcpKey }}</code>
                <button v-if="!showMcpKeyInput" @click="showMcpKeyInput = true" class="text-violet-500 hover:text-violet-600 underline">修改</button>
              </template>
              <template v-else>
                <button @click="showMcpKeyInput = true" class="text-violet-500 hover:text-violet-600 underline text-xs">配置 MCP Key</button>
              </template>
              <a href="https://www.modelscope.cn/mcp" target="_blank" rel="noopener noreferrer" class="text-stone-400 hover:text-stone-500 underline">modelscope</a>
            </div>
            <button @click="close" class="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-50 transition-all">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <!-- MCP Key input overlay (only when editing) -->
        <div v-if="showMcpKeyInput" class="px-6 py-3 border-b border-stone-100 bg-stone-50 flex items-center gap-2">
          <input v-model="mcpKeyInput" type="text" placeholder="输入 modelscope 的 MCP API Key"
            class="flex-1 px-3 py-1.5 rounded-lg border border-stone-200 text-sm focus:outline-none focus:border-violet-400" />
          <button @click="saveMCPKey" :disabled="savingKey || !mcpKeyInput.trim()"
            class="px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-all"
            :class="savingKey || !mcpKeyInput.trim() ? 'bg-violet-300 cursor-not-allowed' : 'bg-violet-500 hover:bg-violet-600'"
          >{{ savingKey ? '保存...' : '保存' }}</button>
          <button @click="showMcpKeyInput = false; mcpKeyInput = ''" class="px-3 py-1.5 rounded-lg text-sm text-stone-400 hover:text-stone-600 hover:bg-white transition-all">取消</button>
        </div>

        <!-- Error -->
        <div v-if="errorMsg" class="mx-6 mt-4 px-4 py-2.5 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">{{ errorMsg }}</div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto p-6 min-h-[360px]">

          <!-- ========== LIST ========== -->
          <div v-if="currentView === 'list'" class="space-y-4">
            <div class="flex items-center gap-3">
              <button @click="openAdd" class="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-stone-500 hover:text-stone-700 hover:bg-stone-50 border-2 border-dashed border-stone-200 hover:border-stone-300 transition-all">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                手动添加
              </button>
              <button @click="openService" class="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-stone-500 hover:text-stone-700 hover:bg-stone-50 border-2 border-dashed border-stone-200 hover:border-stone-300 transition-all">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                从服务商获取
              </button>
            </div>

            <div v-if="servers.length === 0" class="text-center py-16">
              <svg class="w-16 h-16 mx-auto text-stone-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
              <p class="text-sm text-stone-400">暂无 MCP 服务器</p>
              <p class="text-xs text-stone-300 mt-2">点击上方按钮添加或从服务商获取</p>
            </div>

            <div v-for="mcp in servers" :key="mcp.id" class="flex items-start gap-4 p-4 rounded-xl border border-stone-100 hover:border-stone-200 transition-all shadow-sm">
              <div class="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center shrink-0">
                <img v-if="mcp.logoUrl" :src="mcp.logoUrl" alt="" class="w-8 h-8 rounded-lg object-contain" />
                <svg v-else class="w-5 h-5 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold text-stone-800">{{ mcp.name }}</span>
                  <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="mcp.available ? 'bg-emerald-400' : 'bg-stone-300'"></span>
                  <span class="text-[11px]" :class="mcp.available ? 'text-emerald-600' : 'text-stone-400'">{{ mcp.available ? '在线' : '离线' }}</span>
                </div>
                <p class="text-xs text-stone-400 mt-0.5 line-clamp-1">{{ mcp.description || '暂无描述' }}</p>
                <p class="text-[11px] text-stone-300 mt-0.5 font-mono truncate">{{ mcp.url }}</p>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button @click="openDetail(mcp)" class="px-3 py-1.5 rounded-lg text-xs text-stone-400 hover:text-violet-600 hover:bg-violet-50 transition-all">详情</button>
                <button @click="openEdit(mcp)" class="px-3 py-1.5 rounded-lg text-xs text-stone-400 hover:text-amber-600 hover:bg-amber-50 transition-all">编辑</button>
                <button @click="handleDelete(mcp.id)" class="px-3 py-1.5 rounded-lg text-xs text-stone-400 hover:text-red-600 hover:bg-red-50 transition-all">删除</button>
              </div>
            </div>
          </div>

          <!-- ========== FORM (Add / Edit) ========== -->

          <!-- ========== FORM (Add / Edit) ========== -->
          <div v-if="currentView === 'form'" class="max-w-xl mx-auto space-y-5">
            <div class="grid grid-cols-2 gap-4">
              <div class="col-span-2 sm:col-span-1">
                <label class="block text-sm font-medium text-stone-600 mb-1.5">名称 <span class="text-red-400">*</span></label>
                <input v-model="formName" type="text" placeholder="例如：Fetch网页内容抓取" class="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-50 transition-all" />
              </div>
              <div class="col-span-2 sm:col-span-1">
                <label class="block text-sm font-medium text-stone-600 mb-1.5">类型</label>
                <div class="relative">
                  <button @click="showTypeOptions = !showTypeOptions" type="button"
                    class="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-white hover:border-stone-300 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-50 transition-all"
                  >
                    <span :class="formType === 'streamable_http' ? 'text-stone-800' : 'text-stone-800'">{{ formType }}</span>
                    <svg class="w-4 h-4 text-stone-400 shrink-0" :class="showTypeOptions ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                  </button>
                  <div v-if="showTypeOptions" class="absolute z-10 mt-1 w-full bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden">
                    <button @click="formType = 'streamable_http'; showTypeOptions = false" type="button"
                      class="w-full px-3.5 py-2.5 text-sm text-left transition-colors"
                      :class="formType === 'streamable_http' ? 'bg-violet-50 text-violet-700 font-medium' : 'text-stone-600 hover:bg-stone-50'"
                    >streamable_http</button>
                    <button @click="formType = 'stdio'; showTypeOptions = false" type="button"
                      class="w-full px-3.5 py-2.5 text-sm text-left transition-colors"
                      :class="formType === 'stdio' ? 'bg-violet-50 text-violet-700 font-medium' : 'text-stone-600 hover:bg-stone-50'"
                    >stdio</button>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-stone-600 mb-1.5">URL <span class="text-red-400">*</span></label>
              <input v-model="formUrl" type="text" placeholder="https://mcp.example.com/mcp" class="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-50 transition-all" />
            </div>

            <div>
              <label class="block text-sm font-medium text-stone-600 mb-1.5">描述</label>
              <input v-model="formDesc" type="text" placeholder="MCP 服务器的功能描述" class="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-50 transition-all" />
            </div>

            <div>
              <label class="block text-sm font-medium text-stone-600 mb-1.5">Logo</label>
              <div class="flex items-start gap-4">
                <div class="w-20 h-20 rounded-xl border border-stone-200 bg-stone-50 flex items-center justify-center shrink-0 overflow-hidden">
                  <img v-if="formLogo && !logoError" :src="formLogo" @error="logoError = true" @load="logoError = false"
                    class="w-full h-full object-contain" />
                  <svg v-else class="w-6 h-6 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                  </svg>
                </div>
                <div class="flex-1">
                  <input ref="logoInputRef" type="file" accept="image/*" class="hidden" @change="onUploadLogo" />
                  <button type="button" @click="logoInputRef?.click()" :disabled="uploadingLogo"
                    class="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm text-stone-500 hover:text-stone-700 hover:bg-stone-50 transition-all disabled:opacity-40"
                  >
                    <svg v-if="uploadingLogo" class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                    {{ uploadingLogo ? '上传中...' : '上传图片' }}
                  </button>
                  <p v-if="logoError" class="text-[11px] text-red-400 mt-1">图片加载失败</p>
                </div>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-stone-600 mb-1.5">Header <span class="text-stone-300 font-normal">（JSON 格式，可选）</span></label>
              <textarea v-model="formHeader" placeholder='{&#10;  "Authorization": "Bearer xxx"&#10;}' rows="3" class="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm font-mono focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-50 transition-all"></textarea>
            </div>

            <label class="flex items-center gap-2.5 text-sm text-stone-600 cursor-pointer select-none p-3 rounded-xl border border-stone-100 hover:bg-stone-50 transition-all">
              <input type="checkbox" v-model="formAvailable" class="w-4 h-4 rounded border-stone-300 text-violet-500 focus:ring-violet-400" />
              启用
            </label>

            <div class="flex items-center gap-3 pt-2">
              <button @click="goBack" class="flex-1 px-4 py-2.5 rounded-xl text-sm text-stone-400 hover:text-stone-600 hover:bg-stone-50 border border-stone-200 transition-all">取消</button>
              <button @click="handleSave" :disabled="submitting || !formName.trim() || !formUrl.trim()"
                class="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-all shadow-sm"
                :class="submitting || !formName.trim() || !formUrl.trim() ? 'bg-violet-300 cursor-not-allowed' : 'bg-violet-500 hover:bg-violet-600'"
              >{{ submitting ? '保存中...' : editingServer ? '保存修改' : '添加服务器' }}</button>
            </div>
          </div>

          <!-- ========== DETAIL ========== -->
          <div v-if="currentView === 'detail'" class="max-w-xl mx-auto">
            <div v-if="submitting" class="flex items-center justify-center py-16">
              <div class="w-5 h-5 rounded-full border-2 border-violet-200 border-t-violet-500 animate-spin"></div>
              <span class="ml-3 text-sm text-stone-400">加载中...</span>
            </div>
            <div v-else-if="currentServer" class="space-y-6">
              <div class="flex items-center gap-4">
                <div class="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center">
                  <img v-if="currentServer.logoUrl" :src="currentServer.logoUrl" alt="" class="w-10 h-10 rounded-xl object-contain" />
                  <svg v-else class="w-6 h-6 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
                </div>
                <div>
                  <div class="text-lg font-semibold text-stone-800">{{ currentServer.name }}</div>
                  <div class="flex items-center gap-1.5 mt-1">
                    <span class="w-2 h-2 rounded-full" :class="currentServer.available ? 'bg-emerald-400' : 'bg-stone-300'"></span>
                    <span class="text-sm" :class="currentServer.available ? 'text-emerald-600' : 'text-stone-400'">{{ currentServer.available ? '在线' : '离线' }}</span>
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-x-6 gap-y-4 bg-stone-50 rounded-xl p-5">
                <div>
                  <div class="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">ID</div>
                  <div class="text-sm text-stone-700 mt-0.5">{{ currentServer.id }}</div>
                </div>
                <div>
                  <div class="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">类型</div>
                  <div class="text-sm text-stone-700 mt-0.5">{{ currentServer.type }}</div>
                </div>
                <div class="col-span-2">
                  <div class="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">URL</div>
                  <div class="text-sm text-stone-700 mt-0.5 font-mono break-all">{{ currentServer.url }}</div>
                </div>
                <div v-if="currentServer.strId" class="col-span-2">
                  <div class="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">服务商 ID</div>
                  <div class="text-sm text-stone-700 mt-0.5">{{ currentServer.strId }}</div>
                </div>
                <div v-if="currentServer.description" class="col-span-2">
                  <div class="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">描述</div>
                  <p class="text-sm text-stone-700 mt-0.5 leading-relaxed">{{ currentServer.description }}</p>
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
              <div class="w-5 h-5 rounded-full border-2 border-violet-200 border-t-violet-500 animate-spin"></div>
              <span class="ml-3 text-sm text-stone-400">正在获取服务列表...</span>
            </div>
            <div v-else-if="serviceServers.length === 0" class="text-center py-16">
              <svg class="w-16 h-16 mx-auto text-stone-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              <p class="text-sm text-stone-400">暂无可用服务</p>
            </div>
            <div v-else class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-3">
                <span class="text-sm text-stone-400">共 {{ serviceServers.length }} 个服务</span>
                <button @click="toggleSelectAll" class="text-xs font-medium text-violet-500 hover:text-violet-600 transition-colors">
                  {{ importSelection.size === serviceServers.length ? '取消全选' : '全选' }}
                </button>
              </div>
              <div class="flex items-center gap-2">
                <button @click="importAllFromService" :disabled="importingAll"
                  class="px-4 py-2 rounded-xl text-sm font-medium transition-all border disabled:opacity-40"
                  :class="importingAll
                    ? 'text-stone-400 bg-stone-50 border-stone-200'
                    : 'text-violet-600 bg-violet-50 hover:bg-violet-100 border-violet-200'"
                >{{ importingAll ? '导入中...' : '导入全部' }}</button>
                <button @click="importSelected" :disabled="importSelection.size === 0 || importingAll"
                  class="px-4 py-2 rounded-xl text-sm font-medium transition-all border disabled:opacity-40"
                  :class="importSelection.size > 0
                    ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                    : 'text-stone-400 bg-stone-50 border-stone-200 cursor-not-allowed'"
                >{{ importingAll ? '导入中...' : `导入选中 (${importSelection.size})` }}</button>
              </div>
            </div>
            <div v-for="svr in serviceServers" :key="svr.id || svr.url"
              @click="toggleSelectService(svr.id || svr.url || svr.name)"
              class="flex items-start gap-4 p-4 rounded-xl border transition-all shadow-sm cursor-pointer"
              :class="importSelection.has(svr.id || svr.url || svr.name)
                ? 'border-violet-400 bg-violet-50/40 ring-1 ring-violet-400/30'
                : 'border-stone-100 hover:border-stone-200 hover:bg-stone-50/50'"
            >
              <div class="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center shrink-0 overflow-hidden">
                <img v-if="svr.logoUrl" :src="svr.logoUrl" alt="" class="w-8 h-8 rounded-lg object-contain" />
                <svg v-else class="w-5 h-5 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold text-stone-800">{{ svr.name }}</span>
                  <svg v-if="importSelection.has(svr.id || svr.url || svr.name)" class="w-4 h-4 text-violet-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                </div>
                <p class="text-xs text-stone-400 mt-0.5 line-clamp-1">{{ svr.description || '暂无描述' }}</p>
                <p class="text-[11px] text-stone-300 mt-0.5 font-mono truncate">{{ svr.url }}</p>
              </div>
              <button @click.stop="importFromService(svr)" :disabled="importingIds.has(svr.id || svr.url || svr.name)"
                class="shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all border disabled:opacity-40"
                :class="importingIds.has(svr.id || svr.url || svr.name)
                  ? 'text-stone-400 bg-stone-50 border-stone-200'
                  : 'text-violet-600 hover:bg-violet-50 border-violet-200'"
              >{{ importingIds.has(svr.id || svr.url || svr.name) ? '导入中...' : '导入' }}</button>
            </div>
          </div>

        </div>
      </div>
    </div>
  </transition>

  <!-- Delete confirmation -->
  <!-- <div v-if="deleteConfirmId" class="fixed inset-0 z-[9999] flex items-center justify-center" @click="deleteConfirmId = null">
    <div class="absolute inset-0 bg-black/20 backdrop-blur-sm"></div>
    <div class="relative bg-white rounded-xl shadow-xl border border-stone-100 p-8 w-96" @click.stop>
      <p class="text-sm text-stone-700 mb-6 ">确定删除此 MCP 服务器？</p>
      <div class="flex items-center gap-4">
        <button @click="deleteConfirmId = null" class="flex-1 px-4 py-2.5 rounded-lg text-sm text-stone-500 hover:text-stone-700 hover:bg-stone-50 border border-stone-200 transition-all">取消</button>
        <button @click="confirmDelete" class="flex-1 px-4 py-2.5 rounded-lg text-sm text-white bg-red-500 hover:bg-red-600 transition-all">删除</button>
      </div>
    </div>
  </div> -->
<div
  v-if="deleteConfirmId"
  class="fixed inset-0 z-[9999] flex items-center justify-center"
  @click="deleteConfirmId = null"
>
  <!-- 背景遮罩 -->
  <div class="absolute inset-0 bg-black/20 backdrop-blur-sm"></div>

  <!-- 弹窗卡片 -->
  <div
    class="relative bg-white rounded-2xl shadow-2xl border border-stone-100 p-8 w-96"
    @click.stop
  >
    <!-- 标题 / 提示文字 -->
    <p class="text-big text-stone-2000 mb-8 leading-relaxed">
      确定删除此 MCP 服务器？
    </p>

    <!-- 按钮组 - 增加顶部间距 -->
    <div class="flex items-center gap-4 pt-2 border-t border-stone-100/60">
      <button
        @click="deleteConfirmId = null"
        class="flex-1 px-4 py-2.5 rounded-lg text-sm text-stone-500 hover:text-stone-700 hover:bg-stone-50 border border-stone-200 transition-all duration-200"
      >
        取消
      </button>
      <button
        @click="confirmDelete"
        class="flex-1 px-4 py-2.5 rounded-lg text-sm text-white bg-red-500 hover:bg-red-600 transition-all duration-200 shadow-sm hover:shadow-md"
      >
        删除
      </button>
    </div>
  </div>
</div>
  
</template>
