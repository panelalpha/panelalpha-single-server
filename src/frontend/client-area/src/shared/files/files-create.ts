/**
 * The files create whose archive this browser is still uploading (`views/onboarding/files-deploy.ts`).
 *
 * The upload, and the deploy that follows it, are the browser's, so while they run the Engine has no deploy of the
 * project to cancel: its create deploy waits for the files and answers "nothing running or queued" to a cancel. A
 * Cancel Deploy of that window – from the progress screen, the project's card or its Deploy Logs – therefore has to
 * stop this sequence, which checks between its steps, and abort the upload in flight.
 *
 * Only the progress screen's cancel (no project id) names the create itself before its domain step answered. A cancel
 * that names a project is the create's only while it names the project the sequence resolved; any other project's
 * cancel is that project's deploy, which the Engine cancels.
 */
interface FilesCreateState {
  /** A files sequence is running in this tab. */
  active: boolean
  /** The project the sequence's domain step created, null while it is still being created. */
  projectId: number | string | null
  /** The progress screen cancelled this tab's create, or a cancel named the create's own project. */
  cancelled: boolean
  /** Aborts the upload in flight; a new one for every sequence. */
  upload: AbortController | null
}

const idle = (): FilesCreateState => ({ active: false, projectId: null, cancelled: false, upload: null })

let state: FilesCreateState = idle()

/** A files sequence starts: nothing cancelled yet, its upload abortable until it ends. */
export function beginFilesCreate (): void {
  state = { active: true, projectId: null, cancelled: false, upload: new AbortController() }
}

/** The sequence resolved the project its domain step created, so the cancel paths can address it. */
export function setFilesCreateProject (projectId: number | string): void {
  if (state.active) {
    state.projectId = projectId
  }
}

/** The sequence is over (deployed, failed or cancelled): its project is an ordinary one again. */
export function endFilesCreate (): void {
  state = idle()
}

/** True once this tab's create is cancelled: by the progress screen, or by a cancel naming its own project. */
export function filesCreateCancelled (projectId?: number | string): boolean {
  if (!state.cancelled) {
    return false
  }
  // Another project's cancel never stops this create.
  return projectId === undefined || state.projectId === null || String(state.projectId) === String(projectId)
}

/** The signal of the archive upload, so a cancel stops it instead of only stopping what follows. */
export function filesCreateUploadSignal (): AbortSignal | undefined {
  return state.upload?.signal
}

/**
 * Marks this tab's files create cancelled; false when the cancel names something that is not the create (a deploy of a
 * project that already has its files, which the Engine cancels as usual). Without a project id the progress screen of
 * the create cancels it; with one, only the create's own project stops the sequence.
 */
export function cancelFilesCreate (projectId?: number | string): boolean {
  if (!state.active) {
    return false
  }
  if (projectId !== undefined && (state.projectId === null || String(state.projectId) !== String(projectId))) {
    return false
  }
  state.cancelled = true
  state.upload?.abort()
  return true
}
