<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { fetchUserMemories, deleteUserMemory } from '../api'
import type { UserMemoryVO } from '../api/types'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  close: []
  navigateSession: [sessionId: string]
}>()

const router = useRouter()

// ── State ──
const memories = ref<UserMemoryVO[]>([])
const loading = ref(false)
const searchKey = ref('')
const activePopoverId = ref<string | number | null>(null)
const deletingId = ref<string | number | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | null = null

// ── Load ──
async function loadMemories(key?: string) {
  loading.value = true
  try {
    memories.value = await fetchUserMemories(key || undefined)
  } catch {
    memories.value = []
  } finally {
    loading.value = false
  }
}

// Debounced search
watch(searchKey, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    loadMemories(searchKey.value || undefined)
  }, 300)
})

async function handleDelete(id: string | number) {
  deletingId.value = id
  try {
    await deleteUserMemory(id)
    memories.value = memories.value.filter(m => m.id !== id)
  } catch {
    // silently fail
  } finally {
    deletingId.value = null
    activePopoverId.value = null
  }
}

function handleSourceClick(sessionId: string) {
  activePopoverId.value = null
  emit('navigateSession', sessionId)
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const month = d.getMonth() + 1
    const day = d.getDate()
    return `${month}月${day}日`
  } catch {
    return iso
  }
}

// Close popover on outside click
function onDocumentClick(e: MouseEvent) {
  if (activePopoverId.value !== null) {
    const target = e.target as HTMLElement
    if (!target.closest('.memory-popover-container')) {
      activePopoverId.value = null
    }
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  loadMemories()
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  if (searchTimer) clearTimeout(searchTimer)
})

// Reload when modal opens
watch(() => props.visible, (v) => {
  if (v) {
    searchKey.value = ''
    loadMemories()
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="fixed inset-0 z-[9999] flex items-start justify-center pt-[8vh]" @click.self="emit('close')">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/30 backdrop-blur-sm"></div>

        <!-- Panel — NOTE: no overflow-hidden so popover can overflow -->
        <div class="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-stone-100 flex flex-col max-h-[75vh]">
          <!-- Header -->
          <div class="px-5 pt-5 pb-3 border-b border-stone-100">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-base font-semibold text-stone-800">保存的记忆</h2>
              <button @click="emit('close')" class="w-7 h-7 flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <!-- Search -->
            <div class="relative">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <input
                v-model="searchKey"
                type="text"
                placeholder="搜索记忆..."
                class="w-full pl-9 pr-4 py-2 text-sm border border-stone-200 rounded-xl bg-stone-50 placeholder-stone-400 text-stone-700 outline-none transition-colors focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-100"
              />
            </div>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <!-- Loading -->
            <div v-if="loading" class="flex items-center justify-center py-10">
              <div class="w-5 h-5 rounded-full border-2 border-violet-200 border-t-violet-500 animate-spin"></div>
            </div>

            <!-- Empty -->
            <div v-else-if="memories.length === 0" class="text-center py-10">
              <div class="w-12 h-12 mx-auto mb-3 rounded-2xl bg-violet-100 flex items-center justify-center">
                <svg class="w-6 h-6 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              </div>
              <p class="text-sm text-stone-400">{{ searchKey ? '未找到匹配的记忆' : '暂无保存的记忆' }}</p>
            </div>

            <!-- Memory Cards -->
            <div v-for="mem in memories" :key="mem.id" class="memory-popover-container relative group">
              <div class="bg-violet-50/70 border border-violet-100/60 rounded-xl px-4 py-3.5 transition-all duration-150 hover:border-violet-200/80">
                <div class="flex items-start gap-3">
                  <p class="flex-1 text-sm text-stone-700 leading-relaxed whitespace-pre-wrap break-words min-w-0">{{ mem.content }}</p>
                  <button
                    @click.stop="activePopoverId = activePopoverId === mem.id ? null : mem.id"
                    class="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-600 hover:bg-violet-100/60 transition-all duration-150 opacity-0 group-hover:opacity-100"
                  >
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                  </button>
                </div>
              </div>

              <!-- Popover Menu -->
              <Transition name="popover">
                <div
                  v-if="activePopoverId === mem.id"
                  class="absolute right-0 top-full mt-1 z-10 w-56 bg-white rounded-xl shadow-lg border border-stone-200 py-1.5 overflow-hidden"
                  @click.stop
                >
                  <button
                    @click="handleDelete(mem.id)"
                    :disabled="deletingId === mem.id"
                    class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    <span>{{ deletingId === mem.id ? '删除中...' : '删除' }}</span>
                  </button>
                  <div class="border-t border-stone-100 my-1"></div>
                  <div class="px-4 py-2 text-xs text-stone-400 space-y-0.5">
                    <div class="flex items-center gap-1">
                      <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                      <span>{{ formatDate(mem.createAt) }}</span>
                    </div>
                    <div v-if="mem.source" class="flex items-center gap-1">
                      <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
                      <span>保存来源：</span>
                      <button
                        @click="handleSourceClick(mem.source!)"
                        class="text-violet-600 hover:text-violet-700 hover:underline font-medium"
                      >聊天</button>
                    </div>
                  </div>
                </div>
              </Transition>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Modal backdrop + panel */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-active > div:last-child,
.modal-leave-active > div:last-child {
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
              opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from > div:last-child,
.modal-leave-to > div:last-child {
  transform: scale(0.95) translateY(-10px);
  opacity: 0;
}

/* Popover */
.popover-enter-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.popover-leave-active {
  transition: opacity 0.1s ease;
}
.popover-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}
.popover-leave-to {
  opacity: 0;
}
</style>
