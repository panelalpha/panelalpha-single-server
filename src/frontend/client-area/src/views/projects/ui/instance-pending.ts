// Pure logic of the project card pending image (`InstancePendingOverlay.vue`).

export type InstancePendingStatus = 'in_progress' | 'error' | 'success'

/** A bar: the percent (0-100) or `'indeterminate'`. No bar: `undefined`. */
export type InstancePendingProgress = number | 'indeterminate'

/** The step row of an import under its bar: the step title and its percent. */
export interface InstancePendingStep {
  label: string
  percent: number
}

/**
 * Legacy element of the message block: `step` while a bar runs (the import in progress, `.import-pending__step`),
 * otherwise `text` (`.import-pending__text`, `.installation-pending__text`, `.deploy-pending__text`).
 */
export function pendingBodyName (status: InstancePendingStatus, progress: InstancePendingProgress | undefined): 'step' | 'text' {
  return status === 'in_progress' && progress !== undefined ? 'step' : 'text'
}

export function isIndeterminate (progress: InstancePendingProgress | undefined): boolean {
  return progress === 'indeterminate'
}

/** The bar value: the percent, 0 while indeterminate (legacy `:value="stepPercent === null ? 0 : stepPercent"`). */
export function progressValue (progress: InstancePendingProgress | undefined): number {
  return typeof progress === 'number' ? progress : 0
}
