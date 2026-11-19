import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface AlertPayload {
  success?: boolean
  successMessage?: string
  errorMessage?: string
  html_text?: string
  /** Not in legacy: the alert stays until the user closes it (no auto close). For a notice that must not vanish from an empty screen. */
  sticky?: boolean
}

export interface AlertItem extends AlertPayload {
  id: number
}

/** An alert closes itself after this long unless the pointer is over it. */
export const ALERT_AUTO_CLOSE_MS = 5000

/**
 * Screens call `addAlert`; `AlertManager` renders the list.
 * The id is `Math.ceil(Math.random() * 1000)` as in legacy, so it is not unique (two alerts can collide).
 */
export const useAlertsStore = defineStore('alerts', () => {
  const activeAlerts = ref<AlertItem[]>([])

  function addAlert (payload: AlertPayload) {
    activeAlerts.value = activeAlerts.value.concat({ ...payload, id: Math.ceil(Math.random() * 1000) })
  }

  function removeAlert (id: number) {
    activeAlerts.value = activeAlerts.value.filter(item => item.id !== id)
  }

  return { activeAlerts, addAlert, removeAlert }
})
