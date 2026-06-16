<script setup lang="ts">
import { useToast } from '../composables/useToast'

const { toasts } = useToast()
</script>

<template>
  <div class="fixed top-4 right-4 z-[99999] flex flex-col gap-2.5 pointer-events-none">
    <TransitionGroup name="toast" tag="div" class="flex flex-col gap-2.5">
      <div
        v-for="t in toasts" :key="t.id"
        class="pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] text-sm font-medium max-w-sm backdrop-blur-sm"
        :class="t.type === 'success'
          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/60'
          : 'bg-red-50 text-red-800 border border-red-200/60'"
      >
        <!-- Success icon -->
        <svg v-if="t.type === 'success'" class="w-5 h-5 shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12l3 3 5-5"/>
        </svg>
        <!-- Error icon -->
        <svg v-else class="w-5 h-5 shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 9l-6 6m0-6l6 6"/>
        </svg>
        <span class="flex-1 leading-tight">{{ t.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active {
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.toast-leave-active {
  transition: all 0.2s ease-in;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(60px) scale(0.92);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(40px) scale(0.95);
}
</style>
