// The panel's upload limit in bytes: `home.app.upload_max_bytes`, i.e. config `client-area.upload_max_bytes`
// (USER_APPLICATION_UPLOAD_MAX_BYTES), the same value entrypoint.sh writes into PHP's `upload_max_filesize` and
// nginx's `client_max_body_size`. Every archive surface (Upload new version, the status-issue upload, the files
// wizard) refuses a bigger file before the browser sends it, so no dialog promises more than the panel takes.

import type { HomeResponse } from '@/shared/session/session.api'
import { formatBytes } from '@/shared/format/format-bytes'

/** entrypoint.sh's default when the panel sets no limit of its own (256 MB). */
export const DEFAULT_UPLOAD_MAX_BYTES = 268_435_456

type HomeLike = Pick<HomeResponse, 'app'> | null | undefined

/** The bytes the panel takes; an answer from before the field (or a paid panel without it) gets the default. */
export function uploadMaxBytes (home: HomeLike): number {
  const bytes = Number(home?.app?.upload_max_bytes)
  return Number.isFinite(bytes) && bytes > 0 ? bytes : DEFAULT_UPLOAD_MAX_BYTES
}

/** How the dialogs name the limit ("256 MB"), for the drop-zone hint and the refusal. */
export function uploadMaxLabel (home: HomeLike): string {
  return formatBytes(uploadMaxBytes(home), 0)
}

/** A file the panel would refuse: the dialogs check it before uploading anything. */
export function exceedsUploadLimit (file: Pick<File, 'size'>, home: HomeLike): boolean {
  return file.size > uploadMaxBytes(home)
}
