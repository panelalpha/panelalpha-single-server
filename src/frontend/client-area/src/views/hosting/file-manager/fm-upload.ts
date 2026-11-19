// Upload rules: the size limit and the disabled state of the submit button.
// The limit is the sum of one request, not a size per file (a sum equal to the limit is allowed).

import { isInvalidItemName } from './fm-path'

export interface FmUploadCandidate {
  size: number
  name?: string
}

/** The sum of the sizes of the selected files. */
export function uploadTotalSize (files: readonly FmUploadCandidate[]): number {
  return files.reduce((sum, file) => sum + file.size, 0)
}

/** The sum is larger than `uploadMaxFilesize` of the account config. */
export function isUploadLimitExceeded (files: readonly FmUploadCandidate[], limit: number): boolean {
  return limit < uploadTotalSize(files)
}

/** Picked files whose name would be stored under another one (PHP cuts a name at its last backslash). */
export function invalidUploadNames (files: readonly FmUploadCandidate[]): string[] {
  return files.flatMap(file => (file.name !== undefined && isInvalidItemName(file.name) ? [file.name] : []))
}

/** The submit button is disabled without files, while the limit is exceeded and while a name cannot be stored. */
export function canSubmitUpload (files: readonly FmUploadCandidate[], limit: number): boolean {
  return files.length > 0 && invalidUploadNames(files).length === 0 && !isUploadLimitExceeded(files, limit)
}
