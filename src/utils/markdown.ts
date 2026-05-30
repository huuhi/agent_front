import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'
import type { MessageVO, ToolRequestVO } from '../api/types'
import type { ComponentMessage, ComponentToolCall, Fragment, TextFragment, ComponentThinking } from '../types/chat'
import { mapAttachment } from './helpers'

// ========== Markdown renderer config ==========
marked.use({
  renderer: {
    code({ text, lang }) {
      const language = lang || ''
      const validLang = language && hljs.getLanguage(language)
      const highlighted = validLang
        ? hljs.highlight(text, { language }).value
        : hljs.highlightAuto(text).value
      return `<div class="code-block-wrapper">
<pre><code class="hljs language-${language}">${highlighted}</code></pre>
<button class="code-copy-btn" title="复制代码">
<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
</button>
</div>`
    },
  },
})

export function renderMarkdown(content: string): string {
  return marked.parse(content, { async: false }) as string
}

export function setupCodeCopy() {
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.code-copy-btn')
    if (!btn) return
    const wrapper = btn.closest('.code-block-wrapper')
    const code = wrapper?.querySelector('code')?.textContent || ''
    navigator.clipboard.writeText(code).then(() => {
      btn.classList.add('copied')
      setTimeout(() => btn.classList.remove('copied'), 1500)
    })
  })
}

// ========== Message grouping ==========
export function groupMessages(raw: MessageVO[]): ComponentMessage[] {
  const result: ComponentMessage[] = []
  let seq = 0
  let fragments: Fragment[] = []
  let thinking: ComponentThinking | undefined
  let pendingReqs: ToolRequestVO[] = []
  let pendingResults: Map<string, { result: string; isError: boolean }> = new Map()

  function flushTools() {
    if (pendingReqs.length === 0) return
    const calls: ComponentToolCall[] = pendingReqs.map(req => {
      const res = pendingResults.get(req.id)
      return {
        id: req.id,
        name: req.toolName,
        status: res ? (res.isError ? 'error' : 'success') : 'running',
        input: req.arguments || '',
        output: res?.result,
      }
    })
    fragments.push({ kind: 'tools', calls })
    pendingReqs = []
    pendingResults = new Map()
  }

  function finalizeTurn() {
    flushTools()
    if (fragments.length > 0 || thinking) {
      const content = fragments
        .filter((f): f is TextFragment => f.kind === 'text')
        .map(f => f.content)
        .join('\n\n')
      result.push({
        id: `m-${seq++}`,
        role: 'assistant',
        content,
        thinking,
        fragments: fragments.length > 0 ? fragments : undefined,
        timestamp: '',
      })
    }
    fragments = []
    thinking = undefined
  }

  for (const vo of raw) {
    if (vo.type === 'USER') {
      finalizeTurn()
      result.push({
        id: `m-${seq++}`,
        role: 'user',
        content: vo.content ?? '',
        attachments: vo.attachedFiles ? vo.attachedFiles.map(mapAttachment) : undefined,
        timestamp: '',
      })
      continue
    }

    if (vo.type === 'AI') {
      flushTools()
      if (vo.content) {
        fragments.push({ kind: 'text', content: vo.content })
      }
      if (vo.thinking && !thinking) {
        thinking = { content: vo.thinking, durationMs: 0, completed: true }
      }
      if (vo.toolRequestList) {
        pendingReqs.push(...vo.toolRequestList)
      }
    }

    if (vo.type === 'TOOL_EXECUTION_RESULT' && vo.toolResultVO) {
      pendingResults.set(vo.toolResultVO.id, {
        result: vo.toolResultVO.result,
        isError: vo.toolResultVO.isError,
      })
    }
  }

  finalizeTurn()
  return result
}
