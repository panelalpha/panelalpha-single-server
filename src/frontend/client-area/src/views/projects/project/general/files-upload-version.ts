import type { RedeployArchivePayload } from '@/views/projects/project/instance.api'
import type { InstanceResource } from '@/entities/project/instance-resource'
import type { DeployStepKey, ProjectSource } from '@/entities/project/project-source.api'
import type { DeploySteps } from '@/entities/project/ui/deploy/deploy-skip'
import { skipPayload } from '@/entities/project/ui/deploy/deploy-skip'
import { redeployFailureKey } from '@/entities/project/use-issue-resolve'
import { getErrorMessage, isApiError } from '@/shared/api/error-message'
import { formatBytes } from '@/shared/format/format-bytes'

// The state of the "upload a new version" modal (archive, staging option,
// deploy steps of the target, drop zone, upload progress) and what it derives from it. Pure functions; the modal renders the result and
// performs the calls (`uploadVersionArchive`, `redeployUploadedArchive`). The logs phase, the dialog width, the close rules and the Echo event
// guard are the ones of the git redeploy modal (`git-redeploy.ts`: `redeployDialogWidth`, `canCloseRedeploy`, `isRedeployPersistent`,
// `isRedeployTargetEvent`), the lite code is identical.

export const UPLOAD_INVALID_TYPE_KEY = 'heading.instance.siteDetails.uploadVersion.invalidType'
export const UPLOAD_TOO_LARGE_KEY = 'heading.instance.siteDetails.uploadVersion.tooLarge'
export const UPLOAD_REDEPLOY_SUCCESS_KEY = 'notification.instance.files.redeploy.success'

export type UploadPhase = 'form' | 'logs'

/** The state of the modal without the deploy-logs viewer state (viewer flags, cancel and download are the kit's). */
export interface UploadVersionForm {
  selectedFile: File | null
  deployStaging: boolean
  /** `/source` of the deploy target (the viewed project, or its newest files staging); null while loading or when it failed. */
  targetSource: ProjectSource | null
  /** Deploy categories the user unchecked (the model holds the skipped ones). */
  skippedSteps: DeployStepKey[]
  isDragOver: boolean
  dragDepth: number
  submitting: boolean
  uploadPercent: number | null
}

type InstanceForUpload = Pick<InstanceResource, 'id'>
  & Partial<Pick<InstanceResource, 'source' | 'details' | 'subInstances' | 'parentInstance'>>

/** The state the modal starts from. */
export function createUploadVersionForm (): UploadVersionForm {
  return {
    selectedFile: null,
    deployStaging: false,
    targetSource: null,
    skippedSteps: [],
    isDragOver: false,
    dragDepth: 0,
    submitting: false,
    uploadPercent: null,
  }
}

/** The raw `finished_at` of the last deploy, empty without a value; the modal formats it with the session date format (`useDateFormat`). */
export function uploadedDate (instance: Pick<InstanceForUpload, 'source'>): string {
  return instance.source?.last_deploy?.finished_at || ''
}

/** The archive size without decimals, empty for a missing, non-numeric or non-positive value. */
export function uploadedSize (instance: Pick<InstanceForUpload, 'details'>): string {
  const bytes = instance.details?.archive_size
  if (bytes == null || bytes === '') {
    return ''
  }
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) {
    return ''
  }
  return formatBytes(n, 0)
}

/** The "current version" line, empty when neither the date nor the size is known. */
export function currentLineKey (instance: InstanceForUpload): string {
  const date = uploadedDate(instance)
  const size = uploadedSize(instance)
  if (date && size) {
    return 'heading.instance.siteDetails.uploadVersion.current'
  }
  if (date) {
    return 'heading.instance.siteDetails.uploadVersion.currentDate'
  }
  if (size) {
    return 'heading.instance.siteDetails.uploadVersion.currentSize'
  }
  return ''
}

/** Only for a production project, the newest staging when it is a custom project with a files source. */
export function newestFilesStaging (instance: InstanceForUpload): InstanceResource | null {
  if (instance.parentInstance) {
    return null
  }
  const stagings = [...(instance.subInstances || [])]
  stagings.sort((a, b) => Number(b.id) - Number(a.id))
  const newest = stagings[0] || null
  if (!newest) {
    return null
  }
  return newest.type === 'custom' && newest.source?.type === 'files' ? newest : null
}

export function showUploadStagingCheckbox (instance: InstanceForUpload): boolean {
  return newestFilesStaging(instance) !== null
}

/**
 * A file is chosen, nothing is submitting, no deploy is running and the form phase is on.
 * The Engine's create deploy of a files project waits `running` for the archive this dialog uploads (`waiting_for_files`):
 * it is not a deploy in flight, and blocking on it left an unfinished project with no way to upload its files.
 */
export function canSubmitUpload (form: UploadVersionForm, instance: Pick<InstanceForUpload, 'source'>, phase: UploadPhase): boolean {
  const deploy = instance.source?.last_deploy
  const deployRunning = deploy?.status === 'running' && deploy.waiting_for_files !== true
  return Boolean(form.selectedFile) && !form.submitting && !deployRunning && phase === 'form'
}

/** A `.tar.gz` or `.zip` name, case-insensitive. */
export function isAllowedArchive (file: Pick<File, 'name'> | null | undefined): boolean {
  const name = (file?.name || '').toLowerCase()
  return name.endsWith('.tar.gz') || name.endsWith('.zip')
}

/** Result of `acceptFile`: the file was taken, or the i18n key (with its parameters) of the refusal. */
export type AcceptFileResult
  = | { accepted: true }
    | { accepted: false, errorKey: null }
    | { accepted: false, errorKey: string, errorParams?: Record<string, unknown> }

/**
 * No file is ignored, a wrong type or a file over `maxBytes` is refused and leaves the selection as it
 * was. `maxBytes` is the panel's upload limit (`home.app.upload_max_bytes`): a bigger archive never leaves the browser.
 */
export function acceptFile (form: UploadVersionForm, file: File | null | undefined, maxBytes: number): AcceptFileResult {
  if (!file) {
    return { accepted: false, errorKey: null }
  }
  if (!isAllowedArchive(file)) {
    return { accepted: false, errorKey: UPLOAD_INVALID_TYPE_KEY }
  }
  if (file.size > maxBytes) {
    return { accepted: false, errorKey: UPLOAD_TOO_LARGE_KEY, errorParams: { size: formatBytes(maxBytes, 0) } }
  }
  form.selectedFile = file
  return { accepted: true }
}

/** Only the first file of the native input counts. */
export function firstFile (files: ArrayLike<File> | null | undefined): File | null {
  return files?.[0] ?? null
}

/** Ignored while submitting. */
export function clearFile (form: UploadVersionForm): boolean {
  if (form.submitting) {
    return false
  }
  form.selectedFile = null
  return true
}

/** The native input opens unless submitting. */
export function canOpenFilePicker (form: UploadVersionForm): boolean {
  return !form.submitting
}

/** The depth counter keeps the highlight while the pointer crosses child nodes. */
export function dragEnter (form: UploadVersionForm): void {
  form.dragDepth += 1
  form.isDragOver = true
}

export function dragOver (form: UploadVersionForm): void {
  form.isDragOver = true
}

export function dragLeave (form: UploadVersionForm): void {
  form.dragDepth = Math.max(0, form.dragDepth - 1)
  if (!form.dragDepth) {
    form.isDragOver = false
  }
}

/** The highlight resets; the first dropped file is returned unless submitting. */
export function dropFile (form: UploadVersionForm, files: ArrayLike<File> | null | undefined): File | null {
  form.dragDepth = 0
  form.isDragOver = false
  if (form.submitting) {
    return null
  }
  return firstFile(files)
}

/** Id of the deploy target: the newest files staging when "deploy staging" is on, otherwise the viewed project (the steps shown are its own). */
export function uploadTargetId (instance: InstanceForUpload, deployStaging: boolean): InstanceResource['id'] {
  const staging = deployStaging ? newestFilesStaging(instance) : null
  return staging ? staging.id : instance.id
}

/** The categories unchecked for one target mean nothing for the other; the source is loaded again. */
export function changeUploadTarget (form: UploadVersionForm, deployStaging: boolean): void {
  form.deployStaging = deployStaging
  form.skippedSteps = []
  form.targetSource = null
}

/** An answer for another target than the current one is ignored. */
export function applyUploadSource (form: UploadVersionForm, instance: InstanceForUpload, targetId: InstanceResource['id'], source: ProjectSource | null): void {
  if (uploadTargetId(instance, form.deployStaging) === targetId) {
    form.targetSource = source
  }
}

/** The target's categories, only while its `/source` says it is available. */
export function uploadDeploySteps (form: UploadVersionForm): DeploySteps {
  return form.targetSource?.available === true ? (form.targetSource.deploy_steps ?? null) : null
}

/** Percent of the sent bytes, unchanged when the total is unknown. */
export function uploadPercent (event: { loaded: number, total?: number }, previous: number | null): number | null {
  return event.total ? Math.round((event.loaded * 100) / event.total) : previous
}

/** The option counts only when the checkbox is shown. */
export function effectiveDeployStaging (form: UploadVersionForm, instance: InstanceForUpload): boolean {
  return form.deployStaging && showUploadStagingCheckbox(instance)
}

/** The staging option and the skipped categories are read once, before the upload starts. */
export interface UploadSubmit {
  deployStaging: boolean
  skippedSteps: DeployStepKey[]
  steps: DeploySteps
}

export function captureUploadSubmit (form: UploadVersionForm, instance: InstanceForUpload): UploadSubmit {
  return {
    deployStaging: effectiveDeployStaging(form, instance),
    skippedSteps: [...form.skippedSteps],
    steps: uploadDeploySteps(form),
  }
}

/** The redeploy body after the upload answered `remote_filepath`; `skip` only when a skippable category is unchecked. */
export function buildArchiveRedeployPayload (submit: UploadSubmit, remoteFilepath: string): RedeployArchivePayload {
  return {
    remote_filepath: remoteFilepath,
    deploy_staging: submit.deployStaging,
    ...skipPayload(submit.steps, submit.skippedSteps),
  }
}

/**
 * The text is the API message, else the i18n key (409 in progress, otherwise
 * failed). A 413 is the panel's own body limit (`client_max_body_size`, `post_max_size`) refusing the archive before PHP
 * reads it, so the answer carries no useful text: the dialog names the limit instead.
 */
export function mapUploadError (error: unknown, maxBytes: number): { message: string, fallbackKey: string, params?: Record<string, unknown> } {
  if (isApiError(error) && error.response?.status === 413) {
    return { message: '', fallbackKey: UPLOAD_TOO_LARGE_KEY, params: { size: formatBytes(maxBytes, 0) } }
  }
  return { message: getErrorMessage(error), fallbackKey: redeployFailureKey(error) }
}

/** The form stays locked once the logs phase starts; the progress bar always goes away. */
export function finishUpload (form: UploadVersionForm, phase: UploadPhase): void {
  if (phase !== 'logs') {
    form.submitting = false
  }
  form.uploadPercent = null
}

/** The form unlocks when the deploy ends (terminal status or the redeploy-finished/failed events). */
export function unlockUpload (form: UploadVersionForm): void {
  form.submitting = false
}
