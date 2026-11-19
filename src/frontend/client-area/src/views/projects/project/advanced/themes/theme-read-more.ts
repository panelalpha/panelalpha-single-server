import type { InstalledTheme, RepositoryTheme } from '@/entities/project/instance-themes.api'

// The rating of a catalogue theme in the Read More dialog, five stars and
// the number out of five. The number is `Math.ceil(rating / 2) / 10` (the API rating is out of 100). The stars are filled with `Math.ceil`
// of that number, so 4.4 fills five stars (legacy behaviour, kept on purpose).

export interface ReadMoreRating {
  /** The number shown next to the stars (`{rating}/5`). */
  value: number
  /** Stars drawn full (`percent = 1`). */
  filled: number
  /** Stars drawn empty (`percent = 0`). */
  empty: number
}

/** `null` when the item has no numeric rating, as an installed theme has none. */
export function readMoreRating (item: InstalledTheme | RepositoryTheme): ReadMoreRating | null {
  if (typeof item.rating !== 'number') {
    return null
  }
  const value = Math.ceil(item.rating / 2) / 10
  const filled = Math.ceil(value)
  return { value, filled, empty: 5 - filled }
}
