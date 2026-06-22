import { ref, nextTick, onMounted, onUnmounted } from 'vue'

const BOTTOM_LOCK_THRESHOLD = 50 // px from bottom — below this = "locked"

export function useAutoScroll() {
  const messageContainerRef = ref<HTMLElement | null>(null)
  const showScrollButton = ref(false)
  const isLockedToBottom = ref(true)

  // ═══════════════════════════════════════════════════════════════════
  //  Programmatic scroll guard
  //
  //  A non-reactive flag that protects handleScroll from reacting to
  //  scroll events that *we* triggered via scrollTop assignment.
  //  When true, handleScroll returns immediately — it will NEVER
  //  set isLockedToBottom = false for our own programmatic scrolls.
  //
  //  Timing strategy (HTML spec processing model):
  //
  //    "update the rendering" step order:
  //      1. ResizeObserver callbacks
  //      2. Scroll event dispatch    ← our scroll event fires HERE
  //      3. rAF callbacks             ← we clear the flag HERE
  //
  //  By setting isProgrammaticScrolling = true before scrollTop
  //  assignment and deferring the reset to a rAF callback, we
  //  guarantee the guard is still active when the browser fires
  //  the scroll event — regardless of whether the browser dispatches
  //  it synchronously (same frame) or asynchronously (next frame).
  // ═══════════════════════════════════════════════════════════════════

  let isProgrammaticScrolling = false
  let _pendingFlagReset: number | null = null

  /** Schedule a single rAF-based flag reset.
   *  Deduplicated: no matter how many call sites request a reset within
   *  the same frame, only ONE rAF callback is enqueued.  This prevents
   *  nested/overlapping resets when scrollToBottom is called from within
   *  anchorScroll which is in turn called from within the ResizeObserver.
   */
  function scheduleFlagReset() {
    if (_pendingFlagReset) return
    _pendingFlagReset = requestAnimationFrame(() => {
      isProgrammaticScrolling = false
      _pendingFlagReset = null
    })
  }

  /** Cancel a pending flag reset (on unmount). */
  function cancelFlagReset() {
    if (_pendingFlagReset !== null) {
      cancelAnimationFrame(_pendingFlagReset)
      _pendingFlagReset = null
    }
  }

  // ── Scroll helpers ─────────────────────────────────────────────────

  function scrollToBottom() {
    nextTick(() => {
      const el = messageContainerRef.value
      if (!el) return
      isProgrammaticScrolling = true
      el.scrollTop = el.scrollHeight
      // ⚠️  Cannot clear here — the scroll event from our scrollTop
      //     assignment hasn't been dispatched yet.
      //     Defer to rAF, which runs AFTER scroll event dispatch in the
      //     rendering pipeline (per HTML spec processing model).
      scheduleFlagReset()
    })
  }

  // ── Handle user scroll — update lock state ─────────────────────────

  function handleScroll() {
    // ── Programmatic scroll guard ───────────────────────────────────
    // If WE caused this scroll event (via scrollTop assignment in
    // scrollToBottom, forceScroll, or ResizeObserver), ignore it
    // completely.  Only real user gestures (wheel, drag, touch) should
    // ever alter isLockedToBottom.
    if (isProgrammaticScrolling) return

    const el = messageContainerRef.value
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    showScrollButton.value = distFromBottom > 200
    isLockedToBottom.value = distFromBottom <= BOTTOM_LOCK_THRESHOLD
  }

  // ── Double-rAF anchor (for cascading content updates) ──────────────
  let _raf: number | null = null

  function anchorScroll() {
    if (!isLockedToBottom.value) return
    if (_raf) return // coalesce multiple calls in the same frame
    _raf = requestAnimationFrame(() => {
      _raf = null
      if (!isLockedToBottom.value) return
      scrollToBottom()
      // Second pass: catch cascading height changes
      _raf = requestAnimationFrame(() => {
        _raf = null
        if (!isLockedToBottom.value) return
        scrollToBottom()
      })
    })
  }

  // ── Smart force-scroll: one-shot or timed burst ─────────────────────
  //
  //  • durationMs ≤ 0 (default) → one-time nextTick scroll.
  //  • durationMs  > 0          → RAF burst that keeps pushing scrollTop
  //    to scrollHeight every frame for the given duration.  This follows
  //    CSS transitions (max-height, grid-template-rows) smoothly.
  //    The burst self-terminates early if the user scrolled away
  //    (isLockedToBottom is false).

  let _burstRaf: number | null = null

  function forceScroll(durationMs: number = 0) {
    if (!isLockedToBottom.value) return
    if (durationMs <= 0) {
      scrollToBottom()
      return
    }
    // Timed burst for animated transitions
    nextTick(() => {
      if (!isLockedToBottom.value || !messageContainerRef.value) return
      isProgrammaticScrolling = true
      const startTime = performance.now()
      const burst = () => {
        if (!isLockedToBottom.value || !messageContainerRef.value) {
          // User scrolled away — terminate burst, schedule reset
          _burstRaf = null
          scheduleFlagReset()
          return
        }
        if (performance.now() - startTime > durationMs) {
          _burstRaf = null
          scheduleFlagReset()
          return
        }
        messageContainerRef.value.scrollTop = messageContainerRef.value.scrollHeight
        _burstRaf = requestAnimationFrame(burst)
      }
      _burstRaf = requestAnimationFrame(burst)
    })
  }

  // ── Conditional ResizeObserver ─────────────────────────────────────
  //
  // Fires whenever the scroll container's content rect (scrollHeight)
  // changes — tool results arriving, panel expansions, typewriter
  // output growing, etc.
  //
  //  • Locked (─  isLockedToBottom === true):
  //      Immediately push scrollTop to the new bottom, then schedule
  //      a double-rAF cascade for any deferred / cascading changes.
  //
  //  • Unlocked (─  isLockedToBottom === false):
  //      Ignore entirely.  The user has scrolled away; we never
  //      override their viewport.

  let _resizeObserver: ResizeObserver | null = null

  onMounted(() => {
    const el = messageContainerRef.value
    if (!el) return
    // ⚠️ Observe the *first child* (the inner message wrapper that
    // actually grows/shrinks as content arrives), NOT the scroll
    // container itself whose bounding box is fixed (flex-1 fullscreen).
    const target = (el.firstElementChild as HTMLElement) || el
    _resizeObserver = new ResizeObserver(() => {
      if (isLockedToBottom.value) {
        // 1) Immediate push on the SCROLL CONTAINER — protect with guard
        isProgrammaticScrolling = true
        el.scrollTop = el.scrollHeight
        scheduleFlagReset()
      }
      // 2) Double-rAF cascade — catches any further height changes
      //    that happen within the same or next frame (tool output
      //    rendering, grid transitions, etc.).
      anchorScroll()
    })
    // Pass { box: "content-box" } so only the content box (which
    // includes padding but not scrollbar) is watched — matching the
    // area that actually expands.
    _resizeObserver.observe(target)
  })

  onUnmounted(() => {
    _resizeObserver?.disconnect()
    _resizeObserver = null
    cancelFlagReset()
    if (_raf) cancelAnimationFrame(_raf)
    if (_burstRaf) cancelAnimationFrame(_burstRaf)
  })

  return {
    messageContainerRef,
    showScrollButton,
    isLockedToBottom,
    scrollToBottom,
    anchorScroll,
    forceScroll,
    handleScroll,
  }
}
