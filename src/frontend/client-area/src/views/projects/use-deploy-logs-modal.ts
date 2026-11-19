import type { InstanceResource } from '@/entities/project/instance-resource'
import type { DeploySource } from '@/entities/project/ui/deploy/deploy-steps'
import { ref } from 'vue'
import { cancelDeploy, downloadDeployLog, listDeployLogs } from '@/entities/project/instance-deploy-logs.api'
import { deploySourceOf } from '@/entities/project/ui/deploy/deploy-steps'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'
import { cancelFilesCreate } from '@/shared/files/files-create'

// What the lite card and table do around the
// deploy logs of a custom project: open the modal (live while the deploy runs, otherwise the latest log), download it, cancel it.

export interface UseDeployLogsModalOptions {
  t: (key: string) => string
}

export function useDeployLogsModal (options: UseDeployLogsModalOptions) {
  const alerts = useAlertsStore()

  const isOpen = ref(false)
  const instanceId = ref<number | string | null>(null)
  const live = ref(true)
  const logId = ref<number | string | null>(null)
  const noLogs = ref(false)
  /** The modal's step names follow the project's source: a files project has no repository to clone. */
  const source = ref<DeploySource | null>(null)

  function addError (message: string): void {
    alerts.addAlert({ success: false, errorMessage: message })
  }

  /** A running deploy is followed live, otherwise the most recent log is shown. */
  async function openDeployLogs (instance: Pick<InstanceResource, 'id' | 'hasInstallInProgress' | 'source'>): Promise<void> {
    instanceId.value = instance.id
    source.value = deploySourceOf(instance.source?.type)
    live.value = instance.hasInstallInProgress()
    logId.value = null
    noLogs.value = false
    isOpen.value = true
    if (live.value) {
      return
    }
    try {
      const logs = await listDeployLogs(instance.id)
      if (Array.isArray(logs) && logs.length > 0) {
        // The newest run may still be going (a redeploy or an upload is no install, so the instance does not say so): follow it,
        // as Advanced > Logs does, instead of showing a still growing log as history.
        if (logs[0]!.status === 'running') {
          live.value = true
          return
        }
        logId.value = logs[0]!.id
      } else {
        noLogs.value = true
      }
    } catch {
      noLogs.value = true
    }
  }

  function closeDeployLogs (): void {
    isOpen.value = false
  }

  /** Saves the most recent log. */
  async function downloadDeployLogs (instance: Pick<InstanceResource, 'id'>): Promise<void> {
    try {
      const logs = await listDeployLogs(instance.id)
      if (!Array.isArray(logs) || logs.length === 0) {
        addError(options.t('deployLogs.noDeploys'))
        return
      }
      await downloadDeployLog(instance.id, logs[0]!.id)
    } catch (error) {
      addError(getErrorMessage(error))
    }
  }

  /** Cancels the deploy from the card overlay. */
  async function cancelDeployOf (instance: Pick<InstanceResource, 'id'>): Promise<void> {
    // A files create whose archive this browser still uploads has no Engine deploy to cancel, so the cancel of its own
    // project stops the sequence instead (the upload and the deploy after it), and that sequence says what the project
    // waits for. A cancel naming any other project is that project's deploy, which the Engine cancels as usual.
    if (cancelFilesCreate(instance.id)) {
      return
    }
    try {
      await cancelDeploy(instance.id)
      alerts.addAlert({ success: true, successMessage: options.t('deployLogs.deployCancelled') })
    } catch (error) {
      addError(getErrorMessage(error))
    }
  }

  return { isOpen, instanceId, live, logId, noLogs, source, openDeployLogs, closeDeployLogs, downloadDeployLogs, cancelDeploy: cancelDeployOf }
}
