<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchMCPServerList } from '../api'
import Sidebar from '../components/Sidebar.vue'
import MCPDrawer from '../components/MCPDrawer.vue'
import APIConfigModal from '../components/APIConfigModal.vue'
import UserMemoryModal from '../components/UserMemoryModal.vue'
import ToastContainer from '../components/ToastContainer.vue'
import { useSessions } from '../composables/useSessions'
import { useAppState } from '../composables/useAppState'

const router = useRouter()

const {
  sessionList,
  currentSessionId,
  loading,
  errorMsg,
  showSessionDeleteConfirm,
  mockMCPList,
  selectSession,
  createNewSession,
  requestDeleteSession,
  confirmDelete,
  reloadSessions,
  resetSessions,
} = useSessions()

const {
  sidebarCollapsed,
  showMCPDrawer,
  showAPIConfigModal,
  showUserMemoryModal,
  userApiConfigs,
  userAvatarUrl,
  userDisplayName,
  refreshUserApiConfigs,
  refreshUserInfo,
  resetState,
} = useAppState()

async function refreshMCPList() {
  try {
    mockMCPList.value = await fetchMCPServerList()
  } catch { /* ignore */ }
}

function handleLogout() {
  // Clear in-memory state first (module-level singletons)
  resetSessions()
  resetState()
  // Clear localStorage
  localStorage.removeItem('token')
  localStorage.removeItem('currentSessionId')
  localStorage.removeItem('selectedConfigId')
  localStorage.removeItem('selectedModelName')
  localStorage.removeItem('selectedKnowledgeBase')
  localStorage.removeItem('selectedMCPIds')
  router.push('/auth')
}

function handleSelectSession(id: string) {
  selectSession(id)
  router.push(id.startsWith('local-') ? '/chat' : `/chat/${id}`)
}

function handleOpenMemories() {
  showUserMemoryModal.value = true
}

function handleNavigateSession(sessionId: string) {
  showUserMemoryModal.value = false
  selectSession(sessionId)
  router.push(`/chat/${sessionId}`)
}

async function handleCreateNewSession() {
  await createNewSession()
  router.push('/chat')
}

async function handleConfirmDelete(id: string, event: MouseEvent) {
  const wasCurrent = id === currentSessionId.value
  await confirmDelete(id, event)
  if (wasCurrent) {
    const nextId = currentSessionId.value
    if (nextId && !nextId.startsWith('local-')) {
      router.push(`/chat/${nextId}`)
    } else {
      router.push('/chat')
    }
  }
}

onMounted(async () => {
  // Handle old /session/{id} URL pattern — redirect to /chat/{id}
  const oldMatch = window.location.pathname.match(/^\/session\/([a-f0-9-]+)$/i)
  if (oldMatch) {
    router.replace(`/chat/${oldMatch[1]}`)
  }
  // Load current user's sessions and config (always fetches fresh data)
  await reloadSessions()
  refreshUserApiConfigs()
  refreshUserInfo()
})
</script>

<template>
  <div class="flex h-screen bg-stone-50 text-stone-900 font-sans antialiased relative">
    <!-- Sidebar: persistent across all routes -->
    <div
      class="shrink-0 overflow-hidden transition-all duration-300 ease-in-out"
      :style="{ width: sidebarCollapsed ? '0px' : '260px' }"
    >
      <div class="w-[260px] h-full">
        <Sidebar
          :sessions="sessionList"
          :currentSessionId="currentSessionId"
          :loading="loading"
          :errorMsg="errorMsg"
          :showSessionDeleteConfirm="showSessionDeleteConfirm"
          :mcpCount="mockMCPList.length"
          :avatarUrl="userAvatarUrl"
          :displayName="userDisplayName"
          @selectSession="handleSelectSession"
          @createNewSession="handleCreateNewSession"
          @requestDeleteSession="requestDeleteSession"
          @confirmDelete="handleConfirmDelete"
          @openMCP="showMCPDrawer = true"
          @openAPIConfig="showAPIConfigModal = true"
          @openMemories="handleOpenMemories"
          @logout="handleLogout"
        />
      </div>
    </div>

    <!-- Collapsed top bar — visible when sidebar is hidden -->
    <transition name="toolbar">
      <div
        v-if="sidebarCollapsed"
        class="absolute top-1.5 left-2 flex items-center gap-2 z-20"
      >
        <img src="/logo.png" alt="NexusAgent" class="w-8 h-8 rounded-lg object-contain" />
        <div class="flex items-center gap-0.5 bg-white border border-stone-200 rounded-xl shadow-sm px-1 h-9">
          <button @click="sidebarCollapsed = false"
            class="w-7 h-7 flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-all duration-150"
            title="展开侧边栏"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>
          <button @click="handleCreateNewSession"
            class="w-7 h-7 flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-all duration-150"
            title="新建对话"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
          </button>
        </div>
      </div>
    </transition>

    <!-- Page content from router -->
    <router-view />

    <!-- Global overlays -->
    <MCPDrawer
      :visible="showMCPDrawer"
      :servers="mockMCPList"
      @close="showMCPDrawer = false"
      @refresh="refreshMCPList"
    />
    <APIConfigModal
      :visible="showAPIConfigModal"
      :configs="userApiConfigs"
      @close="showAPIConfigModal = false"
      @saved="refreshUserApiConfigs"
    />
    <UserMemoryModal
      :visible="showUserMemoryModal"
      @close="showUserMemoryModal = false"
      @navigateSession="handleNavigateSession"
    />
    <ToastContainer />
  </div>
</template>

<style scoped>
.toolbar-enter-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toolbar-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.toolbar-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}
.toolbar-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
