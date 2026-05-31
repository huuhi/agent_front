# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server (100.106.145.17:5173)
npm run build     # vue-tsc type-check + Vite production build
npm run preview   # Preview production build
```

Dependencies are managed via `npm install`. No test framework is currently configured.

## Architecture Overview

**NexusAgent** — a Vue 3 + TypeScript + Tailwind CSS 4 chat frontend for an AI Agent platform (Java backend at `http://100.106.145.17:8080`).

### Entry Flow

```
index.html → src/main.ts → src/App.vue → src/NexusAgent.vue (single-page app, no router)
```

### Component Tree

| Component | Role |
|-----------|------|
| `NexusAgent.vue` | Orchestrator: wires composables → child components, owns global state (selected model, RAG toggle, expand/collapse sets) |
| `Sidebar.vue` | Session list, new-chat button, MCP/API config entry points |
| `MessageBubble.vue` | Renders a single message: user (right-aligned) or assistant (left-aligned with icon). Handles markdown, thinking blocks, tool calls, file attachments |
| `ChatInput.vue` | Textarea, file upload trigger, model/knowledge-base selector dropdowns, RAG toggle, send/stop buttons |
| `MCPDrawer.vue` | Slide-out drawer listing MCP servers (name, status, URL) |
| `APIConfigModal.vue` | Modal showing current token/endpoint status |

### Composables (data/logic layer)

| Composable | Responsibility |
|------------|---------------|
| `useChat` | Message sending/receiving, SSE streaming, file upload, typewriter animation, streaming state management |
| `useSessions` | Session list CRUD, message loading from history, knowledge-base/MCP list fetching |
| `useAutoScroll` | Scroll-to-bottom on new content, auto-scroll only when user is near bottom |
| `useTitleWebSocket` | WebSocket client for live session title updates, auto-reconnect with 3s delay |

### API Layer (`src/api/`)

- **`types.ts`** — Backend API response shapes: `SessionVO`, `MessageVO`, `KnowledgeVO`, `MCPServerVO`, `ApiResult<T>`, `ChatDTO` etc.
- **`index.ts`** — REST client wrapping `fetch()` with Bearer token auth. Exports functions: `fetchSessionList`, `fetchMessages`, `deleteSession`, `fetchKnowledgeList`, `fetchMCPServerList`, `fetchModelList`, `uploadFile`, `uploadImage`.
- **`chat-stream.ts`** — SSE streaming chat client. Core: `createSSEParser()` (low-level line-based SSE parser), `streamChat()` (HTTP POST + ReadableStream parsing), `buildChatDTO()` (constructs request payload from current message + history). Dispatches typed events: `text_delta`, `thinking`, `tool_call`, `tool_result`, `session_id`, `done`, `error`.

### Types (`src/types/chat.ts`)

Component-level types distinct from API types: `ComponentMessage` (with `role`, `fragments[]` of `TextFragment | ToolSectionFragment`), `ComponentAttachment`, `ComponentToolCall`, `ComponentThinking`, `ComponentSession`, `ModelOption`.

### Utils (`src/utils/`)

- **`helpers.ts`** — File type classification (image/document/code), JSON highlighting (highlight.js), HTTP status → Chinese error messages, file size/time formatting.
- **`markdown.ts`** — `marked` renderer configured with highlight.js syntax highlighting and code-copy buttons. `groupMessages()` transforms flat `MessageVO[]` from API into `ComponentMessage[]` with merged fragments.

### Key Patterns

- **Immutable state updates**: Arrays/sets are replaced with new copies (`[...arr]`, `new Set(s)`), never mutated in-place.
- **Message fragments**: Assistant messages use a `fragments[]` array interleaving `TextFragment` and `ToolSectionFragment` to handle streaming where text, tool calls, and tool results arrive in any order.
- **Composables as state modules**: Each composable encapsulates related reactive state + methods, composed in `NexusAgent.vue`. `useChat` receives refs from `useSessions` and `useAutoScroll` via parameters.
- **Typewriter animation**: Streaming text buffered in `typewriterQueue` and revealed 2 chars every 30ms via `setInterval`.

### Styling

- **Tailwind CSS v4** with custom `@theme` tokens for font families (Inter / JetBrains Mono).
- Markdown content styled via `.markdown-body` CSS in `NexusAgent.vue` `<style>`.
- Drawer/modal transitions using Vue `<Transition>`.

### Backend API Notes

- Base URL: `http://100.106.145.17:8080`
- Auth: Bearer token stored in `localStorage.getItem('token')`, settable via `window.__setToken('jwt')` in dev console.
- Chat endpoint: `POST /chat/stream` returns SSE events with `type` discriminator in `data.type` (THINK, CONTENT, TOOL_EXECUTION, TOOL_EXECUTION_RESULT).
- WebSocket: `ws://100.106.145.17:8080/ws/1` pushes `{ type: "title", data: "..." }` events.

### Configuration

`.claude/settings.local.json` pre-authorizes `npm install`, `npx vite`, and `node` commands.
