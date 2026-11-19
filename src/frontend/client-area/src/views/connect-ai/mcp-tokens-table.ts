import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
import type { McpToken } from '@/entities/mcp/mcp.api'
import { sortByV2 } from '@/shared/ui/data-table/v2-sort'

/** `token_value` and `status` do not sort. */
export const TOKEN_HEADERS: LegacySortHeader[] = [
  { text: 'name', value: 'name', sortable: true },
  { text: 'token', value: 'token_value', sortable: false },
  { text: 'last_used_at', value: 'last_used_at', sortable: true },
  { text: 'created_at', value: 'created_at', sortable: true },
  { text: 'status', value: 'status', sortable: false },
  { text: 'actions', value: 'actions', sortable: false },
]

export const DEFAULT_TOKENS_PER_PAGE = 10

/** One list style, three page sizes. */
export const POSSIBLE_ITEMS_PER_PAGE: number[][] = [[10, 25, 50]]

/** The only value the static mask shows: the list API never returns a token value, so legacy always rendered it. */
export const TOKEN_MASK = '••••••••••••••••'

/** A sorted copy of the tokens by one sortable column (`name`, `last_used_at`, `created_at`). */
export function sortTokens (tokens: McpToken[], key: string, desc: boolean): McpToken[] {
  return sortByV2(tokens, key, desc)
}

export function numberOfPages (total: number, itemsPerPage: number): number {
  return Math.ceil(total / itemsPerPage)
}

/** Legacy hides the footer, and the divider above it, for one page of the smallest size. */
export function showTokensFooter (pages: number, itemsPerPage: number): boolean {
  return !(pages === 1 && itemsPerPage === POSSIBLE_ITEMS_PER_PAGE[0]![0])
}
