import type { Translate } from './database-modals'
import type { UserDatabase } from './databases-table'
import type { UserModal } from './user-modals'
import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
import { escapeHtml } from '@/shared/format/escape-html'
import { cancelButton } from '@/shared/ui/modal/action-modal'
import {
  ALL_PRIVILEGES,
  allCheckboxValues,
  checkboxValues,
  CUSTOM_PRESET,
  MYSQL_PRIVILEGES,
  PRIVILEGE_PRESETS,
} from './mysql-privileges'

// Privileges modals: one for all the databases of a user, one for a user on one database, and the checkbox fields.
// Plain builders, as `user-modals.ts`: the view
// owns the `BasicModal` state, the field changes and the submit.

/** The checkboxes: `ALL PRIVILEGES` first, then the 18 privileges. */
function privilegeFields (t: Translate, hidden: boolean): ModalField[] {
  return [
    { label: t('form.value.privilege.all'), name: ALL_PRIVILEGES, type: 'checkbox', hidden },
    ...MYSQL_PRIVILEGES.map(privilege => ({ label: privilege, name: privilege, type: 'checkbox' as const, hidden })),
  ]
}

/**
 * The database select starts at the user's first database (or the account's first
 * one when the user has none). The preset and the boxes follow that database. The select is required, so an account without a
 * database cannot submit (legacy crashed there).
 */
export function buildUserPrivilegesModal (
  options: { user: string, databases: UserDatabase[], accountDatabases: string[] },
  t: Translate,
): UserModal {
  const database = options.databases[0]?.name ?? options.accountDatabases[0] ?? ''
  const selected = options.databases.find(item => item.name === database)
  const preset = selected?.privileges_preset ?? 'none'
  return {
    kind: 'privileges-user',
    // Legacy hardcodes the English title, not an i18n key: lite has no such key, so a key shows raw there.
    title: `Database Privileges: <span class="text-break-long">${escapeHtml(options.user)}</span>`,
    icon: '$database',
    fields: [
      {
        label: t('form.label.database'),
        name: 'database',
        tooltip: 'tooltip.database_privileges.database',
        type: 'select',
        options: options.accountDatabases.map(name => ({ label: name, value: name })),
        required: true,
      },
      {
        label: t('form.label.privileges'),
        name: 'privileges_preset',
        tooltip: 'tooltip.database_privileges.privileges',
        type: 'select',
        options: [
          ...PRIVILEGE_PRESETS.map(item => ({ label: t(item.labelKey), value: item.value })),
          { label: t('form.option.custom'), value: CUSTOM_PRESET },
        ],
      },
      ...privilegeFields(t, preset !== CUSTOM_PRESET),
    ],
    values: { database, privileges_preset: preset, ...checkboxValues(selected?.privileges ?? []) },
    buttons: [{ id: 'submit', label: t('button.update'), color: 'primary' }, cancelButton(t)],
    confirmRequired: false,
  }
}

/**
 * Only the checkboxes. With `ALL PRIVILEGES` granted, every box starts checked (legacy
 * `checkAll(true)` on mount).
 */
export function buildDatabasePrivilegesModal (options: { database: string, privileges: string[] }, t: Translate): UserModal {
  const allGranted = options.privileges.includes(ALL_PRIVILEGES)
  return {
    kind: 'privileges-database',
    title: t('heading.hosting.databases.modal.user.editPrivilege.title', { database: escapeHtml(options.database) }),
    icon: '$edit',
    fields: privilegeFields(t, false),
    values: allGranted ? allCheckboxValues(true) : { ...checkboxValues(options.privileges), [ALL_PRIVILEGES]: false },
    buttons: [{ id: 'submit', label: t('button.update'), color: 'primary' }, cancelButton(t)],
    confirmRequired: false,
  }
}
