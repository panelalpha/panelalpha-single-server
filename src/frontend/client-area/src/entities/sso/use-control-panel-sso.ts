import { useTranslation } from 'i18next-vue'
import { ref } from 'vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'
import { popupBlocked } from '@/shared/browser/popup'
import { getControlPanelSsoUrl } from './control-panel-sso.api'

/**
 * Used by the hosting Summary and the developer settings of an instance.
 * Asks the backend for a single-use control panel login URL and opens it in a new tab.
 * A second call while one is running does nothing (the button shows its loader meanwhile); a failure raises an error alert. The window
 * opens after an `await`, so a browser may block it: that raises the same alert (as the phpMyAdmin composable checks it).
 */
export function useControlPanelSso () {
  const { t } = useTranslation()
  const loading = ref(false)

  async function open (accountId: number): Promise<void> {
    if (loading.value) {
      return
    }
    loading.value = true
    try {
      const url = await getControlPanelSsoUrl(accountId)
      if (popupBlocked(window.open(url))) {
        useAlertsStore().addAlert({ success: false, errorMessage: t('message.status.action.error') })
      }
    } catch (error) {
      useAlertsStore().addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      loading.value = false
    }
  }

  return { open, loading }
}
