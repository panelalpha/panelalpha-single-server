import type { WordpressUser } from './wordpress-users.api'
import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
import { parseWordPressDate } from '@/shared/time/format-date'
import { fromNow } from '@/shared/time/from-now'

// Shared by the desktop table, the mobile card, the sort header and the view, so the keys live in one place.

export type Translate = (key: string, options?: Record<string, unknown>) => string

/** The row as the table shows it: the registration date text is added by the view. */
export type WordpressUserRow = WordpressUser & { user_registered_text: string }

/** Columns in legacy order. `text` is the legacy header name, `label` the translated title that `TableCustomSort` shows. */
export function wordpressUsersHeaders (t: Translate): LegacySortHeader[] {
  return [
    { text: 'id', label: t('table.header.id'), value: 'id', sortable: true },
    { text: 'login', label: t('table.header.login'), value: 'username', sortable: true },
    { text: 'displayName', label: t('table.header.displayName'), value: 'display_name', sortable: true },
    { text: 'email', label: t('table.header.email'), value: 'email', sortable: true },
    { text: 'role', label: t('table.header.role'), value: 'role', sortable: true },
    { text: 'registered', label: t('table.header.registered'), value: 'user_registered', sortable: true },
    { text: '', label: '', value: 'actions', sortable: false },
  ]
}

/** The columns the search reads (legacy `searchable: true`). `user_registered` is not searched. */
export const WORDPRESS_USERS_SEARCH_KEYS = ['id', 'username', 'display_name', 'email', 'role']

/**
 * Legacy sorts with `toString().localeCompare(...)`, so values sort as text ("10" before "2"). A `null` value (the registration date
 * can be `null`) must not throw, so it compares as an empty string.
 */
function compareAsText (a: unknown, b: unknown): number {
  return String(a ?? '').localeCompare(String(b ?? ''))
}

export const WORDPRESS_USERS_CUSTOM_KEY_SORT: Record<string, (a: unknown, b: unknown) => number> = {
  id: compareAsText,
  username: compareAsText,
  display_name: compareAsText,
  email: compareAsText,
  role: compareAsText,
  user_registered: compareAsText,
}

/**
 * Deviation: legacy `item.id === 1` never matches a string id, so the user with id 1 could be deleted.
 * Here it cannot be deleted, on either layout.
 */
export function isProtectedWordpressUser (user: Pick<WordpressUser, 'id'>): boolean {
  return String(user.id) === '1'
}

/**
 * Legacy `moment(value).fromNow()`. `user_registered` is a WordPress UTC timestamp without a zone (legacy read it as
 * local, so every row was shifted by the browser's offset); it is read as UTC here. A `null` date gives `'Invalid
 * date'`, as `moment(null).fromNow()` does.
 */
export function registeredText (value: string | null, now: Date = new Date()): string {
  if (value === null) {
    return 'Invalid date'
  }
  return fromNow(parseWordPressDate(value), now)
}
