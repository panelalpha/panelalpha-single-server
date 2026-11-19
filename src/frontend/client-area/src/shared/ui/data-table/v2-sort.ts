const collator = new Intl.Collator(undefined, { sensitivity: 'accent', usage: 'sort' })

/**
 * Vuetify 2 `sortItems` for one key: a null on both sides is a tie, otherwise both values become lower-case strings
 * (`null` is `''`, so it sorts first), compared as numbers when both are numeric and with a collator otherwise.
 * ISO date strings are therefore compared as text.
 */
export function compareV2SortValues (a: unknown, b: unknown): number {
  if (a === null && b === null) {
    return 0
  }
  const left = String(a || '').toLocaleLowerCase()
  const right = String(b || '').toLocaleLowerCase()
  if (left === right) {
    return 0
  }
  if (!Number.isNaN(Number(left)) && !Number.isNaN(Number(right))) {
    return Number(left) - Number(right)
  }
  return collator.compare(left, right)
}

/** A sorted copy of the items by one key, the way a V2 `v-data-table` sorts a single column. The input is not mutated. */
export function sortByV2<T> (items: readonly T[], key: string, desc: boolean): T[] {
  const read = (item: T): unknown => (item as unknown as Record<string, unknown>)[key]
  // eslint-disable-next-line unicorn/no-array-sort -- `toSorted` is not in the app tsconfig lib (es2022); the spread is already a copy
  return [...items].sort((a, b) => (desc ? compareV2SortValues(read(b), read(a)) : compareV2SortValues(read(a), read(b))))
}
