import { nextTick, readonly, ref } from 'vue'

export const COPY_RESET_DELAY = 150

export type CopyTextState = 'copy' | 'copied'

/**
 * Shared state of the copy buttons: `copy` (idle) -> `copied` after a click,
 * back to `copy` 150 ms after the mouse leaves. The component maps the state
 * to `tooltip.copy` / `tooltip.copied`.
 */
export function useCopyText (getText: () => string | undefined) {
  const state = ref<CopyTextState>('copy')
  let resetTimer: ReturnType<typeof setTimeout> | null = null

  async function copy (): Promise<void> {
    // Legacy threw synchronously without the clipboard API (non-secure context), so the label never switched.
    if (!navigator.clipboard?.writeText) {
      return
    }
    try {
      await navigator.clipboard.writeText(getText() ?? '')
    } catch {
      // Legacy ignores a clipboard failure (the unhandled rejection was never shown).
    }
    // Legacy switched the label in $nextTick, after the click handler.
    await nextTick()
    state.value = 'copied'
  }

  function reset (): void {
    if (resetTimer) {
      clearTimeout(resetTimer)
    }
    resetTimer = setTimeout(() => {
      state.value = 'copy'
      resetTimer = null
    }, COPY_RESET_DELAY)
  }

  function dispose (): void {
    if (resetTimer) {
      clearTimeout(resetTimer)
      resetTimer = null
    }
  }

  return { state: readonly(state), copy, reset, dispose }
}
