import type { ResellerApiToken } from '@/views/reseller/reseller.api'
import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'

/** Columns in legacy order. `text` is the legacy header name (`table.header.<text>`); the actions column does not sort. */
export const API_TOKEN_HEADERS: LegacySortHeader[] = [
  { text: 'name', value: 'name', sortable: true },
  { text: 'last_used_at', value: 'last_used_at', sortable: true },
  { text: 'created_at', value: 'created_at', sortable: true },
  { text: 'actions', value: 'actions', sortable: false },
]

export const DEFAULT_SORT = { sortBy: 'name', sortDesc: false } as const

/** One list style, three page sizes. */
export const POSSIBLE_ITEMS_PER_PAGE: number[][] = [[10, 25, 50]]

export const DEFAULT_ITEMS_PER_PAGE = 10

/** Counts all tokens, not only the ones the search leaves. */
export function numberOfPages (total: number, itemsPerPage: number): number {
  return Math.ceil(total / itemsPerPage)
}

/** Legacy hides the footer divider for one page of the smallest size. */
export function showFooterDivider (pages: number, itemsPerPage: number): boolean {
  return !(pages === 1 && itemsPerPage === POSSIBLE_ITEMS_PER_PAGE[0]![0])
}

/**
 * Vuetify 2 `:search` (`defaultFilter` over the header columns): the phrase is trimmed, an empty phrase keeps everything, and a token
 * matches when any column value (raw ISO dates included) contains the phrase, ignoring case. `null`, `undefined` and booleans never match.
 */
export function filterTokens (tokens: readonly ResellerApiToken[], term: string): ResellerApiToken[] {
  const needle = term.trim().toLocaleLowerCase()
  if (needle === '') {
    return [...tokens]
  }
  return tokens.filter(token => API_TOKEN_HEADERS.some(header => {
    const value = (token as unknown as Record<string, unknown>)[header.value]
    if (value === null || value === undefined || typeof value === 'boolean') {
      return false
    }
    return String(value).toLocaleLowerCase().includes(needle)
  }))
}

/** The columns the search reads (the data columns of `API_TOKEN_HEADERS`). */
export const API_TOKEN_SEARCH_KEYS = API_TOKEN_HEADERS.filter(header => header.value !== 'actions').map(header => header.value)

/** One cell value against the phrase, as `filterTokens`: trimmed, case-insensitive, `null` / `undefined` / booleans never match. */
export function matchesTokenValue (value: unknown, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase()
  if (needle === '') {
    return true
  }
  if (value === null || value === undefined || typeof value === 'boolean') {
    return false
  }
  return String(value).toLocaleLowerCase().includes(needle)
}
