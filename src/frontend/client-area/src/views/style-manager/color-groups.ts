import type { BrandColors } from '@/shared/theme/brand-theme'

/** Predefined palette groups. */
export const PREDEFINED_COLOR_GROUPS: readonly Readonly<BrandColors>[] = [
  { base: '#07C07E', lighten1: '#1FD895', lighten2: '#CDF2E5', lighten4: '#E6F9F2', darken1: '#0AAA71' },
  { base: '#44AA92', lighten1: '#345567', lighten2: '#CFF0E8', lighten4: '#E5F8F3', darken1: '#30927A' },
  { base: '#448ED6', lighten1: '#61A6E9', lighten2: '#D5E8FB', lighten4: '#EAF4FF', darken1: '#2B72B8' },
  { base: '#9D5EAD', lighten1: '#9D5EAD', lighten2: '#EDD2F4', lighten4: '#F6EAF9', darken1: '#854495' },
  { base: '#EF9840', lighten1: '#F9AB5D', lighten2: '#FDE9D5', lighten4: '#FAF1E9', darken1: '#E3903C' },
]

/**
 * A group is active when every key of the selected colors equals the key of the group.
 * The comparison ignores letter case (colors from `/home` may be lower case, the picker saves upper case).
 * An empty color set activates no group (legacy activated all of them).
 */
export function isGroupActive (selected: Partial<BrandColors>, group: Readonly<BrandColors>): boolean {
  const keys = Object.keys(selected) as (keyof BrandColors)[]
  if (keys.length === 0) {
    return false
  }
  return keys.every(key => String(selected[key] ?? '').toLowerCase() === String(group[key] ?? '').toLowerCase())
}

/**
 * Base of the active group or `''`. The kit `ColorSwatch` compares `modelValue === color` strictly and the model defaults to `''`,
 * so no active group is an empty string (no swatch is active).
 */
export function activeGroupBase (
  selected: Partial<BrandColors>,
  groups: readonly Readonly<BrandColors>[] = PREDEFINED_COLOR_GROUPS,
): string {
  return groups.find(group => isGroupActive(selected, group))?.base ?? ''
}

/**
 * Saves the picked color from the picker like V2 `color.hex` (`hexa.substr(0, 7)`, upper case): `#RRGGBB`, no alpha.
 * An unknown format is returned unchanged.
 */
export function normalizePickedHex (value: string): string {
  return /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value) ? value.slice(0, 7).toUpperCase() : value
}
