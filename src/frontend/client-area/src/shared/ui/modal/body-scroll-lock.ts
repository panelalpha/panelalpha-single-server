import { onBeforeUnmount, type Ref, watch } from 'vue'

/** The components that hold the lock now. */
let locks = 0

/**
 * An open dialog puts `scrollLock` on
 * `<html>`. Legacy screens watched their open flag and dispatched it to the store. The class hides the page scrollbar
 * and the global dialog styles shift `.v-application` and `.v-app-bar` by the scrollbar width (16px), so the page behind the
 * dialog sits where V2 put it. V4 hides the scrollbar by itself (`block` scroll strategy) but knows nothing of that class. The class
 * is removed when the dialog closes or the component unmounts.
 */
export function useBodyScrollLock (open: Ref<boolean>, options: { flush?: 'pre' | 'post' } = {}): void {
  // Every user holds its own lock and the class stays while any is held: a component that is closed or unmounts (a row cell that
  // mounts while a dialog is open) must not release the lock of another one.
  let held = false

  function hold (next: boolean): void {
    if (next === held) {
      return
    }
    held = next
    locks += next ? 1 : -1
    document.documentElement.classList.toggle('scrollLock', locks > 0)
  }

  // `flush: 'post'` for a dialog that opens in the same tick as another one closes (Add -> transfer): the order of the two no longer
  // matters, the class stays while the second one is open.
  watch(open, hold, { immediate: true, flush: options.flush ?? 'pre' })

  onBeforeUnmount(() => hold(false))
}
