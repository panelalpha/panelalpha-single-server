import type { FmDirectory, FmFile, FmSelection } from './file-manager.types'

/** Ctrl (Windows, Linux) or Cmd (macOS) adds the item to the selection, toggling it when it is already there. */
export function isAdditiveClick (event: Pick<MouseEvent, 'ctrlKey' | 'metaKey'>): boolean {
  return event.ctrlKey || event.metaKey
}

export function isItemSelected (selection: FmSelection, item: FmDirectory | FmFile): boolean {
  return item.type === 'dir' ? selection.directories.includes(item.path) : selection.files.includes(item.path)
}
