import type { FmClipboard } from './file-manager.types'
import { fileTypeInfo } from './fm-file-type'
import { baseName } from './fm-path'

// The rows show the name of each item, with its icon and a button that removes it from the clipboard.

export interface FmClipboardRow {
  type: 'directories' | 'files'
  path: string
  name: string
  icon: string
}

/** The directory rows and the file rows, with the icons of the file kinds. */
export function clipboardRows (clipboard: FmClipboard | null): FmClipboardRow[] {
  if (clipboard === null) {
    return []
  }
  const directories = clipboard.directories.map((path): FmClipboardRow => ({
    type: 'directories',
    path,
    name: baseName(path),
    icon: fileTypeInfo({ type: 'dir' }).icon,
  }))
  const files = clipboard.files.map((path): FmClipboardRow => {
    const name = baseName(path)
    const extension = name.includes('.') ? (name.split('.').at(-1) ?? '') : ''
    return { type: 'files', path, name, icon: fileTypeInfo({ type: 'file', extension }).icon }
  })
  return [...directories, ...files]
}

/** The icon and the label key of the clipboard type (shown as the title of the icon). */
export function clipboardTypeInfo (type: FmClipboard['type']): { icon: string, label: string } {
  return type === 'copy'
    ? { icon: '$copy', label: 'button.copy' }
    : { icon: '$cut', label: 'button.fileManager.cut' }
}
