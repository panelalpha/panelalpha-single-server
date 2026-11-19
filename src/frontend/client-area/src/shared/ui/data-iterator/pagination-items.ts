// The page list of the pagination, the same as Vuetify 2 `VPagination` `items` (vuetify@2 `src/components/VPagination/VPagination.ts`):
// `1 2 3 4 … 45 46 47 48` at the ends and `1 … 4 5 6 7 8 … 48` in the middle. Vuetify 4 builds another window (`1 … 8 … 48`) and has no prop for
// the list, so the kit renders its own. A pure function: no DOM, no Vue.

export type PaginationItem = number | '...'

export interface PaginationItemsOptions {
  // Number of pages.
  length: number
  // Current page (V2 `value`).
  value: number
  // Upper limit of the shown items (V2 `total-visible`); 0 shows none.
  totalVisible?: number
  // Items that fit in the width of the parent, `paginationMaxButtons(width)`; 0 (not measured yet) means no limit.
  maxButtons?: number
}

// V2 `onResize`: 96px for the two arrows, 42px for one item with its margins.
export function paginationMaxButtons (parentWidth: number): number {
  return Math.floor((parentWidth - 96) / 42)
}

function range (from: number, to: number): number[] {
  const items: number[] = []
  for (let page = from > 0 ? from : 1; page <= to; page++) {
    items.push(page)
  }
  return items
}

export function paginationItems ({ length, value, totalVisible, maxButtons = 0 }: PaginationItemsOptions): PaginationItem[] {
  if (totalVisible === 0 || Number.isNaN(length) || length > Number.MAX_SAFE_INTEGER) {
    return []
  }

  const maxLength = Math.min(
    Math.max(0, totalVisible ?? Number.NaN) || length,
    Math.max(0, maxButtons) || length,
    length,
  )

  if (length <= maxLength) {
    return range(1, length)
  }

  const even = maxLength % 2 === 0 ? 1 : 0
  const left = Math.floor(maxLength / 2)
  const right = length - left + 1 + even

  if (value > left && value < right) {
    const start = value - left + 2
    const end = value + left - 2 - even
    const secondItem = start - 1 === 2 ? 2 : '...'
    const beforeLastItem = end + 1 === length - 1 ? end + 1 : '...'
    return [1, secondItem, ...range(start, end), beforeLastItem, length]
  }
  if (value === left) {
    return [...range(1, value + left - 1 - even), '...', length]
  }
  if (value === right) {
    return [1, '...', ...range(value - left + 1, length)]
  }
  return [...range(1, left), '...', ...range(right, length)]
}
