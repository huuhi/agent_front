<script setup lang="ts">
import { ref } from 'vue'
import { saveUserApiConfig } from '../api'
import type { UserApiConfigVO, ModelItem } from '../api/types'
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

// ── Chat / 向量 type switcher ──
const modelType = ref<'CHAT' | 'EMBEDDING'>('CHAT')
const newModelInput = ref('')

// ── Actions ──

function startAdd() {
  editing.value = { name: '', baseUrl: '', apikey: '', model: [] }
  showForm.value = true
  modelType.value = 'CHAT'
  newModelInput.value = ''
}

function startEdit(cfg: UserApiConfigVO) {
  editing.value = { ...cfg, model: [...(cfg.model || [])] }
  showForm.value = true
  modelType.value = 'CHAT'
  newModelInput.value = ''
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

// ── Model management ──

function addModel(m: string) {
  if (!editing.value || !m.trim()) return
  const item: ModelItem = { name: m.trim(), type: modelType.value }
  if (!editing.value.model?.some(x => x.name === item.name && x.type === item.type)) {
    editing.value.model = [...(editing.value.model || []), item]
  }
}

function removeModel(item: ModelItem) {
  if (!editing.value?.model) return
  editing.value.model = editing.value.model.filter(
    x => !(x.name === item.name && x.type === item.type)
  )
}

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
      <div class="relative w-[540px] max-h-[80vh] bg-white rounded-2xl shadow-[0_8px_32px_rgba(45,50,90,0.12)] border border-[#E6E5F5] flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-[#E6E5F5] shrink-0">
          <h2 class="text-[15px] font-bold text-[#2D325A]">API 配置管理</h2>
          <button @click="emit('close')" class="w-7 h-7 rounded-lg flex items-center justify-center text-[#C7C7D1] hover:text-[#606CF3] hover:bg-[#F5F4FD] transition-all duration-200">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto px-6 py-5">
          <!-- ====== Config list ====== -->
          <div v-if="!showForm" class="space-y-3">
            <div v-for="cfg in configs" :key="cfg.id || cfg.baseUrl"
              class="flex items-start gap-3 p-4 rounded-xl bg-white border border-[#E6E5F5] hover:border-[#D0D0E8] transition-all"
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-[13px] font-semibold text-[#2D325A]">{{ cfg.name || cfg.baseUrl }}</span>
                  <span v-if="cfg.isDefault" class="text-[10px] px-1.5 py-0.5 rounded-full bg-[#F0EEFC] text-[#606CF3] font-semibold">默认</span>
                </div>
                <div class="text-[12px] text-[#7E84A3] truncate mt-0.5">{{ cfg.baseUrl }}</div>
                <div class="flex items-center gap-1 mt-0.5">
                  <span class="text-[11px] font-mono text-[#C7C7D1]">{{ cfg.apikey?.slice(0, 8) }}...</span>
                </div>

                <!-- Model tags -->
                <div class="flex flex-wrap gap-1.5 mt-2">
                  <template v-for="m in cfg.model || []" :key="m.name + m.type">
                    <span
                      class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#F5F4FD] text-[#555770]"
                    >
                      <span class="opacity-50">{{ m.type === 'CHAT' ? '[Chat]' : '[向量]' }}</span> {{ m.name }}
                    </span>
                  </template>
                  <span v-if="!cfg.model?.length" class="text-[11px] text-[#C7C7D1]">无模型</span>
                </div>
              </div>
              <div class="flex items-center gap-1 shrink-0 mt-0.5">
                <button @click="startEdit(cfg)" class="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[#7E84A3] hover:text-[#606CF3] hover:bg-[#F5F4FD] transition-all">编辑</button>
                <button @click="deleteConfig(cfg)" class="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[#7E84A3] hover:text-red-500 hover:bg-red-50 transition-all">删除</button>
              </div>
            </div>

            <div v-if="configs.length === 0" class="text-center py-10 text-[13px] text-[#C7C7D1] font-medium">暂无 API 配置</div>

            <button @click="startAdd"
              class="w-full flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl text-[13px] font-medium text-[#7E84A3] hover:text-[#606CF3] hover:bg-[#F5F4FD] border border-dashed border-[#D0D0E8] transition-all"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              添加配置
            </button>
          </div>

          <!-- ====== Add/Edit form ====== -->
          <div v-else-if="editing" class="space-y-4">
            <!-- 名称 -->
            <div>
              <label class="block text-[12px] font-semibold text-[#555770] mb-1.5">名称</label>
              <input v-model="editing.name" type="text" placeholder="例如：DeepSeek"
                class="w-full px-3.5 py-2.5 rounded-xl border border-[#E6E5F5] text-sm text-[#2D325A] placeholder-[#C7C7D1] bg-white focus:outline-none focus:border-[#606CF3] focus:ring-2 focus:ring-[#606CF3]/10 transition-all" />
            </div>

            <!-- Base URL -->
            <div>
              <label class="block text-[12px] font-semibold text-[#555770] mb-1.5">Base URL <span class="text-red-400">*</span></label>
              <input v-model="editing.baseUrl" type="text" placeholder="https://api.deepseek.com"
                class="w-full px-3.5 py-2.5 rounded-xl border border-[#E6E5F5] text-sm text-[#2D325A] placeholder-[#C7C7D1] bg-white focus:outline-none focus:border-[#606CF3] focus:ring-2 focus:ring-[#606CF3]/10 transition-all" />
            </div>

            <!-- API Key -->
            <div>
              <label class="block text-[12px] font-semibold text-[#555770] mb-1.5">API Key <span class="text-red-400">*</span></label>
              <input v-model="editing.apikey" type="text" placeholder="sk-..."
                class="w-full px-3.5 py-2.5 rounded-xl border border-[#E6E5F5] text-sm text-[#2D325A] placeholder-[#C7C7D1] bg-white focus:outline-none focus:border-[#606CF3] focus:ring-2 focus:ring-[#606CF3]/10 transition-all" />
            </div>

            <!-- Model list -->
            <div>
              <label class="block text-[12px] font-semibold text-[#555770] mb-2">模型列表</label>

              <!-- Segmented control: Chat / 向量 -->
              <div class="flex items-center gap-1.5 bg-[#F5F4FD] rounded-xl p-1 mb-3 w-fit">
                <button @click="modelType = 'CHAT'"
                  class="px-4 py-1.5 text-[12px] font-semibold rounded-lg transition-all duration-200"
                  :class="modelType === 'CHAT' ? 'text-[#606CF3] bg-white shadow-sm' : 'text-[#7E84A3] hover:text-[#2D325A]'"
                >Chat 模型</button>
                <button @click="modelType = 'EMBEDDING'"
                  class="px-4 py-1.5 text-[12px] font-semibold rounded-lg transition-all duration-200"
                  :class="modelType === 'EMBEDDING' ? 'text-[#606CF3] bg-white shadow-sm' : 'text-[#7E84A3] hover:text-[#2D325A]'"
                >向量模型</button>
              </div>

              <!-- Existing model tags -->
              <div v-if="editing.model?.length" class="flex flex-wrap gap-1.5 mb-3">
                <span v-for="m in editing.model" :key="m.name + m.type"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium bg-[#F5F4FD] text-[#555770]"
                >
                  <span class="opacity-50 text-[11px]">{{ m.type === 'CHAT' ? '[Chat]' : '[向量]' }}</span>
                  <span>{{ m.name }}</span>
                  <button @click="removeModel(m)" class="ml-0.5 text-[#C7C7D1] hover:text-[#606CF3] transition-colors">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </span>
              </div>
              <div v-else class="text-[12px] text-[#C7C7D1] mb-3 font-medium">暂未添加模型</div>

              <!-- Add model input -->
              <div class="flex gap-2">
                <input v-model="newModelInput" @keydown.enter.prevent="addNewModel"
                  type="text"
                  :placeholder="modelType === 'CHAT' ? '输入 Chat 模型名，回车添加' : '输入向量模型名，回车添加'"
                  class="flex-1 px-3.5 py-2 rounded-xl border border-[#E6E5F5] text-sm text-[#2D325A] placeholder-[#C7C7D1] bg-white focus:outline-none focus:border-[#606CF3] focus:ring-2 focus:ring-[#606CF3]/10 transition-all"
                />
                <button @click="addNewModel"
                  class="px-4 py-2 rounded-xl text-[12px] font-semibold bg-[#F5F4FD] text-[#555770] hover:bg-[#E6E5F5] transition-all"
                >添加</button>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center justify-between pt-3 border-t border-[#E6E5F5]">
              <button @click="cancelEdit" class="text-[12px] font-semibold text-[#7E84A3] hover:text-[#2D325A] transition-all">取消</button>
              <button @click="save" :disabled="saving || !editing.baseUrl || !editing.apikey"
                class="px-5 py-2 rounded-xl text-[13px] font-semibold text-white transition-all duration-200 shadow-sm"
                :class="saving || !editing.baseUrl || !editing.apikey ? 'bg-[#C7C7D1] cursor-not-allowed' : 'bg-[#606CF3] hover:bg-[#5358E0] active:scale-[0.97]'"
              >{{ saving ? '保存中...' : editing.id ? '更新配置' : '添加配置' }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>
