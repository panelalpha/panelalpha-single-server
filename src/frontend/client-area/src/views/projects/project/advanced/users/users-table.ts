import type { InstanceAppUser } from './users.api'
import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'

// Shared by the desktop table, the mobile card and the sort header, so the keys live in one place.

export type Translate = (key: string, options?: Record<string, unknown>) => string

/** Columns in legacy order. `text` is the legacy header name, `label` the translated title that `TableCustomSort` shows. */
export function usersHeaders (t: Translate): LegacySortHeader[] {
  return [
    { text: 'id', label: t('table.header.id'), value: 'id', sortable: true },
    { text: 'login', label: t('table.header.login'), value: 'username', sortable: true },
    { text: 'email', label: t('table.header.email'), value: 'email', sortable: true },
    { text: 'role', label: t('table.header.role'), value: 'role', sortable: true },
    { text: '', label: '', value: 'actions', sortable: false },
  ]
}

/** The columns the search reads (legacy `searchable: true`). */
export const USERS_SEARCH_KEYS = ['id', 'username', 'email', 'role']

/**
 * Legacy sorts with `toString().localeCompare(...)`, so ids sort as text ("10" before "2"). Vuetify 4 compares numeric
 * strings as numbers, so the id column gets its own comparator.
 */
export const USERS_CUSTOM_KEY_SORT: Record<string, (a: unknown, b: unknown) => number> = {
  id: (a, b) => String(a ?? '').localeCompare(String(b ?? '')),
}

/**
 * Deviation: legacy `item.id === 1` never matches a string id, and it only guards the desktop
 * layout. The user with id 1 cannot be deleted on either layout.
 */
export function isProtectedUser (user: Pick<InstanceAppUser, 'id'>): boolean {
  return String(user.id) === '1'
}
