<script setup lang="ts">
defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <transition name="modal">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center">
      <div @click="emit('close')" class="absolute inset-0 bg-black/20 backdrop-blur-sm"></div>
      <div class="relative w-[480px] bg-white rounded-2xl shadow-xl border border-slate-100">
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 class="text-base font-semibold text-gray-800">API 配置</h2>
          <button @click="emit('close')" class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-slate-50 transition-all">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="p-6 space-y-5">
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1.5">Token</label>
            <div class="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50 text-sm text-gray-400">
              <span>已保存在本地存储</span><button class="ml-auto text-xs text-blue-500 hover:text-blue-600 font-medium">更换</button>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1.5">API 端点</label>
            <input type="text" value="http://localhost:8080" readonly class="w-full px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50 text-sm text-gray-600 focus:outline-none" />
          </div>
          <div class="flex items-center justify-between pt-2 border-t border-slate-100">
            <span class="text-xs text-gray-400">在 console 执行 __setToken('jwt') 设置令牌</span>
            <button @click="emit('close')" class="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-xl transition-all shadow-sm">关闭</button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>
