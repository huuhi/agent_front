import { ref } from 'vue'
import { fetchUserApiConfigs } from '../api'
import type { UserApiConfigVO } from '../api/types'

// ========== Module-level singleton state ==========

const sidebarCollapsed = ref(false)
const showMCPDrawer = ref(false)
const showAPIConfigModal = ref(false)
const userApiConfigs = ref<UserApiConfigVO[]>([])

export function useAppState() {
  async function refreshUserApiConfigs() {
    try {
      userApiConfigs.value = await fetchUserApiConfigs()
    } catch {
      /* ignore */
    }
  }

  return {
    sidebarCollapsed,
    showMCPDrawer,
    showAPIConfigModal,
    userApiConfigs,
    refreshUserApiConfigs,
  }
}
