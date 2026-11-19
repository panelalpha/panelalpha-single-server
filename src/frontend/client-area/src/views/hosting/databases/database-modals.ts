import type { DatabaseRow } from './databases-table'
import type { FieldRule } from '@/shared/ui/form/field-rule'
import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
import { cancelButton } from '@/shared/ui/modal/action-modal'

// Add, rename and delete a database. Plain builders: the view owns the `BasicModal` state,
// the submit and the alerts, as `views/projects/instance-mass-actions.ts` does. Every modal gets a Cancel button, as in legacy.

export type Translate = (key: string, options?: Record<string, unknown>) => string

/** Longest database name the form accepts (legacy `v.length <= 64`). */
export const DATABASE_NAME_MAX_LENGTH = 64

export type DatabaseModalKind = 'add' | 'rename' | 'delete'

/** What the view needs to render one `BasicModal`. `kind` tells the view which request the submit sends. */
export interface DatabaseModal {
  kind: DatabaseModalKind
  title: string
  icon: string
  color?: string
  fields: ModalField[]
  /** The values the fields start with; a named field not listed starts at `null`. */
  values: Record<string, unknown>
  buttons: ModalButton[]
  /** The `confirm` checkbox: the submit button stays disabled until the box is ticked. */
  confirmRequired: boolean
}

/** The typed value of a text field, `''` when empty, so the rules read it as legacy `v && …` did. */
export function typed (value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Legacy `required`, `maxLength` 64 and `space` rules of a database name. */
function nameRules (t: Translate, label: string): FieldRule[] {
  return [
    value => typed(value) !== '' || t('form.validation.required', { field: label }),
    value => (typed(value) !== '' && typed(value).length <= DATABASE_NAME_MAX_LENGTH)
      || t('form.validation.maxLength', { field: label, length: DATABASE_NAME_MAX_LENGTH }),
    value => (typed(value) !== '' && !typed(value).includes(' ')) || t('form.validation.space', { field: label }),
  ]
}

/** The database name without the account prefix, as legacy `item.database.split(prefix, 2)[1]`. */
export function databaseNameWithoutPrefix (database: string, prefix: string): string {
  return prefix !== '' && database.startsWith(prefix) ? database.slice(prefix.length) : database
}

export function buildAddDatabaseModal (prefix: string, t: Translate): DatabaseModal {
  const label = t('form.label.database')
  return {
    kind: 'add',
    title: t('heading.hosting.databases.modal.database.add.title'),
    icon: '$plus',
    fields: [{
      label,
      name: 'name',
      tooltip: 'tooltip.add_database.name',
      rules: nameRules(t, label),
      type: 'text',
      prefix,
    }],
    values: {},
    buttons: [{ id: 'submit', label: t('button.database.add'), color: 'primary' }, cancelButton(t)],
    confirmRequired: false,
  }
}

/** The `different` rule compares with the full database name, as legacy does. */
export function buildRenameDatabaseModal (prefix: string, item: Pick<DatabaseRow, 'database'>, t: Translate): DatabaseModal {
  const label = t('form.label.newName')
  return {
    kind: 'rename',
    title: t('heading.hosting.databases.modal.database.rename.title'),
    icon: '$edit',
    fields: [{
      label,
      name: 'name',
      tooltip: 'tooltip.rename_database.name',
      rules: [
        ...nameRules(t, label),
        value => (typed(value) !== '' && typed(value) !== item.database) || t('form.validation.different', { field: label }),
      ],
      type: 'text',
      prefix,
    }],
    values: { name: databaseNameWithoutPrefix(item.database, prefix) },
    buttons: [{ id: 'submit', label: t('button.update'), color: 'primary' }, cancelButton(t)],
    confirmRequired: false,
  }
}

/** An error-coloured dialog whose submit waits for the `confirm` checkbox. */
export function buildDeleteDatabaseModal (t: Translate): DatabaseModal {
  return {
    kind: 'delete',
    title: t('heading.hosting.databases.modal.database.delete.title'),
    icon: '$alertwarning',
    color: 'error',
    fields: [{
      message: `<b>${t('message.confirmAction')}</b>`,
      label: t('form.confirmDelete.databases.database'),
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
