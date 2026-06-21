import { ref, nextTick, onMounted, onUnmounted } from 'vue'

const SCROLL_THRESHOLD = 100 // px from bottom — within this range = "at bottom"

export function useAutoScroll() {
  const messageContainerRef = ref<HTMLElement | null>(null)
  const showScrollButton = ref(false)

  // ── Scroll helpers ─────────────────────────────────────────────────

  function scrollToBottom() {
    nextTick(() => {
      const el = messageContainerRef.value
      if (el) {
        el.scrollTop = el.scrollHeight
      }
    })
    showScrollButton.value = false
  }

  /** Call on scroll events to track user position and show/hide the "back to bottom" button */
  function handleScroll() {
    const el = messageContainerRef.value
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    showScrollButton.value = distFromBottom > 200
  }

  /** Check if the user is currently near the bottom of the scroll container */
  function isNearBottom(threshold = SCROLL_THRESHOLD): boolean {
    const el = messageContainerRef.value
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }

  // ── Dual-check anchor scroll (rAF-batched) ─────────────────────────

  let _scrollRaf: number | null = null

  /**
   * Smart auto-scroll with double-check:
   * 1. Check isNearBottom BEFORE scheduling
   * 2. Schedule a rAF to perform the scroll after the browser layout
   * 3. On the rAF tick, check isNearBottom AGAIN (handles edge case
   *    where the user scrolled away between check and rAF)
   * 4. After scroll, schedule ONE MORE rAF to re-check — catches
   *    cascading height changes (tool output + expansion in same frame)
   */
  function anchorScroll() {
    if (!isNearBottom()) return
    if (_scrollRaf) return

    _scrollRaf = requestAnimationFrame(() => {
      _scrollRaf = null
      // First pass: scroll if still anchored
      if (isNearBottom()) {
        scrollToBottom()
        // Second pass: catch cascading height changes (e.g. tool output
        // plus tool expansion in the same content update)
        _scrollRaf = requestAnimationFrame(() => {
          _scrollRaf = null
          if (isNearBottom()) {
            scrollToBottom()
          }
        })
      }
    })
  }

  // ── ResizeObserver: catch ALL DOM height changes ───────────────────

  let _resizeObserver: ResizeObserver | null = null

  onMounted(() => {
    const el = messageContainerRef.value
    if (!el) return
    _resizeObserver = new ResizeObserver(() => {
      // Any time the container's content size changes (tool expansion,
      // image load, view switching, etc.), re-anchor if user is near bottom.
      anchorScroll()
    })
    _resizeObserver.observe(el)
  })

  onUnmounted(() => {
    _resizeObserver?.disconnect()
    _resizeObserver = null
    if (_scrollRaf) {
      cancelAnimationFrame(_scrollRaf)
      _scrollRaf = null
    }
  })

  return {
    messageContainerRef,
    showScrollButton,
    scrollToBottom,
    anchorScroll,
    handleScroll,
  }
}
