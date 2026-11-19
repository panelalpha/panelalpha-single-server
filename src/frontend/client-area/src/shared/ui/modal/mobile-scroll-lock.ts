import { onBeforeUnmount, type Ref, watch } from 'vue'
import { useDisplay } from 'vuetify'

/** The dialogs that hold the lock now. */
let locks = 0

/**
 * Legacy V2 `VDialog.hideScroll()`: on screens under 768px (`smAndDown`) an open dialog puts `overflow-y-hidden` on `<html>`, and
 * `_dialog.scss` then shifts `.v-application` and `.v-app-bar` by 16px (`html.overflow-y-hidden`). V4 sets no such class.
 * Call it from a dialog that has to keep the shift; the class is removed when the dialog closes or unmounts.
 */
export function useMobileScrollLock (open: Ref<boolean>): void {
  const { smAndDown } = useDisplay()
  // Every dialog holds its own lock and the class stays while any is held (as `useBodyScrollLock`): a closed dialog that mounts
  // (one per project card) or unmounts must not release the lock of another, open one.
  let held = false

  function hold (next: boolean): void {
    if (next === held) {
      return
    }
    held = next
    locks += next ? 1 : -1
    document.documentElement.classList.toggle('overflow-y-hidden', locks > 0)
  }

  watch([open, smAndDown], ([isOpen, small]) => hold(isOpen && small), { immediate: true })

  onBeforeUnmount(() => hold(false))
}
