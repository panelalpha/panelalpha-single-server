import type { GitStatus } from './git-status'
import type { GitDeployKey } from './git.api'
import type { Translate } from '@/shared/ui/modal/action-modal'
import type { Ref } from 'vue'
import { ref, watch } from 'vue'
import { getErrorMessage } from '@/shared/api/error-message'
import { deployKeyErrorMessage } from './git-deploy-key'
import { createGitDeployKey, deleteGitDeployKey, getGitDeployKey } from './git.api'

// The deploy key state and requests: the key of the connected
// repository (card "Deploy key (SSH)") and the key of the connect form (SSH address, before the first connect). The view owns the markup and
// the dialog (`useActionModal`); this composable owns the state and the requests, and reports the outcome through `alerts`.

/** The alerts the requests report to, the same two as `GitActionDeps` (the view passes the alerts store). */
export interface DeployKeyAlerts {
  addSuccessAlert: (message: string) => void
  addErrorAlert: (message: string) => void
}

export interface UseGitDeployKeyOptions {
  /** The instance the requests act on; a getter, so the id is read at call time. */
  instanceId: () => number | string
  /** The page's status: the connected repository's address (`repo_url`) is the one a rotation re-pins. */
  gitStatus: Readonly<Ref<GitStatus>>
  /** `gitStatus.connected === true`: the card is the connected one, the rotation reads the stored address. */
  connected: Readonly<Ref<boolean>>
  /** The page may read the current key (`readDeployKey`): turning it on reads the key, turning it off resets the state. */
  readKey: Readonly<Ref<boolean>>
  /** The trimmed address of the connect form, the address a not-connected key is generated for. */
  repoUrl: Readonly<Ref<string>>
  alerts: DeployKeyAlerts
  t: Translate
}

export function useGitDeployKey (options: UseGitDeployKeyOptions) {
  const { instanceId, gitStatus, connected, readKey, repoUrl, alerts, t } = options

  // The project's current key; the card shows it in any repository state.
  const connectedKey = ref<GitDeployKey | null>(null)
  const connectedKeyLoading = ref(false)
  const connectedKeyLoaded = ref(false)
  const connectedKeyError = ref(false)
  const connectedKeySubmitting = ref(false)

  // The key of the connect form with an SSH address, shown before the repository is connected.
  const sshDeployKey = ref<GitDeployKey | null>(null)
  const sshKeyLoading = ref(false)
  // The error of the connect itself, shown under the key panel; set by the connect flow.
  const sshConnectError = ref<string | null>(null)

  // A read that finished after the card was hidden or after a newer read must not write its result.
  let loadSeq = 0
  // The key requests of the card run one at a time: a rotation is DELETE then POST, a second click must not start another.
  let keyBusy = false

  function resetConnectedKey (): void {
    loadSeq++
    connectedKey.value = null
    connectedKeyLoading.value = false
    connectedKeyLoaded.value = false
    connectedKeyError.value = false
  }

  function resetSshKey (): void {
    sshDeployKey.value = null
    sshConnectError.value = null
  }

  /** A failed read shows the error state with its Retry, not a toast. */
  async function loadConnectedKey (): Promise<void> {
    const seq = ++loadSeq
    connectedKeyLoading.value = true
    connectedKeyError.value = false
    try {
      const key = await getGitDeployKey(instanceId())
      if (seq !== loadSeq) {
        return
      }
      connectedKey.value = key
      connectedKeyLoaded.value = true
    } catch {
      if (seq !== loadSeq) {
        return
      }
      connectedKey.value = null
      connectedKeyError.value = true
    } finally {
      if (seq === loadSeq) {
        connectedKeyLoading.value = false
      }
    }
  }

  /** A key for the stored address; a failure is a toast. */
  async function generateConnectedKey (): Promise<void> {
    if (connectedKeySubmitting.value) {
      return
    }
    connectedKeySubmitting.value = true
    try {
      connectedKey.value = await createGitDeployKey(instanceId(), gitStatus.value.repo_url || null)
    } catch (error) {
      alerts.addErrorAlert(deployKeyErrorMessage(error, getErrorMessage))
    } finally {
      connectedKeySubmitting.value = false
    }
  }

  /**
   * The form is validated first; the error goes to the URL field through `onFieldError`
   * (cleared before the request).
   */
  async function generateSshKey (validate: () => boolean, onFieldError: (message: string) => void): Promise<void> {
    if (sshKeyLoading.value) {
      return
    }
    if (!validate()) {
      return
    }
    sshKeyLoading.value = true
    onFieldError('')
    // The key belongs to the address it was requested for: if the field changed meanwhile, the late answer is dropped.
    const requested = repoUrl.value
    try {
      const key = await createGitDeployKey(instanceId(), requested)
      if (repoUrl.value === requested) {
        sshDeployKey.value = key
      }
    } catch (error) {
      if (repoUrl.value === requested) {
        onFieldError(deployKeyErrorMessage(error, getErrorMessage))
      }
    } finally {
      sshKeyLoading.value = false
    }
  }

  /**
   * Success clears the key and shows the success toast; a failure is an error toast. The
   * dialog closes in both cases, as legacy did, so the result is always `true` (the caller closes the dialog).
   */
  async function deleteKey (): Promise<boolean> {
    if (keyBusy) {
      return true
    }
    keyBusy = true
    try {
      await deleteGitDeployKey(instanceId())
      connectedKey.value = null
      connectedKeyLoaded.value = true
      alerts.addSuccessAlert(t('heading.onboarding.gitDeploy.auth.deployKey.deleted'))
    } catch (error) {
      alerts.addErrorAlert(getErrorMessage(error))
    } finally {
      keyBusy = false
    }
    return true
  }

  /**
   * DELETE, then POST with the address. A connected repository re-pins the stored address and
   * reads the new key into the card; a not-connected form takes it into the panel. After a failed POST the old key is gone: a connected
   * card reads the key again (no await), a not-connected form drops its key. The caller closes the dialog in both cases.
   */
  async function rotateKey (): Promise<void> {
    if (keyBusy) {
      return
    }
    keyBusy = true
    const id = instanceId()
    const isConnected = connected.value
    const address = isConnected ? gitStatus.value.repo_url : repoUrl.value
    try {
      await deleteGitDeployKey(id)
      const key = await createGitDeployKey(id, address || null)
      if (isConnected) {
        loadSeq++
        connectedKey.value = key
        connectedKeyLoaded.value = true
        connectedKeyError.value = false
        connectedKeyLoading.value = false
      } else if (repoUrl.value === address) {
        sshDeployKey.value = key
        sshConnectError.value = null
      }
    } catch (error) {
      if (isConnected) {
        void loadConnectedKey()
      } else {
        sshDeployKey.value = null
      }
      alerts.addErrorAlert(deployKeyErrorMessage(error, getErrorMessage))
    } finally {
      keyBusy = false
    }
  }

  // The key is read when the page may show it,
  // which happens with the status, not on mount. The card itself is the view's decision (`showDeployKeyCard`).
  watch(readKey, read => {
    if (read) {
      void loadConnectedKey()
    } else {
      resetConnectedKey()
    }
  }, { immediate: true })

  return {
    connectedKey,
    connectedKeyLoading,
    connectedKeyLoaded,
    connectedKeyError,
    connectedKeySubmitting,
    sshDeployKey,
    sshKeyLoading,
    sshConnectError,
    loadConnectedKey,
    resetConnectedKey,
    generateConnectedKey,
    generateSshKey,
    deleteKey,
    rotateKey,
    resetSshKey,
  }
}
