# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server
npm run build     # vue-tsc -b (project references) + Vite production build
npm run preview   # Preview production build
```

Dependencies are managed via `npm install`. No test framework is currently configured. There is no standalone `vue-tsc` script — type checking runs as part of `npm run build` (`vue-tsc -b` enables project references build mode, not just `--noEmit`).

## Architecture Overview

**NexusAgent** — a Vue 3 + TypeScript + Tailwind CSS 4 chat frontend for an AI Agent platform (Java backend at `http://106.52.234.62:8989`). Single-page app, no router.

### Entry Flow

```
index.html → src/main.ts → src/App.vue → src/NexusAgent.vue
```

### Component Tree

| Component | Role |
|-----------|------|
| `NexusAgent.vue` | Orchestrator: wires composables → child components, owns global state, configures `marked` markdown renderer, lifecycle init. |
| `Sidebar.vue` | Session list, new-chat button, user avatar, MCP/API config entry points. Two-click delete: first click shows delete button, second confirms. |
| `MessageBubble.vue` | Renders user (right-aligned) or assistant (left-aligned with blue N icon) messages. Supports markdown, collapsible thinking blocks (spinner during streaming), three-state tool chain chains, file attachments truncated to 3 with "+N more", image lightbox, copy-to-clipboard (hover reveals button, shows "已复制" feedback). |
| `ChatInput.vue` | Auto-resizing textarea (max 35vh), file attach button (with inline image/document preview and paste support), depth-thinking toggle, options panel (click-outside-to-close) with sub-dropdowns for API config/model/knowledge base/MCP selection using smart positioning (flips above if space below < 260px), RAG toggle, send/stop buttons. |
| `MCPDrawer.vue` | Full multi-view drawer: list (CRUD), add/edit form (name, URL, type: streamable_http/stdio, description, logo upload via `/file/image`, header JSON, enabled toggle), detail view, service-provider import (ModelScope with batch import). MCP API Key management (fetch/save). Two-click delete confirmation. |
| `APIConfigModal.vue` | Modal for managing custom API endpoints (name, base URL, API key, model list with add/remove). Add/edit/delete configs. |

### Composables (state modules composed in NexusAgent.vue)

| Composable | Responsibility |
|------------|---------------|
| `useChat` | Message sending/receiving, SSE streaming, file upload (immediate on selection), typewriter animation (rAF with adaptive step, DOM updates every 4th frame), cancellation via AbortController. Returns: `inputText`, `isAiResponding`, `uploadedPreviews`, `uploadingCount`, `uploadErrors`, `onFileSelected`, `handleFilePasted`, `removePreview`, `handleKeydown`, `cancelStreaming`, `sendMessage`. Internal helpers: `findLastTextFragment`, `ensureTextFragmentLast`, `schedulePlaceholderUpdate` (rAF-batched), `updatePlaceholder` (immediate), `finalizeMessage`, `finishTypewriter`. |
| `useSessions` | Session list CRUD, message loading via `groupMessages()` transform, knowledge-base/MCP list fetching. New local sessions get a `local-{timestamp}` ID replaced by server-assigned `session_id` on first message. Returns: `sessionList`, `currentSessionId`, `messageList`, `knowledgeBases`, `mockMCPList`, `loading`, `errorMsg`, `showSessionDeleteConfirm`, `currentSession`, `loadMessages`, `selectSession`, `createNewSession`, `requestDeleteSession`, `confirmDelete`, `refreshSessionList`, `mapSession`. |
| `useAutoScroll` | Scroll-to-bottom on new content, auto-scroll only when user is near bottom (< 40px). `autoScrollIfNeeded()` captures scroll position BEFORE DOM update then scrolls after nextTick. "Jump to bottom" button when scrolled up > 200px. Returns: `messageContainerRef`, `showScrollButton`, `scrollToBottom`, `autoScrollIfNeeded`, `handleScroll`. |
| `useTitleWebSocket` | WebSocket client for live session title updates. Auto-reconnect with 3s delay. Updates the first session in list when `{ type: "title", data: "..." }` message arrives. Exposes `wsConnected` ref. |

### API Layer (`src/api/`)

- **`types.ts`** — Backend response shapes: `ApiResult<T>` (unified envelope with `code`/`msg`/`data`/`total`), `SessionVO`, `MessageVO`, `KnowledgeVO`, `MCPServerVO`, `UserApiConfigVO` (note: `apikey` is lowercase in GET responses but POST save requires `APIKey` uppercase AK), `ChatDTO`, `ChatUserMessageDTO` (TEXT/FILE/IMAGE types), `ToolRequestVO`, `ToolResultVO`, `McpServerItemDTO`.
- **`index.ts`** — REST client wrapping `fetch()` with Bearer token auth. Core `request<T>()` helper auto-detects JSON array responses vs `ApiResult<T>` envelope. Endpoints:
  - Sessions: `fetchSessionList`, `fetchMessages`, `deleteSession`
  - Knowledge: `fetchKnowledgeList`
  - MCP: `fetchMCPServerList`, `addMCPServer` (POST array), `batchAddMCPServer`, `updateMCPServer`, `deleteMCPServer`, `fetchMCPServerDetail`, `fetchMCPServerFromService`
  - MCP Config: `fetchMCPConfig` (GET, masked), `saveMCPConfig` (POST with query param)
  - Models: `fetchModelList` (GET with query params baseUrl+token)
  - User API Configs: `fetchUserApiConfigs`, `saveUserApiConfig` (POST — note the `APIKey` rename inside function)
  - File Upload: `uploadFile` (POST `/file?bizType=CHAT`, multipart with `files` key, returns `AttachedFileVO[]`), `uploadImage` (POST `/file/image`, single `file` key, returns URL string)
- **`chat-stream.ts`** — SSE streaming chat client. Core functions:
  - `createSSEParser()`: Low-level line-based SSE parser with buffer/flush. Handles standard SSE (event:/data:/id: lines separated by blank lines) and raw JSON/text fallback.
  - `dispatchEvent()`: Dual-mode dispatch — (1) tries JSON `data.type` discriminator (THINK, CONTENT, TOOL_EXECUTION, TOOL_EXECUTION_RESULT, session_id), then (2) falls back to event-name dispatch (text_delta, thinking, tool_call, tool_result, session_id, done, error, finish). Unknown event types are emitted as text_delta if they have `content`.
  - `streamChat()`: HTTP POST + ReadableStream + AbortSignal. Parses streamed chunks via parser, dispatches to callbacks.
  - `buildChatDTO()`: Constructs request payload from current message + history context. Includes existing user messages & file attachments, appends pending files & text. Handles file-only messages by inserting a default "请处理这些文件" text. Includes `enableRag`, `model.isThinking`, `MCPs[]` (converted from string IDs to numbers).

### Types (`src/types/chat.ts`)

Component-level types distinct from API types. Key types:
- `ComponentMessage` — `role` (user/assistant), `content`, `attachments[]`, `thinking`, `fragments[]`, `timestamp`
- `ComponentToolCall` — `status` (running/success/error), `input`, `output`, `durationMs`
- `Fragment` — union of `TextFragment { kind:'text', content }` and `ToolSectionFragment { kind:'tools', calls[], thinking? }`
- `ModelOption` — `id`, `name`, `supportsThinking`, `provider`, `configId` (set for custom API config, empty = system default)
- `ComponentAttachment` — `id`, `name`, `url`, `type` (image/document/code), `size`, `ext`
- `ComponentSession` — `id`, `title`, `createdAt`

### Utils (`src/utils/`)

- **`helpers.ts`** — File validation (`ALLOWED_EXTENSIONS`, `MAX_FILE_SIZE=10MB`, `MAX_FILE_COUNT=10`, `validateFiles`/`validateFile`), file type detection (`mapFileType` classifies by extension into image/document/code, `isImageFile`), formatting (`formatFileSize`, `formatTime`, `formatDuration`, `friendlyError` with HTTP status → Chinese messages, `highlightInput` via highlight.js JSON highlighting, `esc` for HTML escaping), `getFileTypeColor` (CSS classes per type), `mapAttachment` (VO→ComponentAttachment), `generateThumbnail` (placeholder SVG data URI), `isSingleImage`.
- **`markdown.ts`** — `marked` renderer configured with highlight.js syntax highlighting and code-copy buttons (`.code-copy-btn`). `renderMarkdown()` sync parse. `setupCodeCopy()` registers a global click handler on `.code-block-wrapper` elements. `groupMessages()` transforms flat `MessageVO[]` from API history into `ComponentMessage[]` with merged fragments (interleaving text, tools, tool results).

### Key Patterns

- **Immutable state updates**: Arrays/sets are replaced with new copies (`[...arr]`, `new Set(s)`), never mutated in-place. Message list reassigned via `messageList.value = [...messageList.value]`.
- **Message fragments**: Assistant messages use a `fragments[]` array interleaving `TextFragment` and `ToolSectionFragment` to handle streaming where text, tool calls, and tool results arrive in any order. When thinking precedes a tool call, the thinking content is moved into the `ToolSectionFragment.thinking` field.
- **Composables as state modules**: Each composable encapsulates related reactive state + methods, composed in `NexusAgent.vue`. `useChat` receives refs from `useSessions` and `useAutoScroll`.
- **Typewriter animation**: Streaming text buffered in `streamingContent`, revealed via `requestAnimationFrame` with adaptive step size (`Math.max(1, Math.ceil(remaining / 180))`). DOM updates throttled to every 4th frame. When tool calls arrive mid-text, buffered content flushed immediately via `finishTypewriter()`. Internal `schedulePlaceholderUpdate()` chains pending updates into a single rAF.
- **Session ID lifecycle**: New sessions start with `local-{timestamp}` IDs. On first message, the server returns a `session_id` SSE event; the composable replaces the local ID with the server-assigned one. URL is synced as `/session/{id}` via `history.replaceState`.
- **Three-state tool chain display**: `toolChainState` (0/1/2, persisted in localStorage) controls rendering: 0 = fully hidden, 1 = summary with expandable individual steps, 2 = expanded by default with collapsible steps. Implemented in `MessageBubble.vue`.
- **Custom API config routing**: When `ModelOption.configId` is set, backend routes requests through that config's base URL and API key. Otherwise system default provider.
- **NexusAgent.vue lifecycle** (`onMounted`): Fetches sessions, knowledge bases, MCP list, and API configs in parallel via `Promise.all`. Restores selections from localStorage (selectedConfigId, selectedKnowledgeBase, selectedMCPIds). Resolves session priority: URL path (`/session/{id}`) > localStorage cached ID > new local session. Exposes `window.__setToken('jwt')` for dev console.

### SSE Event Flow (chat-stream.ts)

`streamChat()` POSTs to `/chat/stream` and receives SSE via dual-mode dispatch in `dispatchEvent()`:

1. **JSON type discriminator** (backend sends `event:message` with `data.type`):
   - `THINK` → `data.thinking` → `onThinking()` — deep thinking content
   - `CONTENT` → `data.content` → `onTextDelta()` — streaming text
   - `TOOL_EXECUTION` → `data.toolRequestList[]` → `onToolCall()` — tool invocations (streaming arguments accumulated by call ID in useChat)
   - `TOOL_EXECUTION_RESULT` → `data.toolResultVO` → `onToolResult()` — tool execution results (with isError flag)
   - `session_id` → `data.sessionId` → `onSessionId()` — assigns server session ID

2. **Event-name fallback** (for non-message events):
   - `text_delta`, `thinking`, `tool_call`, `tool_result`, `session_id`, `done`, `error`, `finish`

`ChatDTO` includes `enableRag` (RAG toggle) and `model.isThinking` (deep thinking toggle).

### Styling

- **Tailwind CSS v4** with `@import "tailwindcss"` and custom `@theme` tokens for font families (Inter sans-serif / JetBrains Mono monospace). Tailwind v4 uses CSS-first configuration — no `tailwind.config.js`; customization via `@theme` directives in `src/style.css`.
- Markdown content styled via `.markdown-body` CSS class in `NexusAgent.vue` `<style>`. Includes styles for headings, code blocks, blockquotes, tables, lists.
- Code blocks have `.code-block-wrapper` with hover-reveal `.code-copy-btn` (green "copied" state).
- Drawer/modal transitions use Vue `<Transition>` with custom CSS (`drawer-enter-active`, `modal-enter-active`).
- Custom scrollbar styling via `::-webkit-scrollbar` pseudo-elements.
- `marked` renderer is configured in TWO places: `NexusAgent.vue` (imports `marked` directly, runs first) and `src/utils/markdown.ts`. Both configure the same code highlighting — if they diverge, `NexusAgent.vue`'s config wins.

### Dependencies

- Vue 3.5+, TypeScript 6.0+, Vite 8+, vue-tsc 3.2+
- Tailwind CSS v4, `@tailwindcss/vite` plugin
- `marked` (markdown parsing), `highlight.js` (syntax highlighting, github.css style)
- Dev: `@types/node`, `@vitejs/plugin-vue`, `@vue/tsconfig`
- No state management library, no test framework, no router

### Backend API Notes

- Base URL: `http://106.52.234.62:8989`
- Auth: Bearer token stored in `localStorage.getItem('token')`, settable via `window.__setToken('jwt')` in dev console.
- Chat endpoint: `POST /chat/stream` returns SSE.
- WebSocket: `ws://106.52.234.62:8989/ws/1` pushes `{ type: "title", data: "..." }` events.
- File upload: documents to `POST /file?bizType=CHAT` (multipart, `files` key), images to `POST /file/image` (multipart, `file` key).
- Unified response envelope `ApiResult<T>`: `{ code: 0, msg: "ok", data: T, total: number | null }`. Some endpoints return raw JSON arrays (e.g., `/history/{sessionId}`) — the `request()` helper detects this by checking if text starts with `[`.
- A full API reference (from tarslib/Widdershins) is available in [`后端接口.md`](后端接口.md) at the repo root.

### Configuration

`.claude/settings.local.json` pre-authorizes `npm install`, `npx vite`, and `node` commands.
