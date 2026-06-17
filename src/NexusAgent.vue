<script setup lang="ts">
import { onMounted } from "vue";
import { marked } from "marked";
import hljs from "highlight.js";
import "highlight.js/styles/github.css";
import {
  fetchUserApiConfigs,
} from "./api";
import { setupCodeCopy } from "./utils/markdown";
import { useAutoScroll } from "./composables/useAutoScroll";
import { useSessions } from "./composables/useSessions";
import { useChat } from "./composables/useChat";
import { useTitleWebSocket } from "./composables/useTitleWebSocket";
import MessageBubble from "./components/MessageBubble.vue";
import ChatInput from "./components/ChatInput.vue";
import type { ModelOption } from "./types/chat";

// ========== Markdown renderer (must be configured before use) ==========
marked.use({
  renderer: {
    code({ text, lang }) {
      const language = lang || "";
      const validLang = language && hljs.getLanguage(language);
      const highlighted = validLang
        ? hljs.highlight(text, { language }).value
        : hljs.highlightAuto(text).value;
      return `<div class="code-block-wrapper">
<pre><code class="hljs language-${language}">${highlighted}</code></pre>
<button class="code-copy-btn" title="复制代码">
<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
</button>
</div>`;
    },
  },
});

// ========== Composables ==========
const {
  messageContainerRef,
  showScrollButton,
  scrollToBottom,
  autoScrollIfNeeded,
  handleScroll,
} = useAutoScroll();

const {
  sessionList,
  currentSessionId,
  messageList,
  knowledgeBases,
  mockMCPList,
  loading,
  errorMsg,
  showSessionDeleteConfirm,
  currentSession,
  loadMessages,
  selectSession,
  createNewSession,
  requestDeleteSession,
  confirmDelete,
  refreshSessionList,
  mapSession,
} = useSessions();

// State that useChat needs access to (to handle session updates)
import { ref, nextTick } from "vue";
import { useRoute } from "vue-router";
import { useAppState } from "./composables/useAppState";
import type { UserApiConfigVO } from "./api/types";

const route = useRoute();
const {
  showMCPDrawer,
  showAPIConfigModal,
  sidebarCollapsed,
  userApiConfigs,
} = useAppState();
const selectedApiConfig = ref<UserApiConfigVO | null>(null);
const selectedModel = ref<ModelOption>({
  id: "",
  name: "DeepSeek V4 Flash",
  supportsThinking: true,
  provider: "DeepSeek",
});
const selectedKnowledgeBase = ref<{
  id: number | string;
  name: string;
  documentCount: number;
} | null>(null);
const enableRag = ref(localStorage.getItem('enableRag') !== 'false');
const enableThinking = ref(localStorage.getItem('enableThinking') !== 'false');
const expandedThinking = ref<Set<string>>(new Set());
const showAllAttachments = ref<Set<string>>(new Set());
const expandedSteps = ref<Set<string>>(new Set());
const toolChainState = ref<0 | 1 | 2>(
  Number(localStorage.getItem("toolChainState") || "0") as 0 | 1 | 2,
);
const selectedMCPIds = ref<string[]>(
  JSON.parse(localStorage.getItem('selectedMCPIds') || '[]')
);

const {
  inputText,
  isAiResponding,
  uploadedPreviews,
  uploadingCount,
  uploadErrors,
  onFileSelected,
  handleFilePasted,
  removePreview,
  handleKeydown,
  cancelStreaming,
  sendMessage,
} = useChat(
  messageList,
  currentSessionId,
  selectedModel,
  enableRag,
  enableThinking,
  refreshSessionList,
  scrollToBottom,
  autoScrollIfNeeded,
  selectedMCPIds,
);

const { connect: connectTitleWs } = useTitleWebSocket(sessionList);

// ========== Actions ==========
function selectModel(model: ModelOption) {
  selectedModel.value = model;
}

function selectApiConfig(config: UserApiConfigVO | null) {
  selectedApiConfig.value = config;
  if (config) {
    const modelName = config.model[0] || config.name || "未命名模型";
    selectModel({
      id: config.id || "",
      name: modelName,
      supportsThinking: false,
      provider: config.name || "自定义",
      configId: config.id,
    });
    localStorage.setItem("selectedConfigId", config.id || "");
  } else {
    selectModel({
      id: "",
      name: "DeepSeek V4 Flash",
      supportsThinking: true,
      provider: "DeepSeek",
    });
    localStorage.removeItem("selectedConfigId");
    localStorage.removeItem("selectedModelName");
  }
}

function selectModelLocal(model: ModelOption) {
  selectModel(model);
  if (model.configId) {
    localStorage.setItem("selectedModelName", model.name);
  } else {
    localStorage.removeItem("selectedModelName");
  }
}

function selectKnowledgeBase(kb: (typeof knowledgeBases.value)[0] | null) {
  selectedKnowledgeBase.value = kb
    ? { id: kb.id, name: kb.name, documentCount: 0 }
    : null;
  localStorage.setItem('selectedKnowledgeBase', kb ? String(kb.id) : '');
}

function toggleRag() {
  enableRag.value = !enableRag.value;
  localStorage.setItem('enableRag', String(enableRag.value));
}

function toggleEnableThinking() {
  enableThinking.value = !enableThinking.value;
  localStorage.setItem('enableThinking', String(enableThinking.value));
}

async function handleSelectSession(id: string) {
  await selectSession(id);
  await nextTick();
  scrollToBottom();
}

async function handleCreateNewSession() {
  await createNewSession();
  await nextTick();
  scrollToBottom();
}

function toggleThinking(id: string) {
  const s = new Set(expandedThinking.value);
  s.has(id) ? s.delete(id) : s.add(id);
  expandedThinking.value = s;
}

function toggleAttachments(id: string) {
  const s = new Set(showAllAttachments.value);
  s.has(id) ? s.delete(id) : s.add(id);
  showAllAttachments.value = s;
}

function toggleToolStep(id: string) {
  const s = new Set(expandedSteps.value);
  s.has(id) ? s.delete(id) : s.add(id);
  expandedSteps.value = s;
}

function toggleToolChain() {
  toolChainState.value = ((toolChainState.value + 1) % 3) as 0 | 1 | 2;
  localStorage.setItem("toolChainState", String(toolChainState.value));
}

function toggleMCPSelection(id: string) {
  const idx = selectedMCPIds.value.indexOf(id);
  if (idx >= 0) {
    selectedMCPIds.value = selectedMCPIds.value.filter((x) => x !== id);
  } else {
    selectedMCPIds.value = [...selectedMCPIds.value, id];
  }
  localStorage.setItem('selectedMCPIds', JSON.stringify(selectedMCPIds.value));
}

function setToken(token: string) {
  localStorage.setItem("token", token);
}

// @ts-expect-error expose for dev console
window.__setToken = setToken;

// ========== Lifecycle ==========
onMounted(async () => {
  setupCodeCopy();
  connectTitleWs();

  // Wait for session list from module-level singleton init
  const sessions = await (await import('./composables/useSessions')).useSessions().initPromise;

  try {
    const apiConfigs = await fetchUserApiConfigs().catch(() => [] as UserApiConfigVO[]);
    userApiConfigs.value = apiConfigs;

    // Restore selected API config from localStorage
    const savedCfgId = localStorage.getItem("selectedConfigId");
    const savedModelName = localStorage.getItem("selectedModelName");
    if (savedCfgId) {
      const match = apiConfigs.find((c) => c.id === savedCfgId);
      if (match) {
        selectedApiConfig.value = match;
        const modelName =
          savedModelName && match.model.includes(savedModelName)
            ? savedModelName
            : match.model[0];
        selectModel({
          id: match.id || "",
          name: modelName,
          supportsThinking: false,
          provider: match.name || "自定义",
          configId: match.id,
        });
      }
    }

    // Priority: route param (:sessionId) > localStorage > new chat
    const pathId = route.params.sessionId as string | undefined;
    const cachedId = localStorage.getItem("currentSessionId");
    const sessionVOs = sessionList.value;
    const targetId = (
      pathId && sessionVOs.some((s) => s.id === pathId)
        ? pathId
        : cachedId && sessionVOs.some((s) => s.id === cachedId)
          ? cachedId
          : null
    );
    if (targetId) {
      currentSessionId.value = targetId;
      messageList.value = await loadMessages(targetId);
    } else {
      currentSessionId.value = `local-${Date.now()}`;
    }
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : "加载失败";
  } finally {
    // Scroll to bottom after loading completes and DOM renders
    if (messageList.value.length > 0) {
      await nextTick();
      scrollToBottom();
    }
  }
});
</script>

<template>
  <main class="flex-1 flex flex-col min-w-0">
      <header
        class="h-12 min-h-[56px] border-b border-stone-100 bg-white/80 backdrop-blur-sm flex items-center justify-between px-4 gap-2"
      >
        <div class="flex items-center gap-2 min-w-0">
          <button @click="sidebarCollapsed = !sidebarCollapsed"
            class="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-all duration-150"
            :title="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-xs">N</span>
            <span class="text-sm font-medium text-stone-800 truncate">{{ currentSession?.title || '新对话' }}</span>
          </div>
        </div>

        <!-- Tool chain toggle — only visible on chat page -->
        <button
          @click="toggleToolChain()"
          class="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[11px] font-medium transition-all duration-150 shrink-0"
          :class="[
            toolChainState === 0
              ? 'text-stone-300 hover:text-stone-500 hover:bg-stone-50'
              : toolChainState === 1
                ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                : 'text-violet-600 bg-violet-50 hover:bg-violet-100',
          ]"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
          </svg>
          <span>{{ toolChainState === 0 ? '隐藏' : toolChainState === 1 ? '摘要' : '全部' }}</span>
        </button>
      </header>

      <!-- Loading state: full-area skeleton -->
      <div
        v-if="loading"
        class="flex-1 flex flex-col items-center justify-center gap-4 px-6"
      >
        <div
          class="w-6 h-6 rounded-full border-2 border-violet-200 border-t-violet-500 animate-spin"
        ></div>
        <p class="text-xs text-stone-400">正在加载...</p>
      </div>

      <!-- Message Area (scrollable) -->
      <template v-else>
        <div
          class="relative flex flex-col min-h-0"
          :class="messageList.length === 0 ? '' : 'flex-1'"
        >
          <div
            ref="messageContainerRef"
            @scroll="handleScroll"
            class="flex-1 overflow-y-auto px-6 py-6"
          >
            <div class="max-w-3xl mx-auto space-y-6">
              <MessageBubble
                v-for="msg in messageList"
                :key="msg.id"
                :msg="msg"
                :selectedModelName="selectedModel.name"
                :isAiResponding="isAiResponding"
                :isLastMessage="msg === messageList[messageList.length - 1]"
                :expandedThinking="expandedThinking"
                :showAllAttachments="showAllAttachments"
                :toolChainState="toolChainState"
                :expandedSteps="expandedSteps"
                @toggleThinking="toggleThinking"
                @toggleAttachments="toggleAttachments"
                @toggleToolStep="toggleToolStep"
              />

              <!-- Empty State -->
              <div
                v-if="messageList.length === 0"
                class="flex flex-col items-center justify-center py-10 text-center"
              >
                <div
                  class="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mb-6"
                >
                  <svg
                    class="w-8 h-8 text-violet-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                    />
                  </svg>
                </div>
                <h3 class="text-lg font-semibold text-stone-700 mb-2">
                  开始新的对话
                </h3>
                <p class="text-sm text-stone-400 max-w-sm">
                  向 NexusAgent 发送消息，或选择左侧的历史对话继续交流
                </p>
              </div>

              <!-- Scroll to bottom button -->
              <button
                id="down-button"
                v-if="showScrollButton"
                @click="scrollToBottom"
                class="absolute bottom-1 right-6 w-8 h-8 rounded-full flex items-center justify-center bg-white border border-stone-200 shadow-sm text-stone-400 hover:text-stone-600 transition-all duration-200 z-10"
              >
                <svg
                  class="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Input Zone — only after loading, mt-auto pushes to bottom when messages exist -->
        <div
          class="px-6 pb-4 pt-2 bg-stone-50"
          :class="messageList.length > 0 ? 'mt-auto' : 'mt-6'"
        >
          <ChatInput
            :inputText="inputText"
            :isAiResponding="isAiResponding"
            :uploadedPreviews="uploadedPreviews"
            :uploadingCount="uploadingCount"
            :uploadErrors="uploadErrors"
            :selectedModel="selectedModel"
            :selectedKnowledgeBase="selectedKnowledgeBase"
            :enableRag="enableRag"
            :enableThinking="enableThinking"
            :knowledgeBases="knowledgeBases"
            :userApiConfigs="userApiConfigs"
            :selectedApiConfig="selectedApiConfig"
            :mcps="mockMCPList"
            :selectedMCPIds="selectedMCPIds"
            @update:inputText="inputText = $event"
            @sendMessage="sendMessage"
            @handleKeydown="handleKeydown"
            @cancelStreaming="cancelStreaming"
            @selectModel="selectModelLocal"
            @selectKnowledgeBase="selectKnowledgeBase"
            @toggleRag="toggleRag"
            @toggleThinking="toggleEnableThinking"
            @fileSelected="onFileSelected"
            @filePasted="handleFilePasted"
            @removePreview="removePreview"
            @selectApiConfig="selectApiConfig"
            @toggleMCP="toggleMCPSelection"
            @clearUploadErrors="uploadErrors = []"
          />
        </div>
      </template>
    </main>
</template>

<style>
*,
*::before,
*::after {
  box-sizing: border-box;
}
body {
  margin: 0;
  padding: 0;
}
h1,
h2,
h3,
h4,
h5,
h6,
p,
figure,
blockquote,
dl,
dd {
  margin: 0;
}
ul,
ol {
  margin: 0;
  padding: 0;
}
a {
  color: inherit;
  text-decoration: none;
}
img {
  display: block;
  max-width: 100%;
}
#down-button {
  font: inherit;
  cursor: pointer;
  border: none;
  background: none;
  padding: 0;
  margin-right: 120px;
}
input,
textarea,
select {
  font: inherit;
  color: inherit;
}

.markdown-body {
  color: #44403c;
  line-height: 1.75;
  word-break: break-word;
}
.markdown-body h1 {
  font-size: 1.375em;
  font-weight: 700;
  margin-top: 1.2em;
  margin-bottom: 0.5em;
  color: #292524;
}
.markdown-body h2 {
  font-size: 1.125em;
  font-weight: 700;
  margin-top: 1.2em;
  margin-bottom: 0.4em;
  color: #292524;
  padding-bottom: 0.15em;
  border-bottom: 1px solid #e7e5e4;
}
.markdown-body h3 {
  font-size: 1em;
  font-weight: 600;
  margin-top: 1em;
  margin-bottom: 0.3em;
  color: #292524;
}
.markdown-body p {
  margin-bottom: 0.75em;
}
.markdown-body p:last-child {
  margin-bottom: 0;
}
.markdown-body ul,
.markdown-body ol {
  margin-bottom: 0.75em;
  padding-left: 1.5em;
}
.markdown-body ul {
  list-style: disc;
}
.markdown-body ol {
  list-style: decimal;
}
.markdown-body li {
  margin-bottom: 0.25em;
}
.markdown-body li > ul,
.markdown-body li > ol {
  margin-bottom: 0;
}
.markdown-body strong {
  font-weight: 600;
  color: #292524;
}
.markdown-body em {
  font-style: italic;
}
.markdown-body code {
  font-family: "JetBrains Mono", ui-monospace, Consolas, monospace;
  font-size: 0.875em;
  padding: 0.2em 0.4em;
  border-radius: 4px;
  background: #f5f5f4;
  color: #1c1917;
}
.markdown-body pre {
  margin: 0.75em 0;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #e7e5e4;
  background: #fafaf9;
}
.markdown-body pre code {
  display: block;
  padding: 1em;
  overflow-x: auto;
  font-size: 0.8125em;
  line-height: 1.6;
  background: transparent;
  border-radius: 0;
  color: #44403c;
}
.markdown-body hr {
  border: none;
  border-top: 1px solid #e7e5e4;
  margin: 1.5em 0;
}
.markdown-body blockquote {
  border-left: 3px solid #d6d3d1;
  padding-left: 1em;
  margin: 0.75em 0;
  color: #78716c;
}
.markdown-body a {
  color: #7c3aed;
  text-decoration: underline;
}
.markdown-body table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75em 0;
  font-size: 0.875em;
}
.markdown-body th,
.markdown-body td {
  border: 1px solid #e7e5e4;
  padding: 0.5em 0.75em;
  text-align: left;
}
.markdown-body th {
  background: #fafaf9;
  font-weight: 600;
  color: #292524;
}

.code-block-wrapper {
  position: relative;
}
.code-copy-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  color: #a8a29e;
  opacity: 0;
  transition:
    opacity 0.15s,
    background-color 0.15s,
    color 0.15s;
}
.code-block-wrapper:hover .code-copy-btn {
  opacity: 1;
}
.code-copy-btn:hover {
  background: #f5f5f4;
  color: #57534e;
}
.code-copy-btn.copied {
  opacity: 1;
  color: #10b981;
}
.hljs {
  background: transparent !important;
  color: #44403c !important;
}

.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-enter-active > div:last-child,
.drawer-leave-active > div:last-child {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-from > div:last-child,
.drawer-leave-to > div:last-child {
  transform: translateX(100%);
}
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-active > div:last-child,
.modal-leave-active > div:last-child {
  transition:
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from > div:last-child,
.modal-leave-to > div:last-child {
  transform: scale(0.95);
  opacity: 0;
}

.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}
.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}
.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #e7e5e4;
  border-radius: 999px;
}
.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #d6d3d1;
}
</style>
