<script setup lang="ts">
import { ref } from 'vue'
import { saveUserApiConfig } from '../api'
import type { UserApiConfigVO } from '../api/types'
import { useToast } from '../composables/useToast'
const { show: showToast } = useToast()

const props = defineProps<{
  visible: boolean
  configs: UserApiConfigVO[]
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const editing = ref<Partial<UserApiConfigVO> | null>(null)
const saving = ref(false)
const showForm = ref(false)

function startAdd() {
  editing.value = { name: '', baseUrl: '', apikey: '', model: [] }
  showForm.value = true
}

function startEdit(cfg: UserApiConfigVO) {
  editing.value = { ...cfg }
  showForm.value = true
}

function cancelEdit() {
  editing.value = null
  showForm.value = false
}

async function save() {
  if (!editing.value || !editing.value.baseUrl || !editing.value.apikey) return
  saving.value = true
  try {
    await saveUserApiConfig(editing.value as any)
    emit('saved')
    showToast(editing.value.id ? '配置已更新' : '配置已添加')
    cancelEdit()
  } catch (e) {
    console.error('[SaveConfig]', e)
  } finally {
    saving.value = false
  }
}

async function deleteConfig(cfg: UserApiConfigVO) {
  if (!cfg.id) return
  if (!confirm('确定删除此配置?')) return
  saving.value = true
  try {
    await saveUserApiConfig({ id: cfg.id, baseUrl: '', apikey: '' } as any)
    emit('saved')
    showToast('配置已删除')
  } catch (e) {
    console.error('[DeleteConfig]', e)
  } finally {
    saving.value = false
  }
}

function addModel(m: string) {
  if (!editing.value || !editing.value.model) return
  if (!editing.value.model.includes(m)) {
    editing.value.model = [...editing.value.model, m]
  }
}

function removeModel(m: string) {
  if (!editing.value || !editing.value.model) return
  editing.value.model = editing.value.model.filter(x => x !== m)
}

const newModelInput = ref('')

function addNewModel() {
  if (newModelInput.value.trim()) {
    addModel(newModelInput.value.trim())
    newModelInput.value = ''
  }
}
</script>

<template>
  <transition name="modal">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center">
      <div @click="emit('close')" class="absolute inset-0 bg-black/20 backdrop-blur-sm"></div>
      <div class="relative w-[520px] max-h-[80vh] bg-white rounded-2xl shadow-xl border border-stone-100 flex flex-col">
        <div class="flex items-center justify-between px-6 py-4 border-b border-stone-100 shrink-0">
          <h2 class="text-base font-semibold text-stone-800">API 配置管理</h2>
          <button @click="emit('close')" class="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-50 transition-all">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-6">
          <!-- Config list -->
          <div v-if="!showForm" class="space-y-3">
            <div v-for="cfg in configs" :key="cfg.id || cfg.baseUrl"
              class="flex items-center gap-3 p-3 rounded-xl border border-stone-100 hover:border-stone-200 transition-all"
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-stone-800">{{ cfg.name || cfg.baseUrl }}</span>
                  <span v-if="cfg.isDefault" class="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600">默认</span>
                </div>
                <div class="text-xs text-stone-400 truncate mt-0.5">{{ cfg.baseUrl }}</div>
                <div class="flex items-center gap-1 mt-0.5">
                  <span class="text-[10px] text-stone-400">{{ cfg.apikey?.slice(0, 8) }}...</span>
                  <span class="text-stone-300">|</span>
                  <span class="text-[10px] text-stone-400">{{ cfg.model?.length || 0 }} 个模型</span>
                </div>
              </div>
              <button @click="startEdit(cfg)" class="px-2 py-1 rounded text-[11px] text-stone-400 hover:text-violet-500 hover:bg-violet-50 transition-colors">编辑</button>
              <button @click="deleteConfig(cfg)" class="px-2 py-1 rounded text-[11px] text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors">删除</button>
            </div>
            <div v-if="configs.length === 0" class="text-center py-8 text-xs text-stone-400">暂无 API 配置</div>
            <button @click="startAdd" class="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium text-stone-500 hover:text-stone-700 hover:bg-stone-50 border border-dashed border-stone-200 transition-all">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              添加配置
            </button>
          </div>

          <!-- Add/Edit form -->
          <div v-else-if="editing" class="space-y-4">
            <div>
              <label class="block text-xs font-medium text-stone-500 mb-1">名称</label>
              <input v-model="editing.name" type="text" placeholder="例如：DeepSeek" class="w-full px-3 py-2 rounded-xl border border-stone-100 text-sm focus:outline-none focus:border-stone-300" />
            </div>
            <div>
              <label class="block text-xs font-medium text-stone-500 mb-1">Base URL <span class="text-red-400">*</span></label>
              <input v-model="editing.baseUrl" type="text" placeholder="https://api.deepseek.com" class="w-full px-3 py-2 rounded-xl border border-stone-100 text-sm focus:outline-none focus:border-stone-300" />
            </div>
            <div>
              <label class="block text-xs font-medium text-stone-500 mb-1">API Key <span class="text-red-400">*</span></label>
              <input v-model="editing.apikey" type="text" placeholder="sk-..." class="w-full px-3 py-2 rounded-xl border border-stone-100 text-sm focus:outline-none focus:border-stone-300" />
            </div>
            <div>
              <label class="block text-xs font-medium text-stone-500 mb-1">模型列表</label>
              <div class="flex flex-wrap gap-1.5 mb-2">
                <span v-for="m in editing.model || []" :key="m"
                  class="flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-50 border border-stone-100 text-[11px] text-stone-600"
                >{{ m }}<button @click="removeModel(m)" class="text-stone-400 hover:text-red-500">✕</button></span>
              </div>
              <div class="flex gap-2">
                <input v-model="newModelInput" @keydown.enter.prevent="addNewModel" type="text" placeholder="输入模型名回车添加" class="flex-1 px-3 py-1.5 rounded-xl border border-stone-100 text-sm focus:outline-none focus:border-stone-300" />
                <button @click="addNewModel" class="px-3 py-1.5 rounded-xl bg-stone-50 text-xs text-stone-500 hover:bg-stone-100 transition-colors">添加</button>
              </div>
            </div>
            <div class="flex items-center justify-between pt-2 border-t border-stone-100">
              <button @click="cancelEdit" class="text-xs text-stone-400 hover:text-stone-600">取消</button>
              <button @click="save" :disabled="saving || !editing.baseUrl || !editing.apikey"
                class="px-4 py-2 text-sm font-medium text-white rounded-xl transition-all shadow-sm"
                :class="saving || !editing.baseUrl || !editing.apikey ? 'bg-violet-300 cursor-not-allowed' : 'bg-violet-500 hover:bg-violet-600'"
              >{{ saving ? '保存中...' : editing.id ? '更新配置' : '添加配置' }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>
