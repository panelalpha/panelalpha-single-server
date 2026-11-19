import { onBeforeUnmount } from 'vue'
import { ALERT_AUTO_CLOSE_MS } from '@/shared/alerts/alerts.store'

/**
 * The alert starts its close timer when it is created (`created`), `mouseover` clears it and
 * `mouseleave` starts a new full 5000 ms. The timer is also cleared on unmount (legacy let it fire a no-op remove).
 * A sticky alert (`isSticky`, not in legacy) never starts the timer.
 */
export function useAlertTimeout (close: () => void, isSticky: () => boolean = () => false) {
  let timeout: ReturnType<typeof setTimeout> | undefined

  function alertTimeout () {
    if (isSticky()) {
      return
    }
    timeout = setTimeout(close, ALERT_AUTO_CLOSE_MS)
  }

  function resetTimeout () {
    clearTimeout(timeout)
  }

  alertTimeout()
  onBeforeUnmount(resetTimeout)

  return { alertTimeout, resetTimeout }
}
