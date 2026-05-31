import { ref, nextTick } from 'vue'

export function useAutoScroll() {
  const messageContainerRef = ref<HTMLElement | null>(null)
  /** Whether the user has scrolled up enough to show the "back to bottom" button */
  const showScrollButton = ref(false)

  function isNearBottom(): boolean {
    const el = messageContainerRef.value
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  function scrollToBottom() {
    // Need nextTick to wait for Vue to render new content into the DOM
    nextTick(() => {
      const el = messageContainerRef.value
      if (el) {
        el.scrollTop = el.scrollHeight
      }
    })
    showScrollButton.value = false
  }

  /** Call on scroll events to track user position */
  function handleScroll() {
    const el = messageContainerRef.value
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    showScrollButton.value = distFromBottom > 200
  }

  /**
   * Must be called BEFORE the DOM is updated with new content.
   * Captures whether the user is at the bottom NOW, then scrolls
   * after Vue renders if they were.
   */
  function autoScrollIfNeeded() {
    const el = messageContainerRef.value
    if (!el) return

    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const wasNearBottom = distFromBottom < 40

    // Sync button visibility on every content flush (backup for scroll event)
    showScrollButton.value = distFromBottom > 200

    nextTick(() => {
      if (wasNearBottom) {
        scrollToBottom()
      }
    })
  }

  return { messageContainerRef, showScrollButton, scrollToBottom, autoScrollIfNeeded, handleScroll }
}
