// Pure part of the kit `DropZone`: the row shape and the state of the zone.

/** One row of a filled zone: a picked file or a dropped folder of the consumer. */
export interface DropZoneItem {
  id: string
  label: string
  // Icon alias of the row; `$filetext` when not given (onboarding passes `$folder` for a folder).
  icon?: string
}

export interface DropZoneState {
  active: boolean
  disabled: boolean
  reading: boolean
  filled: boolean
}

/** Modifier classes of `.drop-zone`, in the legacy order. `--disabled` only on an empty zone: a filled one keeps its list usable. */
export function dropZoneClasses (state: DropZoneState): Record<string, boolean> {
  return {
    'drop-zone--active': state.active,
    'drop-zone--disabled': state.disabled && !state.filled,
    'drop-zone--reading': state.reading,
    'drop-zone--filled': state.filled,
  }
}

/** Depth after a `dragleave`: enter and leave come in pairs while the pointer crosses child nodes; never below zero. */
export function dragLeaveDepth (depth: number): number {
  return Math.max(0, depth - 1)
}

/** The files of a pick or a drop as a plain array (clearing the input empties the live `FileList`). */
export function filesOf (list: ArrayLike<File> | null | undefined): File[] {
  return Array.from(list ?? [])
}
