import { quickRetryImport, retryInstall as retryInstallRequest } from '@/entities/project/instance-actions.api'
import { type RetryableInstance, retryInstall } from '@/entities/project/retry-install'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'
import { emit, useAppEvent } from '@/shared/events/app-events'

/**
 * The shell's `instance-retry-install` consumer (always mounted): every Try again
 * source (the list, the import modal, later the instance page) raises the event and this runs the branch. Registered once in `App.vue`.
 */
export function useRetryInstall (): void {
  const alerts = useAlertsStore()

  useAppEvent('instance-retry-install', instance => {
    if (!instance) {
      return
    }
    void retryInstall(instance as unknown as RetryableInstance, {
      quickRetryImport,
      retryInstall: retryInstallRequest,
      emitItemChanged: changed => emit('instance-item-changed', changed),
      emitRetryWithForm: withForm => emit('instance-retry-install-with-form', withForm),
      addErrorAlert: message => alerts.addAlert({ success: false, errorMessage: message }),
      getErrorMessage,
    })
  })
}
