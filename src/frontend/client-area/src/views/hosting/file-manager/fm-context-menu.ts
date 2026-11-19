import type { FmClipboard, FmConfig, FmDirectory, FmFile } from './file-manager.types'
import { fileKind, fileTypeInfo } from './fm-file-type'

// `select` is not in the menu of this change (it is the file callback of legacy, not used by the native File Manager).

export type FmMenuAction = 'open' | 'audioPlay' | 'videoPlay' | 'view' | 'edit' | 'download' | 'copy' | 'cut' | 'rename' | 'paste' | 'zip' | 'unzip' | 'delete' | 'properties'

export interface FmMenuItem {
  name: FmMenuAction
  /** Translation key of the label. */
  label: string
  /** Application icon alias (`$name`, `src/shared/ui/icons/aliases.ts`). */
  icon: string
  /** Shown in the danger color (delete). */
  danger?: boolean
}

export type FmMenuGroup = FmMenuItem[]

type FmEntry = FmDirectory | FmFile

const ITEMS: Readonly<Record<FmMenuAction, FmMenuItem>> = {
  open: { name: 'open', label: 'button.fileManager.open', icon: '$folderOpen' },
  audioPlay: { name: 'audioPlay', label: 'button.fileManager.play', icon: '$play' },
  videoPlay: { name: 'videoPlay', label: 'button.fileManager.play', icon: '$play' },
  view: { name: 'view', label: 'button.fileManager.view', icon: '$eye' },
  edit: { name: 'edit', label: 'button.edit', icon: '$edit' },
  download: { name: 'download', label: 'button.download', icon: '$downloadLine' },
  copy: { name: 'copy', label: 'button.copy', icon: '$copy' },
  cut: { name: 'cut', label: 'button.fileManager.cut', icon: '$cut' },
  rename: { name: 'rename', label: 'button.fileManager.rename', icon: '$edit2' },
  paste: { name: 'paste', label: 'button.fileManager.paste', icon: '$paste' },
  zip: { name: 'zip', label: 'button.fileManager.zip', icon: '$archive' },
  unzip: { name: 'unzip', label: 'button.fileManager.unzip', icon: '$archive' },
  delete: { name: 'delete', label: 'button.delete', icon: '$trashLine', danger: true },
  properties: { name: 'properties', label: 'button.fileManager.properties', icon: '$infoCircle' },
}

/** The clipboard holds at least one item. */
export function canPaste (clipboard: FmClipboard | null): boolean {
  return clipboard !== null && clipboard.directories.length + clipboard.files.length > 0
}

/**
 * The visible items of the context menu, in the legacy groups (empty groups are left out).
 * `selected` is the selection in legacy order (folders first, then files); the first item decides the single-item rules.
 * `target` is the item under the pointer, or null for the empty area, which offers only paste (legacy had no menu there).
 */
export function menuItems (
  target: FmEntry | null,
  selected: readonly FmEntry[],
  clipboard: FmClipboard | null,
  config: FmConfig | null,
): FmMenuGroup[] {
  if (target === null) {
    return canPaste(clipboard) ? [[ITEMS.paste]] : []
  }

  const multi = selected.length > 1
  const first = selected[0]
  const firstFile = first?.type === 'file' ? first : null
  const firstIsDir = first?.type === 'dir'
  const info = firstFile ? fileTypeInfo(firstFile) : null
  const zipSupported = !(config?.unsupportedActions.includes('zip') ?? false)
  // Audio play: every selected item is a file with an audio extension (the playlist). Video play: one video file.
  const audioPlay = selected.length > 0 && selected.every(entry => entry.type === 'file' && fileKind(entry) === 'audio')
  const videoPlay = !multi && info?.kind === 'video'

  const groups: Array<Array<[FmMenuAction, boolean]>> = [
    [
      ['open', !multi && firstIsDir],
      ['audioPlay', audioPlay],
      ['videoPlay', videoPlay],
      ['view', !multi && info?.previewable === true],
      ['edit', !multi && info?.text === true],
      ['download', !multi && firstFile !== null],
    ],
    [
      ['copy', true],
      ['cut', true],
      ['rename', !multi],
      ['paste', canPaste(clipboard)],
      ['zip', zipSupported],
      ['unzip', !multi && info?.archive === true],
    ],
    [['delete', true]],
    [['properties', !multi]],
  ]

  return groups
    .map(group => group.filter(([, shown]) => shown).map(([name]) => ITEMS[name]))
    .filter(group => group.length > 0)
}
