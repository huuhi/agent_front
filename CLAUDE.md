# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server (proxy → http://106.52.234.62:8989)
npm run build     # vue-tsc -b (project references) + Vite production build
npm run preview   # Preview production build
```

Dependencies via `npm install`. No test framework configured. Type checking runs as part of `npm run build`.

## Architecture Overview

**NexusAgent** — Vue 3 + TypeScript + Tailwind CSS 4 chat frontend for an AI Agent platform (Java backend). Multi-page SPA using `vue-router` with `createWebHistory`.

### Entry Flow

```
index.html → src/main.ts (installs router) → src/App.vue (<router-view />)
```

### Routing (`src/router/index.ts`)

```text
/auth                   → AuthPage.vue (login/register)
/                       → AppLayout.vue (shell with Sidebar + router-view)
  /chat/:sessionId?     → NexusAgent.vue (chat page, lazy-loaded)
  /files                → FilesPage.vue (file library, lazy-loaded)
  /knowledge            → KnowledgeBasePage.vue (knowledge bases, lazy-loaded)
```

### Component / Page Tree

| Component | Role |
|---|---|
| `AppLayout.vue` | Persistent shell: sidebar + router-view + global overlays (MCPDrawer, APIConfigModal, UserMemoryModal, ToastContainer). Owns `useSessions`, `useAppState`. |
| `NexusAgent.vue` | `/chat/:sessionId?` — Chat orchestrator: wires composables, owns chat state (selected model, MCPs, RAG, thinking toggle, tool chain state), configures `marked` renderer, lifecycle init with session resolution. |
| `MessageBubble.vue` | Renders user/assistant messages: collapsible thinking card (grid-template-rows), three-state tool chain (hidden/summary/full), tool loading animation, file attachment cards, image lightbox, copy-to-clipboard. |
| `ChatInput.vue` | Auto-resizing textarea, file attach, depth-thinking toggle, options panel (API config/model/knowledge base/MCP selection), RAG toggle, send/stop buttons. |
| `Sidebar.vue` | Logo, new-chat button, search, nav links (files/knowledge), recent chat list (uses `sessions` prop from `useSessions`), user card popover (memories/API config/MCP/logout). |
| `AuthPage.vue` | Login/register with code/password modes, email verification, JWT → localStorage, navigates to `/`. |
| `FilesPage.vue` | File library: search, filter by bizType, upload, file grid with preview modal. |
| `KnowledgeBasePage.vue` | Knowledge base management: sidebar KB list, KB detail with associated files, create KB modal, add-files-to-KB modal, vector model selector. |
| Other | `FilePreviewModal.vue`, `APIConfigModal.vue`, `MCPDrawer.vue`, `CustomSelect.vue`, `UserMemoryModal.vue`, `ToastContainer.vue` |

### Composables (State Modules)

**Singleton** (module-level `ref()`, shared across all components):
- `useSessions` — Session list CRUD, message loading, KB/MCP list fetching. `waitForReady()` for lifecycle coordination, `refreshSessionList()` with dual-preserve merge (local- sessions + active session not yet backend-persisted). `resetSessions()` for logout. Auto-inits on module import.
- `useAppState` — Sidebar collapse, modal visibilities, user API configs, avatar/display name from JWT.

**Scoped** (state lives inside the consuming component):
- `useChat` — Message sending/receiving, SSE streaming, file upload, dual typewriter system (content + thinking), stream state machine (`_streamTarget`), abort controller. Passed `scrollToBottom`, `anchorScroll`, `forceScroll` from parent.
- `useAutoScroll` — Scroll tracking: `isLockedToBottom` lock, `@scroll` updates lock (50px threshold), `anchorScroll()` (double rAF, locked-only), `forceScroll(durationMs?)` (one-shot or timed RAF burst), `ResizeObserver` on inner content wrapper.
- `useTitleWebSocket` — WebSocket for live title updates (`/api/ws/{userId}` from JWT). Uses `currentSessionId` for precise ID-based title matching (no `sessionList[0]` fallback). Auto-reconnect 3s.
- `useToast` — Global toast with 3s auto-dismiss.

### Streaming & Typewriter System (`useChat.ts`)

**SSE event flow** (from `chat-stream.ts` → `useChat` callbacks):

```
THINK           → onThinking()  → _fullThinkingBuffer → thinking typewriter (80 cps)
CONTENT         → onTextDelta() → fullContent → content typewriter (60-800 cps adaptive)
TOOL_EXECUTION  → onToolCall()  → creates/updates ToolSectionFragment
TOOL_EXECUTION_RESULT → onToolResult() → updates ComponentToolCall status/output
session_id      → onSessionId() → replaces local- ID with server-assigned ID
```

**Stream state machine** (`_streamTarget`):
- `MAIN_THINKING` → writing to `msg.thinking.content`
- `TOOL_INPUT` / `TOOL_THINKING` → writing to last tool fragment's `thinking`
- `MAIN_CONTENT` → writing to text fragment / `msg.content`

**Typewriter sync**: `_isThinkingActive` lock prevents content typewriter from starting while thinking typewriter is still revealing. Flushed by `finishThinkingTypewriter()` on first `onTextDelta` or `onToolCall`.

### API Layer (`src/api/`)

- **`index.ts`** — REST client wrapping `fetch()`. `BASE_URL = '/api'`. `buildHeaders()` injects `token` header (not `Authorization: Bearer`). `request<T>()` has 401/NOT_LOGIN interceptor → clears localStorage → redirects `/auth`. `safeParse<T>()` quotes 16+ digit numbers to prevent bigint overflow.
- **`chat-stream.ts`** — SSE client. `streamChat()` POSTs to `/api/chat/stream`. `createSSEParser()` is a line-based SSE parser with buffer/flush. `dispatchEvent()` uses dual-mode dispatch: JSON `data.type` discriminator first, event-name fallback second.
- **`types.ts`** — Backend response shapes: `ApiResult<T>` envelope (`code`/`msg`/`data`/`total`). `SessionVO`, `MessageVO`, `AttachedFileVO`, `KnowledgeVO`, `ChatDTO`, `ModelItem` (`{name, type: 'CHAT'|'EMBEDDING'}`), etc.

### Key Patterns

- **Immutable state**: Arrays/sets replaced with new copies, never mutated in-place. Exception: `sessionList` WS title update uses `sessionList.value = [...sessionList.value]` for reactivity after mutating a found object.
- **Message fragments**: Assistant messages interleave `TextFragment` and `ToolSectionFragment` in `fragments[]`. Pre-tool thinking stays on `msg.thinking` permanently (never set to `undefined`). Post-tool step-thinking routes to `frag.thinking`.
- **Session lifecycle**: New sessions get `local-{timestamp}` ID → first SSE `session_id` replaces it → `router.replace('/chat/{realId}')` updates URL → `refreshSessionList()` preserves it via dual-preserve merge.
- **Three-state tool chain**: `toolChainState` (0/1/2, localStorage-persisted): 0 = hidden, 1 = summary (click to expand individual steps), 2 = all expanded. Thinking area auto-expands in state 2 via per-component `watch(toolChainState)` in `MessageBubble.vue`.
- **Thinking area**: CSS `grid-template-rows` transition (0fr→1fr). Controlled by local `isThinkingExpanded` ref in each `MessageBubble`, not a shared Set in parent.
- **Scroll**: `ResizeObserver` observes the inner content wrapper (not the scroll container). `forceScroll(durationMs)` does timed RAF burst for CSS transitions. User scroll-up immediately stops all bursts via `isLockedToBottom` guard.
- **Auth**: `token` header, not Bearer. JWT stored in `localStorage`. Claims: `user_id`, `user_name`, `image_url`. Parsed client-side by `src/utils/jwt.ts`.
- **Bigint IDs**: Backend IDs (~2e18) exceed `Number.MAX_SAFE_INTEGER`. The `safeParse()` regex quotes 16+ digit numbers before JSON.parse. ID comparisons always use `String(s.id) === String(otherId)`.

### Styling

- **Tailwind CSS v4** with `@import "tailwindcss"` and `@theme` tokens. CSS-first config — no `tailwind.config.js`.
- **Morandi palette**: Muted file card colors (`#F3F1FC`, `#FAF0F4`, `#F0F4FA`), accent `#606CF3`.
- **Markdown**: `.markdown-body` class in `NexusAgent.vue <style>`. `marked` renderer configured in `NexusAgent.vue` (this config wins if `src/utils/markdown.ts` diverges).
- **Thinking card**: `background: transparent`, `border-left: 1.5px solid #E6E5F5`, `color: #9CA3AF`, italic 14px.
- **Tool transitions**: `.tool-expand-*` / `.tool-output-*` — 300ms max-height + opacity cubic-bezier.

### Dependencies

- Vue 3.5+, TypeScript 6.0+, Vite 8+, vue-tsc 3.2+, Tailwind CSS v4
- `vue-router` ^4.6.4 (createWebHistory), `marked`, `highlight.js` (github.css)
- `docx-preview`, `xlsx`/SheetJS, `markdown-it` (file previews)
- Dev: `@types/node`, `@types/markdown-it`, `@vitejs/plugin-vue`, `@vue/tsconfig`, `@tailwindcss/vite`

### Backend API Notes

- **Base URL**: `http://106.52.234.62:8989` with context-path `/api` (all endpoints under `/api/...`).
- **Auth**: `token` header. Token in `localStorage.getItem('token')`. Dev console: `window.__setToken('jwt')`.
- **Chat**: `POST /api/chat/stream` → SSE response.
- **WebSocket**: `ws://host/api/ws/{userId}` (user ID from JWT `user_id` claim). Pushes `{type:"title", data:"..."}` events.
- **File upload**: `POST /api/file?bizType=CHAT` (multipart, `files` key). Images: `POST /api/file/image` (multipart, `file` key).
- **Response envelope**: `ApiResult<T>` = `{code, msg, data, total}`. Some endpoints (e.g., `/api/history/{sessionId}`) return raw arrays — `request()` detects by checking if text starts with `[`.
- **401/NOT_LOGIN**: Auto-clears localStorage + redirects to `/auth`.
- **UserApiConfigVO.model**: JSON-stringified `ModelItem[]`, parsed by `fetchUserApiConfigs()`.
- **Knowledge file association**: `POST /api/knowledge/file` with `{fileIds, knowledgeId, configId, model}`.

### Vite Config

`vite.config.ts` — plugins: `@vitejs/plugin-vue`, `@tailwindcss/vite`. Proxy: single `/api` rule targeting `http://106.52.234.62:8989` (no rewrite — backend already has `/api` context-path). WebSocket proxy at `/api/ws` with silent ECONNREFUSED handling. HMR explicitly configured on `ws://localhost:5173`.
