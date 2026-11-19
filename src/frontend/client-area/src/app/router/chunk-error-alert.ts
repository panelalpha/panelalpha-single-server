import { i18next } from '@/app/i18n'
import { useAlertsStore } from '@/shared/alerts/alerts.store'

/**
 * The notice for a chunk error that did not end in a reload (`chunk-reload.ts`: loop guard, no network, no storage). Legacy has no
 * such handling. Without it a click on a link does nothing, and on the first navigation the view stays empty.
 *
 * The alert has no button (the alert kit has none): the text asks for a refresh. It is `sticky`, because on the first navigation
 * nothing else is on the screen when a normal alert would close after 5 s. A navigation that finishes removes it.
 *
 * The error itself is not marked as handled: the notice is a generic text, and a chunk that still fails after one reload is the
 * sign of a broken deploy, which the error reporter should keep seeing.
 */

export const CHUNK_ERROR_ALERT_KEY = 'message.alertManager.pageLoadFailed'
// Key is not in the backend translations yet (same as `setup.wizard.*`); `defaultValue` is used until it is.
export const CHUNK_ERROR_ALERT_DEFAULT = 'We could not load this page. Check your internet connection and refresh the page. If the problem stays, the application may have been updated: refreshing loads the new version.'

// The text of the notice that is on screen. `clear` matches on it, not on a fresh translation: the language can change meanwhile.
let shownMessage: string | null = null

function chunkErrorMessage (): string {
  try {
    return i18next.t(CHUNK_ERROR_ALERT_KEY, { defaultValue: CHUNK_ERROR_ALERT_DEFAULT })
  } catch {
    // A missing key goes through `parseMissingKeyHandler`, which writes to `localStorage`; with blocked storage that throws,
    // and the user still has to see the notice.
    return CHUNK_ERROR_ALERT_DEFAULT
  }
}

/** Shows the notice once: a second blocked error while it is on screen adds nothing. */
export function showChunkErrorAlert (): void {
  const store = useAlertsStore()
  const message = chunkErrorMessage()
  shownMessage = message
  if (!store.activeAlerts.some(item => item.sticky === true && item.errorMessage === message)) {
    store.addAlert({ success: false, errorMessage: message, sticky: true })
  }
}

/** Removes the notice, for example when a navigation has finished. Other alerts stay. */
export function clearChunkErrorAlert (): void {
  if (shownMessage === null) {
    return
  }
  const message = shownMessage
  shownMessage = null
  const store = useAlertsStore()
  for (const item of store.activeAlerts.filter(alert => alert.sticky === true && alert.errorMessage === message)) {
    store.removeAlert(item.id)
  }
}
