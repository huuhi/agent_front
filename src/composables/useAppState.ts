import { ref } from 'vue'
import { fetchUserApiConfigs } from '../api'
import { getUserAvatarUrl, getUserDisplayName } from '../utils/jwt'
import type { UserApiConfigVO } from '../api/types'

// ========== Module-level singleton state ==========

const sidebarCollapsed = ref(false)
const showMCPDrawer = ref(false)
const showAPIConfigModal = ref(false)
const showUserMemoryModal = ref(false)
const userApiConfigs = ref<UserApiConfigVO[]>([])
const userAvatarUrl = ref<string | null>(getUserAvatarUrl())
const userDisplayName = ref<string>(getUserDisplayName())

/** Re-read avatar & display name from the JWT in localStorage */
function refreshUserInfo() {
  userAvatarUrl.value = getUserAvatarUrl()
  userDisplayName.value = getUserDisplayName()
}

export function useAppState() {
  function resetState() {
    showMCPDrawer.value = false
    showAPIConfigModal.value = false
    showUserMemoryModal.value = false
    userApiConfigs.value = []
    userAvatarUrl.value = null
    userDisplayName.value = '用户'
  }

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
    showUserMemoryModal,
    userApiConfigs,
    userAvatarUrl,
    userDisplayName,
    refreshUserApiConfigs,
    refreshUserInfo,
    resetState,
  }
}
