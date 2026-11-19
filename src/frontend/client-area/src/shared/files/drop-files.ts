// What a drop of files on the project list may contain. Pure module, shared by the project list drop zone (`views/projects`)
// and the onboarding that receives the files (`views/onboarding`). The error keys are the legacy ones.

import { formatBytes } from '@/shared/format/format-bytes'

export const MAX_FILE_SELECTIONS = 1

const ALLOWED_STANDALONE_EXTENSIONS = new Set(['zip', 'tar.gz'])

export const DROP_ERROR_KEYS = {
  empty: 'heading.onboarding.zipDeploy.file.empty',
  readFailed: 'heading.onboarding.zipDeploy.file.readFailed',
  maxSelections: 'heading.onboarding.zipDeploy.file.maxSelections',
  invalidType: 'heading.onboarding.zipDeploy.file.invalidType',
  tooLarge: 'heading.onboarding.zipDeploy.file.tooLarge',
} as const

export interface DropSelection {
  kind: 'file'
  label: string
  files: File[]
}

export interface DropSelectionsResult {
  selections: DropSelection[]
  errorKey: string | null
  /** Values of the message's placeholders (the size limit for `tooLarge`). */
  errorParams?: Record<string, unknown>
}

type FileLike = Pick<File, 'name'> & { webkitRelativePath?: string }

export function getFileExtension (name: string | null | undefined): string | null {
  const lower = (name || '').toLowerCase()
  if (lower.endsWith('.tar.gz')) {
    return 'tar.gz'
  }
  if (lower.endsWith('.zip')) {
    return 'zip'
  }
  return null
}

export function isAllowedStandaloneFile (file: Pick<File, 'name'>): boolean {
  const extension = getFileExtension(file.name)
  return extension !== null && ALLOWED_STANDALONE_EXTENSIONS.has(extension)
}

export function flattenSelections (selections: DropSelection[]): File[] {
  return selections.flatMap(selection => selection.files)
}

function getFileFromEntry (entry: FileSystemEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    (entry as FileSystemFileEntry).file(resolve, reject)
  })
}

/**
 * One archive (`.zip` or `.tar.gz`) only: the server takes nothing else, so a folder or a database file is refused before any
 * project exists. `maxBytes` is the panel's upload limit: a bigger archive would only meet the panel's own 413 after the upload.
 */
export function selectionsFromFileList (files: File[], existingCount: number, maxBytes = Number.POSITIVE_INFINITY): DropSelectionsResult {
  if (files.length === 0) {
    return { selections: [], errorKey: null }
  }

  if (files.some(file => file.webkitRelativePath || !isAllowedStandaloneFile(file))) {
    return { selections: [], errorKey: DROP_ERROR_KEYS.invalidType }
  }
  if (files.some(file => file.size > maxBytes)) {
    return { selections: [], errorKey: DROP_ERROR_KEYS.tooLarge, errorParams: { size: formatBytes(maxBytes, 0) } }
  }
  if (existingCount + files.length > MAX_FILE_SELECTIONS) {
    return { selections: [], errorKey: DROP_ERROR_KEYS.maxSelections }
  }
  return {
    selections: files.map(file => ({ kind: 'file' as const, label: file.name, files: [file] })),
    errorKey: null,
  }
}

export async function selectionsFromEntries (
  entries: FileSystemEntry[],
  existingCount: number,
  maxBytes?: number,
): Promise<DropSelectionsResult> {
  if (entries.some(entry => entry.isDirectory)) {
    return { selections: [], errorKey: DROP_ERROR_KEYS.invalidType }
  }
  if (existingCount + entries.length > MAX_FILE_SELECTIONS) {
    return { selections: [], errorKey: DROP_ERROR_KEYS.maxSelections }
  }

  const files: File[] = []
  for (const entry of entries.filter(item => item.isFile)) {
    files.push(await getFileFromEntry(entry))
  }
  return selectionsFromFileList(files, existingCount, maxBytes)
}

/** Entries (to tell a folder from a file) when the browser offers `webkitGetAsEntry`, otherwise the plain `files` list. */
export async function selectionsFromDataTransfer (
  dataTransfer: DataTransfer | null | undefined,
  options: { existingCount?: number, maxBytes?: number } = {},
): Promise<DropSelectionsResult> {
  const existingCount = options.existingCount ?? 0
  try {
    const items = dataTransfer?.items
    const entries: FileSystemEntry[] = []
    if (items && items.length > 0) {
      for (const item of items) {
        const entry = item?.webkitGetAsEntry?.()
        if (entry) {
          entries.push(entry)
        }
      }
    }
    if (entries.length > 0) {
      return await selectionsFromEntries(entries, existingCount, options.maxBytes)
    }
    return selectionsFromFileList(Array.from(dataTransfer?.files ?? []), existingCount, options.maxBytes)
  } catch {
    return { selections: [], errorKey: DROP_ERROR_KEYS.readFailed }
  }
}

export function dataTransferHasFiles (dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer || !dataTransfer.types) {
    return false
  }
  return Array.from(dataTransfer.types).includes('Files')
}

/**
 * The file's own type when the browser knows it, else the type
 * of its extension.
 */
export function getUploadContentType (ext: string | null, file: Pick<File, 'type'>): string {
  if (file.type) {
    return file.type
  }
  switch (ext) {
    case 'zip': {
      return 'application/zip'
    }
    case 'tar.gz': {
      return 'application/gzip'
    }
    default: {
      return 'application/octet-stream'
    }
  }
}

/** The name an upload is stored under: the path below the dropped folder for a file picked from a folder, else the file name. */
export function getUploadFilename (file: FileLike): string {
  return file.webkitRelativePath || file.name || ''
}

/** What an upload payload may carry: the drop's `uploadItems`, a `files` list or one `file`. */
export interface UploadPayload {
  uploadItems?: File[]
  files?: File[]
  file?: File | null
}

/** The first list that has files, else none. */
export function normalizePayloadFiles (payload: UploadPayload | null | undefined): File[] {
  if (payload?.uploadItems?.length) {
    return payload.uploadItems
  }
  if (payload?.files?.length) {
    return payload.files
  }
  if (payload?.file) {
    return [payload.file]
  }
  return []
}
