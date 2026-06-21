<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { ComponentSession } from '../types/chat'
import { useAppState } from '../composables/useAppState'

const { sidebarCollapsed } = useAppState()

defineProps<{
  sessions: ComponentSession[]
  currentSessionId: string
  loading: boolean
  errorMsg: string
  showSessionDeleteConfirm: string | null
  mcpCount: number
  avatarUrl: string | null
  displayName: string
}>()

const emit = defineEmits<{
  selectSession: [id: string]
  createNewSession: []
  requestDeleteSession: [id: string, event: MouseEvent]
  confirmDelete: [id: string, event: MouseEvent]
  openMCP: []
  openAPIConfig: []
  openMemories: []
  logout: []
}>()

// ── User card popover ──
const showUserMenu = ref(false)

function toggleUserMenu() {
  showUserMenu.value = !showUserMenu.value
}

function onDocumentClick(e: MouseEvent) {
  if (showUserMenu.value) {
    const target = e.target as HTMLElement
    if (!target.closest('.user-menu-container')) {
      showUserMenu.value = false
    }
  }
}

function handleUserMenuItem(action: () => void) {
  showUserMenu.value = false
  action()
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))
</script>

<template>
  <aside class="w-[260px] min-w-[260px] bg-white border-r border-[#E6E5F5] flex flex-col h-full">
    <!-- ====== Header: logo + collapse ====== -->
    <div class="shrink-0 flex items-center justify-between px-4 h-14 border-b border-[#E6E5F5]">
      <router-link to="/chat" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <img src="/logo.png" alt="NexusAgent" class="w-8 h-8 rounded-lg object-contain" />
        <span class="font-semibold text-sm tracking-tight text-[#2D325A]">NexusAgent</span>
      </router-link>
      <button @click="sidebarCollapsed = !sidebarCollapsed"
        class="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-[#C7C7D1] hover:text-[#7E84A3] hover:bg-[#F5F4FD] transition-all duration-150"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
      </button>
    </div>

    <!-- ====== Scrollable body ====== -->
    <div class="flex-1 flex flex-col min-h-0">
      <!-- Top actions -->
      <div class="shrink-0 px-3 pt-3 pb-2 space-y-2">
        <!-- New chat -->
        <button @click="emit('createNewSession')"
          class="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-sm font-semibold text-white bg-[#606CF3] hover:bg-[#5358E0] active:scale-[0.97] transition-all duration-200 shadow-sm"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          <span>新建对话</span>
        </button>

        <!-- Search -->
        <div class="relative">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#C7C7D1]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input
            type="text"
            placeholder="搜索对话..."
            class="w-full pl-9 pr-3 py-2 rounded-2xl text-[13px] border border-[#E6E5F5] bg-[#FAFAFE] placeholder-[#C7C7D1] text-[#2D325A] outline-none transition-all duration-200 focus:border-[#606CF3] focus:ring-2 focus:ring-[#606CF3]/10"
          />
        </div>
      </div>

      <!-- Nav links -->
      <div class="shrink-0 px-3 pb-1 space-y-0.5">
        <!-- 文件库 -->
        <router-link to="/files"
          class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150"
          :class="$route.path === '/files' || $route.path.startsWith('/files') ? 'bg-[#F5F4FD] text-[#606CF3] font-semibold' : 'text-[#7E84A3] hover:text-[#2D325A] hover:bg-[#F5F4FD]/50'"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
          <span>文件库</span>
        </router-link>
        <!-- 知识库 -->
        <router-link to="/knowledge"
          class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150"
          :class="$route.path === '/knowledge' || $route.path.startsWith('/knowledge') ? 'bg-[#F5F4FD] text-[#606CF3] font-semibold' : 'text-[#7E84A3] hover:text-[#2D325A] hover:bg-[#F5F4FD]/50'"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
          <span>知识库</span>
        </router-link>
      </div>

      <!-- Divider -->
      <div class="shrink-0 mx-3 border-t border-[#E6E5F5]"></div>

      <!-- Recent chats -->
      <div class="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        <div class="px-1 pb-1.5 text-[11px] font-bold text-[#7E84A3] uppercase tracking-[0.06em]">最近</div>
        <div v-if="loading" class="flex items-center justify-center py-8">
          <div class="w-4 h-4 rounded-full border-2 border-[#E6E5F5] border-t-[#606CF3] animate-spin"></div>
        </div>
        <div v-else-if="errorMsg" class="px-3 py-4 text-xs text-center text-[#C47B7B]">{{ errorMsg }}</div>
        <div v-else-if="sessions.length === 0" class="px-3 py-8 text-xs text-center text-[#C7C7D1]">暂无历史对话</div>
        <div v-for="session in sessions" :key="session.id"
          @click="emit('selectSession', session.id)"
          class="group flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-all duration-150 text-[13px]"
          :class="currentSessionId === session.id ? 'bg-[#F5F4FD] text-[#606CF3] font-semibold' : 'text-[#7E84A3] hover:text-[#2D325A] hover:bg-[#F5F4FD]/50'"
        >
          <svg class="w-4 h-4 shrink-0" :class="currentSessionId === session.id ? 'text-[#606CF3]' : 'text-[#C7C7D1]'" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
          <span class="truncate flex-1">{{ session.title }}</span>
          <button v-if="showSessionDeleteConfirm === session.id"
            @click="emit('confirmDelete', session.id, $event)"
            class="shrink-0 p-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors" title="确认删除"
          ><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg></button>
          <button v-else
            @click="emit('requestDeleteSession', session.id, $event)"
            class="shrink-0 p-1 rounded-lg opacity-0 group-hover:opacity-100 text-[#C7C7D1] hover:text-red-500 hover:bg-red-50 transition-all duration-150" title="删除对话"
          ><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
        </div>
      </div>
    </div>

    <!-- ====== User card (ChatGPT style) ====== -->
    <div class="user-menu-container relative shrink-0 border-t border-[#E6E5F5] px-3 py-2.5">
      <button @click="toggleUserMenu"
        class="w-full flex items-center gap-3 px-2 py-1.5 rounded-xl hover:bg-[#F5F4FD] transition-all duration-200"
      >
        <template v-if="avatarUrl">
          <img :src="avatarUrl" alt="" class="w-8 h-8 shrink-0 rounded-lg object-cover border border-[#E6E5F5]" />
        </template>
        <div v-else class="w-8 h-8 shrink-0 rounded-lg bg-[#606CF3] flex items-center justify-center text-sm font-bold text-white">
          {{ displayName.charAt(0).toUpperCase() }}
        </div>
        <div class="flex-1 min-w-0 text-left">
          <div class="text-[13px] font-semibold text-[#2D325A] truncate leading-snug">{{ displayName }}</div>
          <!-- <div class="text-[11px] text-[#7E84A3]">免费版</div> -->
        </div>
      </button>

      <!-- Popover menu (appears above the card) -->
      <Transition name="user-menu">
        <div v-if="showUserMenu"
          class="absolute bottom-full left-2 right-2 mb-2 z-50 bg-white rounded-2xl shadow-lg border border-[#E6E5F5] py-1.5 overflow-hidden"
        >
          <!-- User info header -->
          <div class="flex items-center gap-3 px-4 py-3">
            <template v-if="avatarUrl">
              <img :src="avatarUrl" alt="" class="w-9 h-9 shrink-0 rounded-lg object-cover border border-[#E6E5F5]" />
            </template>
            <div v-else class="w-9 h-9 shrink-0 rounded-lg bg-[#606CF3] flex items-center justify-center text-sm font-bold text-white">
              {{ displayName.charAt(0).toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-[13px] font-semibold text-[#2D325A] truncate">{{ displayName }}</div>
              <!-- <div class="text-[11px] text-[#7E84A3]">免费版</div> -->
            </div>
            <!-- <svg class="w-4 h-4 text-[#C7C7D1]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg> -->
          </div>

          <div class="border-t border-[#E6E5F5] my-1"></div>

          <!-- Menu items -->
          <button @click="handleUserMenuItem(() => emit('openMemories'))"
            class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-[#2D325A] hover:bg-[#F5F4FD] transition-colors"
          >
            <svg class="w-4 h-4 text-[#7E84A3]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <span>长期记忆</span>
          </button>
          <button @click="handleUserMenuItem(() => emit('openAPIConfig'))"
            class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-[#2D325A] hover:bg-[#F5F4FD] transition-colors"
          >
            <svg class="w-4 h-4 text-[#7E84A3]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>API 配置</span>
          </button>
          <button @click="handleUserMenuItem(() => emit('openMCP'))"
            class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-[#2D325A] hover:bg-[#F5F4FD] transition-colors"
          >
            <svg class="w-4 h-4 text-[#7E84A3]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
            <span>MCP 管理</span>
            <span v-if="mcpCount > 0" class="ml-auto text-[11px] text-[#C7C7D1]">{{ mcpCount }} 个服务器</span>
          </button>

          <div class="border-t border-[#E6E5F5] my-1"></div>

          <!-- Logout -->
          <button @click="handleUserMenuItem(() => emit('logout'))"
            class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-red-500 hover:bg-red-50 transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
            <span>退出登录</span>
          </button>
        </div>
      </Transition>
    </div>
  </aside>
</template>

<style scoped>
.user-menu-enter-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.user-menu-leave-active {
  transition: opacity 0.1s ease;
}
.user-menu-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.user-menu-leave-to {
  opacity: 0;
}
</style>
