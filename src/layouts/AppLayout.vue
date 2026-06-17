<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchMCPServerList } from '../api'
import Sidebar from '../components/Sidebar.vue'
import MCPDrawer from '../components/MCPDrawer.vue'
import APIConfigModal from '../components/APIConfigModal.vue'
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
} = useSessions()

const {
  sidebarCollapsed,
  showMCPDrawer,
  showAPIConfigModal,
  userApiConfigs,
  refreshUserApiConfigs,
} = useAppState()

async function refreshMCPList() {
  try {
    mockMCPList.value = await fetchMCPServerList()
  } catch { /* ignore */ }
}

function handleSelectSession(id: string) {
  selectSession(id)
  router.push(id.startsWith('local-') ? '/chat' : `/chat/${id}`)
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
})
</script>

<template>
  <div class="flex h-screen bg-stone-50 text-stone-900 font-sans antialiased">
    <!-- Sidebar: persistent across all routes -->
    <div
      class="overflow-hidden shrink-0 transition-all duration-300 ease-in-out"
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
          @selectSession="handleSelectSession"
          @createNewSession="handleCreateNewSession"
          @requestDeleteSession="requestDeleteSession"
          @confirmDelete="handleConfirmDelete"
          @openMCP="showMCPDrawer = true"
          @openAPIConfig="showAPIConfigModal = true"
        />
      </div>
    </div>

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
    <ToastContainer />
  </div>
</template>
