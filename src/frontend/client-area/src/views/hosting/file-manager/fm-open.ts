import type { FmDirectory, FmFile } from './file-manager.types'
import i18next from 'i18next'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'
import { downloadBlob, FmDownloadError, preview } from './file-manager.api'
import { fileTypeInfo } from './fm-file-type'
import { fmAlertPayload } from './fm-response'
import { isImageDataUri } from './fm-thumbnail-cache'

export type FmOpenAction = 'open' | 'preview' | 'pdf' | 'edit' | 'audio' | 'video' | 'none'

/**
 * What a double click does: a folder opens, an image shows the preview, a text file opens
 * in the editor, audio and video open their player, a PDF opens in a new window. The order of the checks is the legacy one.
 */
export function openActionFor (entry: FmDirectory | FmFile): FmOpenAction {
  if (entry.type === 'dir') {
    return 'open'
  }
  const info = fileTypeInfo(entry)
  if (info.previewable) {
    return 'preview'
  }
  if (info.text) {
    return 'edit'
  }
  if (info.kind === 'audio') {
    return 'audio'
  }
  if (info.kind === 'video') {
    return 'video'
  }
  return info.pdf ? 'pdf' : 'none'
}

/** How long the blob URL of a PDF stays valid in the new window; then the browser memory is released. */
const BLOB_URL_TTL_MS = 60_000

function alertFailure (message: string): void {
  useAlertsStore().addAlert({ success: false, errorMessage: message })
}

/** The image of a file as a data URI for the preview, or null when the request failed (the failure is an alert). */
export async function loadPreview (accountId: number, path: string): Promise<string | null> {
  const response = await preview(accountId, path)
  if (response.result.status === 'error') {
    const payload = fmAlertPayload(response.result, key => String(i18next.t(key)))
    alertFailure(payload?.errorMessage ?? getErrorMessage(null))
    return null
  }
  const image = response.data?.image ?? ''
  return isImageDataUri(image) ? image : null
}

/**
 * The window opens before the download, so the browser does not block it as a pop-up.
 * The PDF is shown by the browser from a blob URL (legacy wrote an iframe with `document.write`). A blocked window or a failed
 * download is an alert; the window has no `opener`, so the PDF page cannot reach this one.
 */
export async function openPdf (accountId: number, path: string): Promise<void> {
  const win = window.open()
  if (!win) {
    alertFailure(getErrorMessage(null))
    return
  }
  win.opener = null
  try {
    const blob = await downloadBlob(accountId, path)
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
    win.location.href = url
    setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_TTL_MS)
  } catch (error) {
    win.close()
    const refused = error instanceof FmDownloadError ? fmAlertPayload(error.result, key => String(i18next.t(key)))?.errorMessage : undefined
    alertFailure(refused ?? getErrorMessage(error))
  }
}
