import type { EntityPayload } from '@/shared/events/app-events'

// The Try again consumer. Registered once in the shell, so the list, the import modal and the instance page
// all reuse it. The `standard` and `advanced` branches need the onboarding form: they only raise
// `instance-retry-install-with-form`, so a Try again from the list opens the form too, not a direct PUT.

export type RetryBranch = 'import' | 'standard' | 'install' | 'error'

export interface RetryDeps {
  quickRetryImport: (id: number) => Promise<Record<string, unknown>>
  retryInstall: (id: number, installDetails: unknown) => Promise<Record<string, unknown>>
  emitItemChanged: (instance: EntityPayload) => void
  emitRetryWithForm: (instance: EntityPayload) => void
  addErrorAlert: (message: string) => void
  getErrorMessage: (error: unknown) => string
}

/** The instance as far as the retry reads it (`InstanceResource` or the raw Echo body). */
export interface RetryableInstance {
  id: number
  import_details: unknown
  install_details?: { install_method?: string } | null
}

/** Guard: one retry request at a time. */
let submitting = false

/** Runs the branch the instance asks for and returns it; an API failure is an alert and `error`. */
export async function retryInstall (instance: RetryableInstance, deps: RetryDeps): Promise<RetryBranch> {
  if (instance.import_details !== null) {
    try {
      deps.emitItemChanged(await deps.quickRetryImport(instance.id))
    } catch (error) {
      deps.addErrorAlert(deps.getErrorMessage(error))
      return 'error'
    }
    return 'import'
  }

  const params = instance.install_details
  if (params?.install_method === 'standard' || params?.install_method === 'advanced') {
    deps.emitRetryWithForm(instance as unknown as EntityPayload)
    return 'standard'
  }

  if (submitting) {
    return 'install'
  }
  submitting = true
  try {
    deps.emitItemChanged(await deps.retryInstall(instance.id, params))
  } catch (error) {
    deps.addErrorAlert(deps.getErrorMessage(error))
    return 'error'
  } finally {
    submitting = false
  }
  return 'install'
}
