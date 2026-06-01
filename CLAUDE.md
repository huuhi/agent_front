# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server on 100.106.145.17:5173
npm run build     # vue-tsc --noEmit type-check + Vite production build
npm run preview   # Preview production build
npm run vue-tsc   # Type-check only (no build)
```

Dependencies are managed via `npm install`. No test framework is currently configured.

## Architecture Overview

**NexusAgent** — a Vue 3 + TypeScript + Tailwind CSS 4 chat frontend for an AI Agent platform (Java backend at `http://100.106.145.17:8080`). Single-page app, no router.

### Entry Flow

```
index.html → src/main.ts → src/App.vue → src/NexusAgent.vue
```

### Component Tree

| Component | Role |
|-----------|------|
| `NexusAgent.vue` | Orchestrator: wires composables → child components, owns global state (model, API config, RAG/thinking toggles, expand/collapse sets, tool chain display state). Also configures the `marked` markdown renderer. |
| `Sidebar.vue` | Session list, new-chat button, user avatar, MCP/API config entry points. Session deletion uses a two-click confirm pattern (click once to show delete button, click again to confirm). |
| `MessageBubble.vue` | Renders a single message: user (right-aligned) or assistant (left-aligned with blue N icon). Handles markdown, collapsible thinking blocks (with spinner during streaming), three-state tool call chains, file attachments (truncated to 3 with "+N more" button). |
| `ChatInput.vue` | Textarea with auto-resize (max 35vh), file attach button, model selector, knowledge base selector, API config selector, RAG/thinking toggle switches, send/stop buttons. |
| `MCPDrawer.vue` | Slide-out drawer listing MCP servers (name, status dot, URL, description). |
| `APIConfigModal.vue` | Modal for managing custom API endpoints (name, base URL, API key, model list). Supports add/edit/delete configs. |

### Composables (data/logic layer)

| Composable | Responsibility |
|------------|---------------|
| `useChat` | Message sending/receiving, SSE streaming, file upload (document vs image via separate endpoints), typewriter animation, streaming state, cancellation via AbortController. Receives refs from `useSessions` and `useAutoScroll` as parameters. |
| `useSessions` | Session list CRUD, message loading from history (via `groupMessages()` transform), knowledge-base/MCP list fetching. New local sessions get a `local-{timestamp}` ID that is replaced by the server-assigned `session_id` on first message. |
| `useAutoScroll` | Scroll-to-bottom on new content, auto-scroll only when user is near bottom (< 40px). `autoScrollIfNeeded()` is called BEFORE DOM update to capture scroll position. Shows "jump to bottom" button when scrolled up > 200px. |
| `useTitleWebSocket` | WebSocket client for live session title updates. Auto-reconnect with 3s delay. Updates the first session in the list when a `{ type: "title", data: "..." }` message arrives. Disconnects on component unmount. |

### API Layer (`src/api/`)

- **`types.ts`** — Backend API response shapes: `SessionVO`, `MessageVO`, `KnowledgeVO`, `MCPServerVO`, `ApiResult<T>` (unified envelope with `code`/`msg`/`data`/`total`), `ChatDTO`, `ChatUserMessageDTO` (TEXT/FILE/IMAGE types). Note: `UserApiConfigVO.apikey` is lowercase in GET responses but the POST save endpoint requires `APIKey` (uppercase AK).
- **`index.ts`** — REST client wrapping `fetch()` with Bearer token auth. Exports: `fetchSessionList`, `fetchMessages`, `deleteSession`, `fetchKnowledgeList`, `fetchMCPServerList`, `fetchModelList`, `fetchUserApiConfigs`, `saveUserApiConfig`, `uploadFile` (POST `/file?bizType=CHAT`), `uploadImage` (POST `/file/image` — separate endpoint for images).
- **`chat-stream.ts`** — SSE streaming chat client. Dual-mode event dispatch: (1) tries `data.type` discriminator from the backend's JSON payload (THINK, CONTENT, TOOL_EXECUTION, TOOL_EXECUTION_RESULT, session_id), then (2) falls back to standard event-name-based dispatch (text_delta, thinking, tool_call, tool_result, session_id, done, error, finish). Core: `createSSEParser()` (low-level line-based SSE parser with buffer/flush), `streamChat()` (HTTP POST + ReadableStream parsing + AbortSignal), `buildChatDTO()` (constructs request payload from current message + history context, includes `isThinking` in the model DTO).

### Types (`src/types/chat.ts`)

Component-level types distinct from API types:

- `ComponentMessage` — `role` (user/assistant), `content`, `attachments[]`, `thinking` (collapsible deep-thought region), `fragments[]` (interleaved TextFragment | ToolSectionFragment), `timestamp`
- `ComponentToolCall` — `status` (running/success/error), `input`, `output`, `durationMs`
- `Fragment` — union of `TextFragment { kind:'text', content }` and `ToolSectionFragment { kind:'tools', calls[], thinking? }`
- `ModelOption` — `id`, `name`, `supportsThinking`, `provider`, `configId` (set when using a custom API config, empty = system default)

### Utils (`src/utils/`)

- **`helpers.ts`** — File type classification (image/document/code by extension), JSON highlighting via highlight.js, HTTP status → Chinese error messages (400→参数错误, 401→认证失败, etc.), file size/time formatting, `generateThumbnail()` (placeholder SVG for images).
- **`markdown.ts`** — `marked` renderer configured with highlight.js syntax highlighting and code-copy buttons (click handler registered globally via `setupCodeCopy()`). `groupMessages()` transforms flat `MessageVO[]` from API history into `ComponentMessage[]` with merged fragments (interleaving text, tools, and tool results).

### Key Patterns

- **Immutable state updates**: Arrays/sets are replaced with new copies (`[...arr]`, `new Set(s)`), never mutated in-place. Message list is reassigned via `messageList.value = [...messageList.value]` after fragment updates.
- **Message fragments**: Assistant messages use a `fragments[]` array interleaving `TextFragment` and `ToolSectionFragment` to handle streaming where text, tool calls, and tool results arrive in any order. When thinking precedes a tool call, the thinking content is moved into the `ToolSectionFragment.thinking` field for collapsible grouping.
- **Composables as state modules**: Each composable encapsulates related reactive state + methods, composed in `NexusAgent.vue`.
- **Typewriter animation**: Streaming text buffered in `streamingContent` and revealed via `requestAnimationFrame` with adaptive step size (`Math.max(2, Math.ceil(remaining / 80))`). DOM updates are throttled to every 4th frame for performance. When tool calls arrive mid-text, buffered content is flushed immediately via `finishTypewriter()`.
- **Session ID lifecycle**: New sessions start with `local-{timestamp}` IDs. On first message, the server returns a `session_id` SSE event; the composable replaces the local ID with the server-assigned one, enabling subsequent messages to continue the same session.
- **Three-state tool chain display**: `toolChainState` (0/1/2, persisted in localStorage) controls how tool call chains render: 0 = fully hidden, 1 = summary with expandable individual steps, 2 = expanded by default with collapsible individual steps.
- **Custom API config routing**: When `ModelOption.configId` is set, the backend routes requests through that config's base URL and API key. Otherwise, the system default provider is used.

### SSE Event Flow (chat-stream.ts)

The `streamChat()` function POSTs to `/chat/stream` and receives SSE events with dual-mode dispatch:

1. **JSON type discriminator** (backend always sends `event:message` with `data.type`):
   - `THINK` → `data.thinking` → `onThinking()` — deep thinking content
   - `CONTENT` → `data.content` → `onTextDelta()` — streaming text
   - `TOOL_EXECUTION` → `data.toolRequestList[]` → `onToolCall()` — tool invocations
   - `TOOL_EXECUTION_RESULT` → `data.toolResultVO` → `onToolResult()` — tool execution results
   - `session_id` → `data.sessionId` → `onSessionId()` — assigns server session ID

2. **Event-name fallback** (for non-message events):
   - `text_delta`, `thinking`, `tool_call`, `tool_result`, `session_id`, `done`, `error`, `finish`

ChatDTO includes `enableRag` (RAG toggle) and `model.isThinking` (deep thinking toggle).

### Styling

- **Tailwind CSS v4** with `@import "tailwindcss"` and custom `@theme` tokens for font families (Inter sans-serif / JetBrains Mono monospace).
- Markdown content styled via `.markdown-body` CSS class in `NexusAgent.vue` `<style>`.
- Drawer/modal transitions using Vue `<Transition>`.
- `marked` renderer is configured in TWO places: `NexusAgent.vue` (imported from `marked` directly) and `src/utils/markdown.ts`. Both configure the same code highlighting logic — the one in `NexusAgent.vue` is the primary and runs first due to module import order.

### Dependencies

- Vue 3.5+, TypeScript 6.0+, Vite 8+
- Tailwind CSS v4, `@tailwindcss/vite` plugin
- `marked` (markdown parsing), `highlight.js` (syntax highlighting)
- No state management library, no test framework, no router

### Backend API Notes

- Base URL: `http://100.106.145.17:8080`
- Auth: Bearer token stored in `localStorage.getItem('token')`, settable via `window.__setToken('jwt')` in dev console.
- Chat endpoint: `POST /chat/stream` returns SSE.
- WebSocket: `ws://100.106.145.17:8080/ws/1` pushes `{ type: "title", data: "..." }` events.
- File upload: documents go to `POST /file?bizType=CHAT`, images to `POST /file/image`.
- Unified response envelope `ApiResult<T>`: `{ code: 0, msg: "ok", data: T, total: number | null }`. Direct JSON arrays returned for some endpoints (e.g., `/history/{sessionId}`).

### Configuration

`.claude/settings.local.json` pre-authorizes `npm install`, `npx vite`, and `node` commands.
