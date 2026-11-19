import type { ShareUser, Translate } from './share-instance'
import type { DataTableHeader } from '@/shared/ui/data-table/data-table'

// Rows and columns of the access table of the share dialogs: the instance share
// dialog and the onboarding share step render one `DataTable` instead of the hand-built grid of legacy.

/** One row of the access table: the owner (no role picker, no actions) or a user with access. */
export interface ShareTableRow {
  /** Row value of the table (`item-value`): the owner and a user can share an address, so the kind is part of it. */
  key: string
  email: string
  name: string
  owner: boolean
  /** The user the role and login pickers edit in place (legacy rows wrote the role into the user); absent on the owner row. */
  user?: ShareUser
}

export interface ShareOwner {
  name?: string
  email?: string
}

/**
 * The rows of the table: the owner first (when known), then every user not marked for removal. Legacy hid a removed user with
 * `v-show` and kept counting it; the table drops it, so the person counter matches the rows.
 */
export function shareTableRows (
  owner: ShareOwner | null | undefined,
  users: ReadonlyArray<ShareUser>,
  removed: Readonly<Record<string, unknown>> = {},
): ShareTableRow[] {
  const rows: ShareTableRow[] = []
  if (owner?.email) {
    rows.push({ key: `owner:${owner.email}`, email: owner.email, name: owner.name ?? owner.email, owner: true })
  }
  for (const user of users) {
    if (removed[user.email]) {
      continue
    }
    rows.push({ key: `user:${user.email}`, email: user.email, name: user.name, owner: false, user })
  }
  return rows
}

/**
 * The columns: person (its header is the counter), role, the "Log in as" column only when a row
 * or the invite has an SSO role, and the actions. Nothing sorts (legacy had no sorting either).
 */
export function shareTableHeaders (t: Translate, rowCount: number, showSso: boolean): DataTableHeader[] {
  return [
    { text: 'person', value: 'person', label: t('general.person', { count: rowCount }), sortable: false },
    { text: 'role', value: 'role', label: t('table.header.role'), sortable: false, width: 168 },
    ...(showSso ? [{ text: 'loginAs', value: 'loginAs', label: t('form.label.loginAs'), sortable: false, width: 168 }] : []),
    { text: 'actions', value: 'actions', label: t('table.header.actions'), sortable: false, width: 72, align: 'end' as const },
  ]
}
