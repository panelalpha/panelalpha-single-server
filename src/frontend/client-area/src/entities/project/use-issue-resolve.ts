import type { IssueResolvePayload } from '@/entities/project/ui/status-issues/status-issues.types'
import { useTranslation } from 'i18next-vue'
import { reactive } from 'vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'
import { uploadMaxLabel } from '@/shared/files/upload-limit'
import { useSessionStore } from '@/shared/session/session.store'
import { redeployFromArchive, uploadDeployArchive } from './instance-files.api'

type InstanceKey = number | string

export const REDEPLOY_IN_PROGRESS_KEY = 'notification.instance.files.redeploy.inProgress'
export const REDEPLOY_FAILED_KEY = 'notification.instance.files.redeploy.failed'

/** Legacy: a 409 means a redeploy is already running, anything else is a plain failure. */
export function redeployFailureKey (error: unknown): string {
  const status = (error as { response?: { status?: number } } | null)?.response?.status
  return status === 409 ? REDEPLOY_IN_PROGRESS_KEY : REDEPLOY_FAILED_KEY
}

/** The part of the `StatusIndicator` instance the host drives (`defineExpose({ markResolved })`). */
export interface IssueIndicator {
  markResolved: (code: string) => void
}

/**
 * What a host of `StatusIndicator` owes it: on `resolve` of an archive upload run upload + redeploy, mark the issue resolved on success and show the legacy errors
 * otherwise (the response message first, the copy key only when there is none); translate the key relayed by `error`; refuse a
 * second `resolve` while one runs; `submitting` is per instance.
 */
export function useIssueResolve () {
  const { t } = useTranslation()
  const alerts = useAlertsStore()
  const session = useSessionStore()
  // A plain object (not a ref) so the guard is synchronous: legacy flipped `submitting` before the first `await`, and the kit
  // shows `submitting` only after the next render.
  const running = reactive<Record<string, true>>({})

  function isSubmitting (id: InstanceKey): boolean {
    return running[String(id)] === true
  }

  async function onResolve (instanceId: InstanceKey, payload: IssueResolvePayload, indicator: IssueIndicator | null | undefined): Promise<void> {
    const solution = payload.issue.solutions.find(item => item.id === payload.solutionId)
    const file = payload.value
    if (solution?.ui !== 'upload-archive' || !(file instanceof File) || isSubmitting(instanceId)) {
      return
    }
    running[String(instanceId)] = true
    try {
      const remoteFilepath = await uploadDeployArchive(instanceId, file)
      await redeployFromArchive(instanceId, remoteFilepath)
      indicator?.markResolved(payload.issue.code)
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) || t(redeployFailureKey(error)) })
    } finally {
      delete running[String(instanceId)]
    }
  }

  /** `error(key)` of a solution widget (wrong file type, archive too large): the translated message as an error alert, a size message naming the panel's limit. */
  function onError (key: string): void {
    alerts.addAlert({ success: false, errorMessage: t(key, { size: uploadMaxLabel(session.home) }) })
  }

  return { isSubmitting, onResolve, onError }
}
