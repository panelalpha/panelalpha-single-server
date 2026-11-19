import type { FmDirectory, FmFile } from './file-manager.types'
import { fileKind } from './fm-file-type'

// The playlist is the selection, the next track starts on `ended`,
// and the list does not wrap around at the end. Pure, so the audio dialog only holds the state it renders.

export interface FmPlaylist {
  /** Index of the current track; 0 for an empty list. */
  readonly index: number
  /** The current track, or null for an empty list. */
  readonly current: FmFile | null
  readonly hasNext: boolean
  /** Moves to the next track (on `ended`) and returns it; at the end it returns null and the index stays. */
  next: () => FmFile | null
  /** Jumps to a track picked in the list and returns it; an index outside the list returns null and changes nothing. */
  select: (index: number) => FmFile | null
}

/** The audio files of a selection, in the order of the selection (folders and other files are left out). */
export function audioItems (items: readonly (FmDirectory | FmFile)[]): FmFile[] {
  return items.filter((item): item is FmFile => item.type === 'file' && fileKind(item) === 'audio')
}

export function createPlaylist (items: readonly FmFile[]): FmPlaylist {
  const list = [...items]
  let index = 0

  return {
    get index () {
      return index
    },
    get current () {
      return list[index] ?? null
    },
    get hasNext () {
      return index + 1 < list.length
    },
    next () {
      if (index + 1 >= list.length) {
        return null
      }
      index += 1
      return list[index] ?? null
    },
    select (target: number) {
      if (!Number.isInteger(target) || target < 0 || target >= list.length) {
        return null
      }
      index = target
      return list[index] ?? null
    },
  }
}
