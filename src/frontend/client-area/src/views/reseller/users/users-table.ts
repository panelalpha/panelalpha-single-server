import type { ResellerUser } from '@/views/reseller/reseller.api'
import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'

/** Columns in legacy order. `text` is the legacy header name (`table.header.<text>`); the actions header has no label. */
export function resellerUsersHeaders (): LegacySortHeader[] {
  return [
    { text: 'user', value: 'name', sortable: true },
    { text: 'email', value: 'email', sortable: true },
    { text: 'instances', value: 'instances_count', sortable: true },
    { text: 'actions', value: 'actions', sortable: false, label: '' },
  ]
}

/** The columns the search reads: V2 `:search` matched the values of the headers that carry one (`actions` has none). */
export const RESELLER_USERS_SEARCH_KEYS = ['name', 'email', 'instances_count']

export const DEFAULT_SORT = { sortBy: 'name', sortDesc: false } as const

/** Legacy shows "not set" when the API returns the email as the name. */
export function isNameNotSet (user: Pick<ResellerUser, 'name' | 'email'>): boolean {
  return user.name === user.email
}
