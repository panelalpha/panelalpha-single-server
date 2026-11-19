// Sorting of the File Manager, as the legacy store does it:
// folders come before files, a field click on the active field flips the direction, a new field starts ascending.
// Folders always sort by name except when sorted by date.

import type { FmDirectory, FmFile } from './file-manager.types'

export type FmSortField = 'name' | 'size' | 'type' | 'date'
export type FmSortDirection = 'up' | 'down'

export interface FmSort {
  field: FmSortField
  direction: FmSortDirection
}

export const DEFAULT_SORT: Readonly<FmSort> = { field: 'name', direction: 'up' }

export function nextSort (current: FmSort, field: FmSortField): FmSort {
  if (current.field === field) {
    return { field, direction: current.direction === 'up' ? 'down' : 'up' }
  }
  return { field, direction: 'up' }
}

/** A sorted copy; the app type-check lib has no `toSorted`, so this sorts a copy in place. */
function sortCopy<T> (items: readonly T[], compare: (a: T, b: T) => number): T[] {
  const copy = [...items]
  copy.sort(compare)
  return copy
}

export function sortEntries (
  directories: readonly FmDirectory[],
  files: readonly FmFile[],
  sort: FmSort,
): { directories: FmDirectory[], files: FmFile[] } {
  const sign = sort.direction === 'up' ? 1 : -1
  const byName = (a: { basename: string }, b: { basename: string }) => a.basename.localeCompare(b.basename)

  const sortedDirectories = sort.field === 'date'
    ? sortCopy(directories, (a, b) => (a.timestamp - b.timestamp) * sign)
    : sortCopy(directories, (a, b) => byName(a, b) * (sort.field === 'name' ? sign : 1))

  let sortedFiles: FmFile[]
  switch (sort.field) {
    case 'name': {
      sortedFiles = sortCopy(files, (a, b) => byName(a, b) * sign)
      break
    }
    case 'size': {
      sortedFiles = sortCopy(files, (a, b) => (a.size - b.size) * sign)
      break
    }
    case 'type': {
      sortedFiles = sortCopy(files, (a, b) => a.extension.localeCompare(b.extension) * sign)
      break
    }
    case 'date': {
      sortedFiles = sortCopy(files, (a, b) => (a.timestamp - b.timestamp) * sign)
      break
    }
  }

  return { directories: sortedDirectories, files: sortedFiles }
}
