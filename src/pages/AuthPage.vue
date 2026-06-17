<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { sendEmailCode, login, register, setPassword } from '../api'
import { useToast } from '../composables/useToast'
import ToastContainer from '../components/ToastContainer.vue'

const router = useRouter()
const { show: showToast } = useToast()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CODE_RE = /^\d{4}$/

type MainTab = 'login' | 'register'
type LoginMode = 'code' | 'password'
const mainTab = ref<MainTab>('login')
const loginMode = ref<LoginMode>('code')
const showSetPassword = ref(false)

const email = ref('')
const code = ref('')
const password = ref('')
const username = ref('')
const confirmPassword = ref('')


const sendingCode = ref(false)
const submitting = ref(false)
const codeCountdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null

const canSendCode = computed(() => {
  return EMAIL_RE.test(email.value) && !sendingCode.value && codeCountdown.value === 0
})

const codeBtnText = computed(() => {
  if (sendingCode.value) return '发送中...'
  if (codeCountdown.value > 0) return `${codeCountdown.value}s`
  return '发送验证码'
})

function startCountdown() {
  codeCountdown.value = 60
  countdownTimer = setInterval(() => {
    codeCountdown.value--
    if (codeCountdown.value <= 0 && countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

async function handleSendCode() {
    if (!canSendCode.value) return
  sendingCode.value = true
  try {
    await sendEmailCode(email.value)
    showToast('验证码已发送', 'success')
    startCountdown()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '发送失败', 'error')
  } finally {
    sendingCode.value = false
  }
}

async function handleSubmit() {
    
  if (!EMAIL_RE.test(email.value)) {
    showToast('请输入有效的邮箱地址', 'error')
    return
  }

  if (showSetPassword.value) {
    if (!code.value) {
      showToast('请先获取验证码', 'error')
      return
    }
    if (!password.value || password.value.length < 6) {
      showToast('密码至少6位', 'error')
      return
    }
    if (password.value !== confirmPassword.value) {
      showToast('两次密码输入不一致', 'error')
      return
    }
    submitting.value = true
    try {
      await setPassword({ email: email.value, code: code.value, password: password.value })
      showToast('密码设置成功', 'success')
      showSetPassword.value = false
      password.value = ''
      confirmPassword.value = ''
      code.value = ''
      mainTab.value = 'login'
      loginMode.value = 'password'
    } catch (e) {
      showToast(e instanceof Error ? e.message : '设置失败', 'error')
    } finally {
      submitting.value = false
    }
    return
  }

  if (mainTab.value === 'register') {
    if (!code.value) {
      showToast('请先获取验证码', 'error')
      return
    }
    submitting.value = true
    try {
      const token = await register({
        email: email.value,
        username: username.value || undefined,
        code: code.value,
      })
      localStorage.setItem('token', token)
      router.push('/')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '注册失败', 'error')
    } finally {
      submitting.value = false
    }
    return
  }

  if (loginMode.value === 'code') {
    if (!code.value) {
      showToast('请先获取验证码', 'error')
      return
    }
    submitting.value = true
    try {
      const token = await login({ email: email.value, code: code.value, type: 'CODE' })
      localStorage.setItem('token', token)
      router.push('/')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '登录失败', 'error')
    } finally {
      submitting.value = false
    }
  } else {
    if (!password.value || password.value.length < 6) {
      showToast('密码至少6位', 'error')
      return
    }
    submitting.value = true
    try {
      const token = await login({ email: email.value, password: password.value, type: 'PASSWORD' })
      localStorage.setItem('token', token)
      router.push('/')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '登录失败', 'error')
    } finally {
      submitting.value = false
    }
  }
}

function switchToSetPasswordBack() {
      showSetPassword.value = false
  email.value = ''
  code.value = ''
  password.value = ''
  confirmPassword.value = ''
}

function switchToSetPassword() {
      email.value = ''
  code.value = ''
  password.value = ''
  confirmPassword.value = ''
  showSetPassword.value = true
}

function switchMainTab(tab: MainTab) {
      mainTab.value = tab
  showSetPassword.value = false
  email.value = ''
  code.value = ''
  password.value = ''
  username.value = ''
  confirmPassword.value = ''
}

function switchLoginMode(mode: LoginMode) {
      loginMode.value = mode
  password.value = ''
  code.value = ''
}

function isFormValid(): boolean {
  const emailOk = EMAIL_RE.test(email.value)
  if (showSetPassword.value) {
    return emailOk && CODE_RE.test(code.value) && (password.value.length >= 6) && password.value === confirmPassword.value
  }
  if (mainTab.value === 'register') {
    return emailOk && CODE_RE.test(code.value)
  }
  if (loginMode.value === 'code') {
    return emailOk && CODE_RE.test(code.value)
  }
  // password login
  return emailOk && password.value.length >= 6
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-bg"></div>
    <div class="auth-overlay"></div>

    <div class="auth-panel">
      <div class="auth-card">
        <div class="auth-card-header">
          <img src="/logo.png" alt="NexusAgent" class="auth-logo" />
          <h1 class="auth-title">NexusAgent</h1>
          <p class="auth-subtitle">AI Agent 智能平台</p>
        </div>

        <div v-if="!showSetPassword" class="auth-tabs">
          <button @click="switchMainTab('login')" class="auth-tab" :class="{ active: mainTab === 'login' }">登录</button>
          <button @click="switchMainTab('register')" class="auth-tab" :class="{ active: mainTab === 'register' }">注册</button>
          <div class="auth-tab-indicator" :class="mainTab === 'login' ? 'left' : 'right'"></div>
        </div>
        <div v-else class="auth-back-row">
          <button @click="switchToSetPasswordBack" class="auth-back-btn">← 返回</button>
          <span class="auth-back-title">设置密码</span>
        </div>

        <div v-if="mainTab === 'login' && !showSetPassword" class="auth-subtabs">
          <button @click="switchLoginMode('code')" class="auth-subtab" :class="{ active: loginMode === 'code' }">验证码登录</button>
          <button @click="switchLoginMode('password')" class="auth-subtab" :class="{ active: loginMode === 'password' }">密码登录</button>
        </div>

        <form @submit.prevent="handleSubmit" class="auth-form">
          <div class="auth-field">
            <label class="auth-label">邮箱</label>
            <input v-model="email" type="email" placeholder="user@example.com" class="auth-input" :class="{ error: email && !EMAIL_RE.test(email) }" />
            <p v-if="email && !EMAIL_RE.test(email)" class="auth-hint">请输入有效的邮箱地址</p>
          </div>

          <div v-if="mainTab === 'register' && !showSetPassword" class="auth-field">
            <label class="auth-label">用户名 <span class="optional">选填</span></label>
            <input v-model="username" type="text" placeholder="如何称呼您？" class="auth-input" />
          </div>

          <div v-if="showSetPassword || mainTab === 'register' || loginMode === 'code'" class="auth-field">
            <label class="auth-label">验证码</label>
            <div class="auth-code-row">
              <input v-model="code" type="text" placeholder="请输入验证码" maxlength="4" inputmode="numeric" pattern="\d{4}" class="auth-input" />
              <button type="button" @click="handleSendCode" :disabled="!canSendCode" class="auth-code-btn" :class="{ disabled: !canSendCode }">{{ codeBtnText }}</button>
            </div>
          </div>

          <div v-if="(mainTab === 'login' && loginMode === 'password') || showSetPassword" class="auth-field">
            <label class="auth-label">密码</label>
            <input v-model="password" type="password" placeholder="密码至少6位" class="auth-input" :class="{ error: password && password.length < 6 }" />
            <p v-if="password && password.length < 6" class="auth-hint">密码至少6位</p>
          </div>

          <div v-if="showSetPassword" class="auth-field">
            <label class="auth-label">确认密码</label>
            <input v-model="confirmPassword" type="password" placeholder="再次输入密码" class="auth-input" :class="{ error: confirmPassword && password !== confirmPassword }" />
            <p v-if="confirmPassword && password !== confirmPassword" class="auth-hint">两次密码不一致</p>
          </div>

          <button type="submit" :disabled="!isFormValid() || submitting" class="auth-submit" :class="{ disabled: !isFormValid() || submitting }">
            <span v-if="submitting" class="auth-spinner"></span>
            <span>{{ submitting
              ? (showSetPassword ? '设置中...' : mainTab === 'register' ? '注册中...' : '登录中...')
              : (showSetPassword ? '设置密码' : mainTab === 'register' ? '注册' : '登录')
            }}</span>
          </button>

          <div v-if="mainTab === 'login' && loginMode === 'code' && !showSetPassword" class="auth-footer-row">
            <button type="button" @click="switchToSetPassword" class="auth-link">设置密码</button>
          </div>
        </form>
      </div>
    </div>
    <ToastContainer />
  </div>
</template>

<style scoped>
.auth-page {
  position: fixed;
  inset: 0;
  display: flex;
  overflow: hidden;
}

.auth-bg {
  position: absolute;
  inset: 0;
  background: url('/login_background.png') center center / cover no-repeat;
}

.auth-overlay {
  position: absolute;
  inset: 0;
  /* background: linear-gradient(
    to right,
    rgba(0, 0, 0, 0.55) 0%,
    rgba(0, 0, 0, 0.30) 50%,
    rgba(0, 0, 0, 0.05) 100%
  ); */
  pointer-events: none;
}

/* Panel: right 1/3 — #F5F4FD */
.auth-panel {
  position: relative;
  width: 36%;
  min-width: 400px;
  max-width: 480px;
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: #F5F4FD;
}

/* Card: #FFFFFF with shadow */
.auth-card {
  width: 100%;
  max-width: 380px;
  background: #FFFFFF;
  border-radius: 16px;
  padding: 36px 32px 28px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
}

/* Logo */
.auth-card-header {
  text-align: center;
  margin-bottom: 28px;
}
.auth-logo {
  width: 72px;
  height: 72px;
  border-radius: 16px;
  object-fit: contain;
  display: block;
  margin: 0 auto 16px;
}
.auth-title {
  font-size: 20px;
  font-weight: 700;
  color: #2D325A;
  letter-spacing: -0.02em;
  margin: 0;
}
.auth-subtitle {
  font-size: 12px;
  color: #a8a8b8;
  margin: 4px 0 0;
}

/* Tabs */
.auth-tabs {
  position: relative;
  display: flex;
  border-bottom: 1px solid #EBEBF0;
  margin-bottom: 20px;
}
.auth-tab {
  flex: 1;
  padding: 10px 0;
  font-size: 14px;
  font-weight: 500;
  color: #a8a8b8;
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.2s;
  position: relative;
  z-index: 1;
}
.auth-tab:hover { color: #606CF3; }
.auth-tab.active { color: #606CF3; }
.auth-tab-indicator {
  position: absolute;
  bottom: -1px;
  height: 2px;
  width: 50%;
  background: #606CF3;
  border-radius: 2px;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.auth-tab-indicator.left { transform: translateX(0%); }
.auth-tab-indicator.right { transform: translateX(100%); }

/* Back row */
.auth-back-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 14px;
  margin-bottom: 20px;
  border-bottom: 1px solid #EBEBF0;
}
.auth-back-btn {
  font-size: 13px;
  color: #a8a8b8;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.auth-back-btn:hover { color: #2D325A; }
.auth-back-title {
  font-size: 14px;
  font-weight: 600;
  color: #2D325A;
}

/* Subtabs */
.auth-subtabs {
  display: flex;
  gap: 6px;
  margin-bottom: 20px;
}
.auth-subtab {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 8px;
  border: none;
  background: #F5F4FD;
  color: #a8a8b8;
  cursor: pointer;
  transition: all 0.2s ease;
}
.auth-subtab:hover { color: #606CF3; }
.auth-subtab.active { background: #606CF3; color: #fff; }

/* Form */
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.auth-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.auth-label {
  font-size: 12px;
  font-weight: 500;
  color: #555770;
}
.auth-label .optional { color: #c7c7d1; font-weight: 400; }
.auth-input {
  width: 100%;
  padding: 10px 14px;
  font-size: 14px;
  border: 1px solid #DCDCE8;
  border-radius: 10px;
  background: #FFFFFF;
  color: #2D325A;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  box-sizing: border-box;
}
.auth-input::placeholder { color: #c7c7d1; }
.auth-input:focus {
  border-color: #606CF3;
  box-shadow: 0 0 0 3px rgba(96,108,243,0.10);
}
.auth-input.error { border-color: #f87171; }
.auth-input.error:focus {
  border-color: #ef4444;
  box-shadow: 0 0 0 3px rgba(239,68,68,0.10);
}
.auth-hint { font-size: 11px; margin: 0; color: #ef4444; }

.auth-code-row { display: flex; gap: 8px; }
.auth-code-btn {
  flex-shrink: 0;
  padding: 10px 16px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 10px;
  border: none;
  background: #606CF3;
  color: #fff;
  cursor: pointer;
  transition: opacity 0.2s ease;
  white-space: nowrap;
}
.auth-code-btn:hover { opacity: 0.85; }
.auth-code-btn.disabled { background: #EBEBF0; color: #c7c7d1; cursor: not-allowed; opacity: 1; }

.auth-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 11px 0;
  font-size: 14px;
  font-weight: 600;
  border: none;
  border-radius: 10px;
  background: #606CF3;
  color: #FFFFFF;
  cursor: pointer;
  transition: opacity 0.2s ease;
  margin-top: 4px;
}
.auth-submit:hover { opacity: 0.85; }
.auth-submit.disabled { background: #EBEBF0; color: #c7c7d1; cursor: not-allowed; }
.auth-spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.auth-footer-row { display: flex; justify-content: center; padding-top: 2px; }
.auth-link {
  font-size: 12px;
  color: #a8a8b8;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.auth-link:hover { color: #606CF3; }

@media (max-width: 768px) {
  .auth-panel { width: 100%; min-width: 0; max-width: none; }
}
</style>
