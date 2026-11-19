import type { MysqlDatabase, MysqlServerInfoResponse } from '@/views/hosting/hosting.types'
import type { Translate } from './database-modals'
import type { UserRow } from './databases-table'
import type { FieldRule } from '@/shared/ui/form/field-rule'
import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
import { escapeHtml } from '@/shared/format/escape-html'
import { cancelButton } from '@/shared/ui/modal/action-modal'
import { typed } from './database-modals'

// Add, edit and show access details of a user, and delete a user. Plain
// builders, as `database-modals.ts`: the view owns the `BasicModal` state, the submit and the alerts.

/** Longest user name the form accepts (legacy `v.length <= 16`). */
export const USERNAME_MAX_LENGTH = 16
/** Longest password the form accepts (legacy `v.length <= 64`). */
export const PASSWORD_MAX_LENGTH = 64

export type UserModalKind = 'add-user' | 'edit-user' | 'delete-user' | 'info-user' | 'privileges-user' | 'privileges-database'

/** What the view needs to render one user `BasicModal`. `kind` tells the view which request the submit sends. */
export interface UserModal {
  kind: UserModalKind
  title: string
  icon: string
  color?: string
  fields: ModalField[]
  /** The values the fields start with; a named field not listed starts at `null`. */
  values: Record<string, unknown>
  buttons: ModalButton[]
  /** The `confirm` checkbox: the submit button stays disabled until the box is ticked. */
  confirmRequired: boolean
  /** Trusted HTML (`v-html`) of the Access details modal; the values in it are escaped. */
  message?: string
}

/** Legacy `required`, `maxLength` 16 and `space` rules of a user name. The length message is `maxLength` (the legacy `minLength` was a mistake). */
function usernameRules (t: Translate, label: string): FieldRule[] {
  return [
    value => typed(value) !== '' || t('form.validation.required', { field: label }),
    value => (typed(value) !== '' && typed(value).length <= USERNAME_MAX_LENGTH)
      || t('form.validation.maxLength', { field: label, length: USERNAME_MAX_LENGTH }),
    value => (typed(value) !== '' && !typed(value).includes(' ')) || t('form.validation.space', { field: label }),
  ]
}

/** Legacy `required`, `maxLength` 64 and `space` rules of a new password. */
function newPasswordRules (t: Translate, label: string): FieldRule[] {
  return [
    value => typed(value) !== '' || t('form.validation.required', { field: label }),
    value => (typed(value) !== '' && typed(value).length <= PASSWORD_MAX_LENGTH)
      || t('form.validation.maxLength', { field: label, length: PASSWORD_MAX_LENGTH }),
    value => (typed(value) !== '' && !typed(value).includes(' ')) || t('form.validation.space', { field: label }),
  ]
}

/**
 * Legacy password rule of the edit modal: an untouched hidden password (`null`) passes; a revealed one must
 * meet the length and space rules.
 */
function editPasswordRules (t: Translate, label: string): FieldRule[] {
  return [
    value => {
      if (value === null) {
        return true
      }
      if (!(typed(value) !== '' && typed(value).length <= PASSWORD_MAX_LENGTH)) {
        return t('form.validation.maxLength', { field: label, length: PASSWORD_MAX_LENGTH })
      }
      if (typed(value).includes(' ')) {
        return t('form.validation.space', { field: label })
      }
      return true
    },
  ]
}

/** One option per database of the account, as legacy maps them. */
function databaseOptions (databases: MysqlDatabase[]) {
  return databases.map(database => ({ label: database.database, value: database.database }))
}

/**
 * The database select is there only when the backend requires a database for a new user
 * (`meta.require_database_to_create`, the first field of the form).
 */
export function buildAddUserModal (
  options: { prefix: string, databases: MysqlDatabase[], requireDatabase: boolean },
  t: Translate,
): UserModal {
  const usernameLabel = t('form.label.username')
  const passwordLabel = t('form.label.password')
  const fields: ModalField[] = [
    {
      label: usernameLabel,
      name: 'name',
      tooltip: 'tooltip.add_user.username',
      type: 'text',
      rules: usernameRules(t, usernameLabel),
      prefix: options.prefix,
    },
    {
      label: passwordLabel,
      name: 'password',
      tooltip: 'tooltip.add_user.password',
      rules: newPasswordRules(t, passwordLabel),
      type: 'generatePassword',
    },
  ]
  if (options.requireDatabase) {
    fields.unshift({
      label: t('form.label.database'),
      name: 'database',
      tooltip: 'tooltip.add_user.database',
      type: 'select',
      options: databaseOptions(options.databases),
    })
  }
  return {
    kind: 'add-user',
    title: t('heading.hosting.databases.modal.user.add.title'),
    icon: '$plus',
    fields,
    values: {},
    buttons: [{ id: 'submit', label: t('button.user.add'), color: 'primary' }, cancelButton(t)],
    confirmRequired: false,
  }
}

/**
 * The password starts hidden behind "Set New Password" (`hiddenPassword`, see
 * `revealPassword`). The user name field is there only when the backend supports the rename. `name` always starts as the user name
 * without the account prefix, so the submit always sends it.
 */
export function buildEditUserModal (
  options: { prefix: string, user: Pick<UserRow, 'user'>, renameSupported: boolean },
  t: Translate,
): UserModal {
  const passwordLabel = t('form.label.password')
  const usernameLabel = t('form.label.username')
  const fields: ModalField[] = [
    {
      label: passwordLabel,
      name: 'hiddenPassword',
      type: 'hiddenPassword',
      tooltip: 'tooltip.edit_user.password',
    },
    {
      label: passwordLabel,
      name: 'password',
      tooltip: 'tooltip.edit_user.password',
      type: 'generatePassword',
      rules: editPasswordRules(t, passwordLabel),
      hidden: true,
    },
  ]
  if (options.renameSupported) {
    fields.push({
      label: usernameLabel,
      name: 'name',
      tooltip: 'tooltip.edit_user.username',
      type: 'text',
      rules: [
        ...usernameRules(t, usernameLabel),
        value => (typed(value) !== '' && typed(value) !== options.user.user) || t('form.validation.different', { field: usernameLabel }),
      ],
      prefix: options.prefix,
    })
  }
  return {
    kind: 'edit-user',
    title: t('heading.hosting.databases.modal.user.update.title'),
    icon: '$edit',
    fields,
    values: { name: options.user.user.slice(options.prefix.length) },
    buttons: [{ id: 'submit', label: t('button.update'), color: 'primary' }, cancelButton(t)],
    confirmRequired: false,
  }
}

/**
 * The "Set New Password" button of the edit modal: the hidden placeholder goes, the
 * generate field comes. Mutates the fields of the open modal, which the view keeps reactive.
 */
export function revealPassword (fields: ModalField[]): void {
  for (const field of fields) {
    if ('name' in field && field.name === 'hiddenPassword') {
      field.hidden = true
    }
    if ('name' in field && field.name === 'password') {
      field.hidden = false
    }
  }
}

/**
 * A `<ul>` of the user, host and port. The labels are translated, the
 * values come from the API and are escaped.
 */
export function buildUserInfoModal (
  user: Pick<UserRow, 'user'>,
  info: MysqlServerInfoResponse['data'],
  t: Translate,
): UserModal {
  const items = Object.entries({ user: user.user, host: info.host, port: info.port })
    .map(([key, value]) => `<li><strong class="d-inline-block">${t(`heading.hosting.databases.modal.user.show.${key}`)}:</strong> <span class="d-inline-block">${escapeHtml(String(value))}</span></li>`)
    .join('')
  return {
    kind: 'info-user',
    title: t('heading.hosting.databases.modal.user.show.title'),
    icon: '$help',
    fields: [],
    values: {},
    buttons: [cancelButton(t)],
    confirmRequired: false,
    message: `<ul>${items}</ul>`,
  }
}

/** An error-coloured dialog whose submit waits for the `confirm` checkbox. */
export function buildDeleteUserModal (t: Translate): UserModal {
  return {
    kind: 'delete-user',
    title: t('heading.hosting.databases.modal.user.delete.title'),
    icon: '$alertwarning',
    color: 'error',
    fields: [{
      message: `<b>${t('message.confirmAction')}</b>`,
      label: t('form.confirmDelete.databases.user'),
      name: 'confirm',
      rules: [value => Boolean(value) || t('form.validation.confirm')],
      type: 'checkbox',
      required: true,
    }],
    values: {},
    buttons: [{ id: 'submit', label: t('button.delete'), color: 'error' }, cancelButton(t)],
    confirmRequired: true,
  }
}
