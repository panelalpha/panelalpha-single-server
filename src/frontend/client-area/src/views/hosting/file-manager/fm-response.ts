// Envelope of the File Manager API. Every response carries `result`.
// Handled failures come as HTTP 200 `{ result: { status: 'error', message } }`, validation as 422.
// Success codes (`uploaded`, `deleted`, ...) are untranslated and map to `message.fileManager.*`.
// Any other message is already translated by the backend and goes to the alert as it is.

import type { AlertPayload } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'

export type FmStatus = 'success' | 'warning' | 'error'

export interface FmResult {
  status: FmStatus
  /** Translation key (`message.fileManager.*`) for a known backend code, otherwise null. */
  messageKey: string | null
  /** Text to show when `messageKey` is null: a translated backend message or the error text. */
  message: string | null
}

/** Backend success/warning codes with a translation. */
export const FM_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  uploaded: 'message.fileManager.uploaded',
  notAllUploaded: 'message.fileManager.notAllUploaded',
  deleted: 'message.fileManager.deleted',
  copied: 'message.fileManager.copied',
  renamed: 'message.fileManager.renamed',
  dirCreated: 'message.fileManager.dirCreated',
  fileCreated: 'message.fileManager.fileCreated',
  fileUpdated: 'message.fileManager.fileUpdated',
}

function toStatus (value: unknown): FmStatus {
  // `danger` is the status of the legacy backend; it means an error.
  return value === 'success' || value === 'warning' ? value : 'error'
}

/**
 * Reads the `result` of a response body. A body without `result` (the preview endpoint answers `{ image }`) is a success.
 */
export function parseFmBody (body: unknown): FmResult {
  const raw = (body as { result?: { status?: unknown, message?: unknown } | null } | null | undefined)?.result
  if (!raw || typeof raw !== 'object') {
    return { status: 'success', messageKey: null, message: null }
  }

  const status = toStatus(raw.status)
  const code = typeof raw.message === 'string' && raw.message !== '' ? raw.message : null
  if (code === null) {
    return { status, messageKey: null, message: null }
  }

  if (Object.prototype.hasOwnProperty.call(FM_MESSAGE_KEYS, code)) {
    return { status, messageKey: FM_MESSAGE_KEYS[code] ?? null, message: null }
  }
  return { status, messageKey: null, message: code }
}

/** A failed request (network, 401, 422, 500): the text is the same as the other screens show (`getErrorMessage`). */
export function fmErrorResult (error: unknown): FmResult {
  return { status: 'error', messageKey: null, message: getErrorMessage(error) }
}

/** The text of a result: the translation of a known code, or the text of the backend. Null when the result has no text. */
export function fmResultText (result: FmResult, translate: (key: string) => string): string | null {
  if (result.messageKey !== null) {
    return translate(result.messageKey)
  }
  return result.message
}

/**
 * The alert of a result: every response with a message is a notification.
 * `warning` shows as an error alert, because the alerts have only the success and error styles.
 */
export function fmAlertPayload (result: FmResult, translate: (key: string) => string): AlertPayload | null {
  const text = fmResultText(result, translate)
  if (text === null) {
    return null
  }
  return result.status === 'success' ? { success: true, successMessage: text } : { success: false, errorMessage: text }
}
