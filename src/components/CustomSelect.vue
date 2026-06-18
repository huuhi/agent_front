<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  modelValue: string
  options: { value: string; label: string }[]
  right?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const selectedLabel = computed(() => {
  return props.options.find(o => o.value === props.modelValue)?.label || props.modelValue
})

function toggle() {
  open.value = !open.value
}

function select(value: string) {
  emit('update:modelValue', value)
  open.value = false
}

function onClickOutside(e: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('click', onClickOutside))
onUnmounted(() => document.removeEventListener('click', onClickOutside))
</script>

<template>
  <div ref="rootRef" class="relative">
    <!-- Trigger -->
    <button type="button" @click="toggle"
      class="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-stone-200 text-[12px] text-stone-600 bg-white focus:outline-none focus:border-stone-400 transition-colors cursor-pointer whitespace-nowrap"
    >
      <span>{{ selectedLabel }}</span>
      <svg class="w-3 h-3 text-stone-400 transition-transform" :class="open ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 9l6 6 6-6"/></svg>
    </button>

    <!-- Dropdown -->
    <transition name="dropdown">
      <div v-if="open"
        class="absolute top-full mt-1 min-w-full bg-white border border-stone-200 rounded-lg shadow-lg z-50 py-1 overflow-hidden"
        :class="props.right ? 'right-0' : 'left-0'"
      >
        <button
          v-for="opt in options" :key="opt.value"
          @click="select(opt.value)"
          class="w-full text-left px-3 py-1.5 text-[12px] transition-colors whitespace-nowrap"
          :class="opt.value === modelValue ? 'bg-stone-100 text-stone-800 font-medium' : 'text-stone-600 hover:bg-stone-50'"
        >{{ opt.label }}</button>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.dropdown-enter-active, .dropdown-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.dropdown-enter-from, .dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
