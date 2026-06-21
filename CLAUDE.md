# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server
npm run build     # vue-tsc -b (project references) + Vite production build
npm run preview   # Preview production build
```

Dependencies are managed via `npm install`. No test framework is currently configured. Type checking runs as part of `npm run build` (`vue-tsc -b` enables project references build mode).

## Architecture Overview

**NexusAgent** — a Vue 3 + TypeScript + Tailwind CSS 4 chat frontend for an AI Agent platform (Java backend at `http://localhost:8080`). Multi-page SPA using `vue-router`.

### Entry Flow

```
index.html → src/main.ts (installs router) → src/App.vue (<router-view />)
```

### Routing (`src/router/index.ts`)

```text
/                          → AppLayout.vue (shell with Sidebar + router-view)
  /chat/:sessionId?        → NexusAgent.vue (chat page, lazy-loaded)
  /knowledge               → KnowledgeBasePage.vue (files + knowledge bases, lazy-loaded)
```

`AppLayout.vue` is the persistent shell: Sidebar on the left, `<router-view />` for page content, plus global overlays (MCPDrawer, APIConfigModal, ToastContainer). Old `/session/{id}` URLs are detected in `onMounted` and redirected to `/chat/{id}`.

### Component / Page Tree

| Page / Component | Route / Role |
|---|---|
| `AppLayout.vue` | Persistent shell: sidebar + router-view + global overlays. Owns sidebar state, session list, MCP drawer, API config modal. |
| `NexusAgent.vue` | `/chat/:sessionId?` — Chat orchestrator: wires composables together, owns chat state (selected model, MCPs, RAG, thinking toggle, tool chain state), configures `marked` markdown renderer, lifecycle init. |
| `KnowledgeBasePage.vue` | `/knowledge` — Dual-tab page: **Files** tab (search, filter by bizType, upload, file grid with preview modal) and **Knowledge Bases** tab (sidebar list of KBs, detail view with file management, create KB modal, add-files-to-KB modal, vector model selector). |
| `FilePreviewModal.vue` | Standalone file preview modal — PDF (Blob→iframe), docx (docx-preview), xlsx (SheetJS), md (markdown-it), txt (pre), html (iframe srcdoc), images. All rendering is local. |
| `Sidebar.vue` | Persistent nav: session list, new-chat button, user avatar, MCP/API config entry points. |
| `MessageBubble.vue` | Renders user or assistant messages with markdown, collapsible thinking blocks, three-state tool chain chains, file attachments (truncated to 3 with "+N more"), image lightbox, copy-to-clipboard. |
| `ChatInput.vue` | Auto-resizing textarea (max 35vh), file attach (with inline preview and paste), depth-thinking toggle, options panel with sub-dropdowns for API config/model/knowledge base/MCP selection (smart positioning), RAG toggle, send/stop buttons. Only CHAT-type models shown in model selector. |
| `APIConfigModal.vue` | Modal for managing custom API endpoints (name, base URL, API key, model list with Chat/向量 segmented control). Uses `ModelItem` type for model entries. |
| `MCPDrawer.vue` | Full multi-view drawer: list (CRUD), add/edit form, detail view, service-provider import (ModelScope), MCP API Key management. |
| `CustomSelect.vue` | Reusable dropdown select component. `v-model` + options array, click-outside-to-close, transition animation, optional `right` prop for right-aligned dropdown. |
| `ToastContainer.vue` | Renders toast notifications with auto-dismiss after 3s. Consumed by `useToast`. |

### Composables (state modules)

Shared state lives in module-level singletons (`useAppState`, `useSessions`). Chat-specific state is scoped to `NexusAgent.vue`.

| Composable | Scope | Responsibility |
|---|---|---|
| `useSessions` | Singleton | Session list CRUD, message loading via `groupMessages()` transform, knowledge-base/MCP list fetching. New local sessions get `local-{timestamp}` ID replaced by server-assigned `session_id` on first message. Exposes `initPromise` for lifecycle coordination. |
| `useAppState` | Singleton | Sidebar collapse state, MCP drawer / API config modal visibility, user API configs. `refreshUserApiConfigs()` helper. |
| `useChat` | Scoped | Message sending/receiving, SSE streaming, file upload (immediate on selection), typewriter animation (rAF with adaptive step, DOM updates every 4th frame), cancellation via AbortController. Receives refs from `useSessions` and `useAutoScroll`. |
| `useAutoScroll` | Scoped | Scroll-to-bottom on new content (auto-scroll only when near bottom < 40px). "Jump to bottom" button when scrolled up > 200px. |
| `useTitleWebSocket` | Scoped | WebSocket client for live session title updates (`ws://localhost:8080/ws/1`). Auto-reconnect with 3s delay. |
| `useToast` | Scoped | Global toast notification. `show(message, type)` pushes to `toasts` ref with 3s auto-dismiss. |

### API Layer (`src/api/`)

- **`types.ts`** — Backend response shapes: `ApiResult<T>` (unified envelope with `code`/`msg`/`data`/`total`), `SessionVO`, `MessageVO`, `AttachedFileVO`, `KnowledgeVO`, `KnowledgeDetailVO` (extends KnowledgeVO with `knowledgeBaseFileList[]`), `KnowledgeBaseFileItem`, `MCPServerVO`, `UserApiConfigVO`, `ChatDTO`, `ChatUserMessageDTO`, `McpServerItemDTO`, `KnowledgeFileDTO`, `KnowledgeCreateDTO`, `ModelItem` (`{name, type: 'CHAT'|'EMBEDDING'}`).
  - **`UserApiConfigVO.model`** is `ModelItem[]` (parsed from JSON strings by `fetchUserApiConfigs()`).
  - **`UserApiConfigVO` note**: `apikey` is lowercase in GET responses but POST save requires `APIKey` uppercase AK — handled by the `saveUserApiConfig()` function.
  - **`KnowledgeFileDTO`** includes `configId?: string` and `model?: string` for embedding model association.
- **`index.ts`** — REST client wrapping `fetch()`. Key helpers:
  - `buildHeaders()`: Central header builder — injects `token` header (not `Authorization: Bearer`) into every request, skips for auth paths (login/register).
  - `safeParse<T>()`: JSON.parse wrapper with regex to quote 16+ digit numbers, preventing JavaScript Number precision loss from bigint backend IDs.
  - `request<T>()`: Core API caller with 401/NOT_LOGIN interceptor — auto-clears localStorage token and redirects to `/auth` on session expiry. Auth paths are exempt from interception.
  - Endpoints:
    - Sessions: `fetchSessionList`, `fetchMessages`, `deleteSession`
    - Knowledge: `fetchKnowledgeList`, `fetchKnowledgeDetail`, `createKnowledge`, `uploadKnowledgeFile` (associate files with configId+model), `uploadKnowledgeFileBinary` (upload file with bizType=KNOWLEDGE)
    - MCP: `fetchMCPServerList`, `addMCPServer` (POST array), `batchAddMCPServer`, `updateMCPServer`, `deleteMCPServer`, `fetchMCPServerDetail`, `fetchMCPServerFromService`
    - MCP Config: `fetchMCPConfig` (GET, masked), `saveMCPConfig` (POST with query param)
    - Models: `fetchModelList` (GET with query params baseUrl+token)
    - User API Configs: `fetchUserApiConfigs` (parses model JSON strings → `ModelItem[]`), `saveUserApiConfig`
    - Files: `fetchUserFiles` (GET with fileName/bizType params), `uploadFile` (POST multipart, `bizType=CHAT`, `files` key), `uploadImage` (POST multipart, `file` key)
- **`chat-stream.ts`** — SSE streaming chat client. Core functions:
  - `createSSEParser()`: Low-level line-based SSE parser with buffer/flush.
  - `dispatchEvent()`: Dual-mode dispatch — (1) tries JSON `data.type` discriminator (THINK, CONTENT, TOOL_EXECUTION, TOOL_EXECUTION_RESULT, session_id), then (2) falls back to event-name dispatch.
  - `streamChat()`: HTTP POST + ReadableStream + AbortSignal. Parses streamed chunks via parser, dispatches to callbacks.
  - `buildChatDTO()`: Constructs request payload from current message + history context.

### Types (`src/types/chat.ts`)

Component-level types distinct from API types. Key types: `ComponentMessage`, `ComponentAttachment`, `ComponentThinking`, `ComponentToolCall`, `Fragment` (union of `TextFragment` | `ToolSectionFragment`), `ComponentSession`, `ModelOption`.

### Utils (`src/utils/`)

- **`helpers.ts`** — File validation, type detection, formatting (size/time/duration), HTTP error messages (Chinese), JSON highlighting, HTML escaping, file type color classes, attachment mapping.
- **`markdown.ts`** — `marked` renderer config with highlight.js, `renderMarkdown()` sync parse, `setupCodeCopy()` global click handler. `groupMessages()` transforms flat `MessageVO[]` into `ComponentMessage[]` with merged fragments.

### Key Patterns

- **Immutable state updates**: Arrays/sets replaced with new copies (`[...arr]`, `new Set(s)`), never mutated in-place.
- **Module-level singleton composables**: `useAppState` and `useSessions` share state across all components via module-scoped `ref()` values.
- **Message fragments**: Assistant messages use `fragments[]` array interleaving `TextFragment` and `ToolSectionFragment`. Thinking content that precedes a tool call is moved into `ToolSectionFragment.thinking`.
- **Composables as state modules**: Each composable encapsulates related reactive state + methods, composed in `NexusAgent.vue`.
- **Typewriter animation**: `requestAnimationFrame` with adaptive step size (`Math.max(1, Math.ceil(remaining / 180))`). DOM updates throttled to every 4th frame.
- **Session ID lifecycle**: New sessions start with `local-{timestamp}` IDs. On first message, the server returns a `session_id` SSE event; the composable replaces the local ID with the server-assigned one.
- **Three-state tool chain display**: `toolChainState` (0/1/2, persisted in localStorage) controls rendering: 0 = hidden, 1 = summary with expandable steps, 2 = expanded by default.
- **Router-aware session resolution** (in `NexusAgent.vue` `onMounted`): Priority is route param (`:sessionId`) > localStorage cached ID > new local session.
- **NexusAgent.vue lifecycle** (`onMounted`): Configures `marked`, calls `setupCodeCopy()`, connects WebSocket. Waits for `useSessions().initPromise`, then fetches API configs, restores selections from localStorage, resolves session from route params, loads messages.
- **Custom API config routing**: When `ModelOption.configId` is set, backend routes through that config's base URL and API key; otherwise system default.
- **Session reuse**: `createNewSession()` reuses an existing `local-` session in the list instead of creating a new one, preventing sidebar bloat.
- **`buildHeaders()` central interceptor** (in `src/api/index.ts`): All HTTP calls go through `buildHeaders()` which injects the `token` header. Auth paths skip the token to avoid stale-token 401s on login/register.
- **401/NOT_LOGIN interceptor** (in `request()`): On HTTP 401 or `{code:1, msg:"NOT_LOGIN"}` response, clears all localStorage keys and redirects to `/auth`. Only triggers for non-auth paths.
- **Bigint overflow protection** (`safeParse()`): Backend IDs (~2e18) exceed `Number.MAX_SAFE_INTEGER`. A regex quotes 16+ digit numbers before `JSON.parse`. Applied in `request()` and all three direct upload functions.
- **Embedding model selection** (KnowledgeBasePage): Filters `type === 'EMBEDDING'` from all API configs, caches selection in `localStorage` as `default_embedding_model`, and includes `configId`+`model` in the file-association payload.
- Exposes `window.__setToken('jwt')` for dev console auth.

### SSE Event Flow (chat-stream.ts)

`streamChat()` POSTs to `/chat/stream` and receives SSE via dual-mode dispatch in `dispatchEvent()`:

1. **JSON type discriminator** (`event:message` with `data.type`):
   - `THINK` → `onThinking()` — deep thinking content
   - `CONTENT` → `onTextDelta()` — streaming text
   - `TOOL_EXECUTION` → `onToolCall()` — tool invocations (streaming arguments accumulated by call ID)
   - `TOOL_EXECUTION_RESULT` → `onToolResult()` — tool execution results (with `isError` flag)
   - `session_id` → `onSessionId()` — assigns server session ID

2. **Event-name fallback** (for non-message events):
   - `text_delta`, `thinking`, `tool_call`, `tool_result`, `session_id`, `done`, `error`, `finish`

`ChatDTO` includes `enableRag` (RAG toggle) and `model.isThinking` (deep thinking toggle).

### Styling

- **Tailwind CSS v4** with `@import "tailwindcss"` and `@theme` tokens for font families (Inter sans-serif / JetBrains Mono monospace). CSS-first config — no `tailwind.config.js`.
- Markdown content styled via `.markdown-body` CSS class in `NexusAgent.vue` `<style>`.
- Code blocks have `.code-block-wrapper` with hover-reveal `.code-copy-btn`.
- Drawer/modal transitions use Vue `<Transition>` with custom CSS.
- `marked` renderer configured in `NexusAgent.vue` (imports `marked` directly — this config wins if `src/utils/markdown.ts` diverges).

### TypeScript Configuration

Project references structure (`vue-tsc -b` build mode):
- `tsconfig.json` — root references `tsconfig.app.json` + `tsconfig.node.json`
- `tsconfig.app.json` — extends `@vue/tsconfig/tsconfig.dom.json`, targets `src/**/*.ts`/`.tsx`/`.vue`. Key flags: `erasableSyntaxOnly: true`, `noUnusedLocals: false`, `noUnusedParameters: false`
- `tsconfig.node.json` — for `vite.config.ts` only, targets ES2023, `verbatimModuleSyntax: true`

### Vite Config

Minimal `vite.config.ts` — only two plugins: `@vitejs/plugin-vue` and `@tailwindcss/vite`. No proxy, no aliases, no CSS preprocessing beyond Tailwind.

### Dependencies

- Vue 3.5+, TypeScript 6.0+, Vite 8+, vue-tsc 3.2+
- Tailwind CSS v4, `@tailwindcss/vite` plugin
- `vue-router` ^4.6.4 — **active** with `createWebHistory`
- `marked` (markdown parsing), `highlight.js` (syntax highlighting, github.css style)
- `docx-preview` (Word docx preview), `xlsx` / SheetJS (Excel preview), `markdown-it` (Markdown rendering in preview modal)
- `@types/markdown-it` (dev)
- Dev: `@types/node`, `@vitejs/plugin-vue`, `@vue/tsconfig`
- No state management library, no test framework
- Recommended VSCode extension: `Vue.volar`

### Backend API Notes

- Base URL: `http://localhost:8080`
- Auth: `token` header (not standard `Authorization: Bearer`). Token stored in `localStorage.getItem('token')`, settable via `window.__setToken('jwt')` in dev console.
- Chat endpoint: `POST /chat/stream` returns SSE.
- WebSocket: `ws://localhost:8080/ws/1` pushes `{ type: "title", data: "..." }` events.
- File upload: documents to `POST /file?bizType=CHAT` (multipart, `files` key), images to `POST /file/image` (multipart, `file` key), knowledge files to `POST /file?bizType=KNOWLEDGE`.
- Unified response envelope `ApiResult<T>`: `{ code: 0, msg: "ok", data: T, total: number | null }`. Some endpoints return raw JSON arrays (e.g., `/history/{sessionId}`) — the `request()` helper detects this by checking if text starts with `[`.
- File listing: `GET /file?fileName=&bizType=KNOWLEDGE` — backend requires `fileName` param (pass empty string for all).
- Error handling: HTTP 401 or `{"code":1,"msg":"NOT_LOGIN"}` on non-auth endpoints triggers automatic token wipe + redirect to `/auth`.
- `UserApiConfigVO.model` returns JSON-stringified `ModelItem` objects (e.g. `["{\\"name\\":\\"...\\",\\"type\\":\\"CHAT\\"}"]`). `fetchUserApiConfigs()` parses them into proper `ModelItem[]`.
- Knowledge file association: `POST /knowledge/file` accepts `{fileIds, knowledgeId, configId, model}` where `configId` and `model` reference the selected embedding model.

### Configuration

`.claude/settings.local.json` pre-authorizes `npm install`, `npx vite`, and `node` commands.
