import type { EnvVariable, ImportResult } from './env-vars'
// Pure builders: the view owns the modal state, the snapshot, the values and the requests (`mutate`).
import type { FieldRule } from '@/shared/ui/form/field-rule'
import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
import type {
  ModalAffixLink,
  ModalCheckboxField,
  ModalTextareaField,
  ModalTextField,
} from '@/shared/ui/modal/basic-modal.types'
import { escapeHtml } from '@/shared/format/escape-html'
import { findDuplicateKey, importVariables, isValidEnvKey } from './env-vars'

export type Translate = (key: string, options?: Record<string, unknown>) => string

export type EnvModalKind = 'add' | 'edit' | 'delete' | 'import'

/** The field types the env-vars modals use: text, textarea, checkbox. */
export type EnvModalField = ModalTextField | ModalTextareaField | ModalCheckboxField

/** The field `name` values the view reads back from the form. */
export type EnvFormValues = Record<string, unknown>

export interface EnvModal {
  kind: EnvModalKind
  title: string
  icon: string
  color?: string
  /** Trusted HTML (`v-html`): the key in it is escaped. */
  message?: string
  /** Primary action first, Cancel last. */
  buttons: ModalButton[]
  fields: EnvModalField[]
  /** Shown in Add when the server cannot restart the container. */
  affixLink?: ModalAffixLink
  /** What the form starts with (the item for Edit, the checkbox defaults for the rest). */
  initialValues: EnvFormValues
}

/** The value shown while it is hidden. */
export const ENV_VALUE_MASK = '••••••••'

/** The prefix of every copy key of this page. */
const T = 'heading.instance.advanced.envFile'

export interface EnvModalOptions {
  /** Adds the restart checkbox (`meta.supports_restart`); otherwise Add shows the File Manager link. */
  supportsRestart: boolean
  /** Path of the project File Manager (`/projects/:id/advanced/file-manager`), the target of the Add link. */
  fileManagerPath?: string
}

function cancelButton (t: Translate): ModalButton {
  return { id: 'cancel', label: t('button.cancel'), type: 'cancel', color: 'normal', customClass: 'cancel-btn' }
}

/**
 * Sent as `restart` with the PUT. On by default: a checked box makes the save apply the variables at
 * once through the Engine's env-vars apply, which is what the label promises; a plain container restart never applies them.
 */
function restartField (t: Translate): ModalCheckboxField {
  return { type: 'checkbox', label: t(`${T}.confirm.restart`), name: 'restart' }
}

/**
 * The key must be a valid env name and must not clash with another line of the
 * snapshot. An unchanged key is fine even when the file already holds it twice.
 */
export function keyRules (t: Translate, snapshot: string | null | undefined, exceptLine: number, originalKey?: string): FieldRule[] {
  return [
    value => isValidEnvKey(String(value ?? '')) || t(`${T}.validation.key`),
    value => {
      const key = String(value ?? '')
      return key === originalKey
        || !findDuplicateKey(snapshot, key, exceptLine)
        || t(`${T}.duplicateKey`, { key })
    },
  ]
}

/** Import rule: at least one line of the paste would be added, updated or counted as skipped. */
export function importRule (t: Translate, snapshot: string | null | undefined): FieldRule {
  return value => {
    const found: ImportResult = importVariables(snapshot ?? '', String(value ?? ''))
    return found.added + found.updated + found.skipped > 0 || t(`${T}.validation.importEmpty`)
  }
}

/** Key (validated against the snapshot), value, then restart or the File Manager link. */
export function addModal (t: Translate, snapshot: string | null | undefined, options: EnvModalOptions): EnvModal {
  const fields: EnvModalField[] = [
    { type: 'text', label: t(`${T}.form.key`), name: 'key', required: true, rules: keyRules(t, snapshot, -1) },
    { type: 'text', label: t(`${T}.form.value`), name: 'value' },
  ]
  const modal: EnvModal = {
    kind: 'add',
    title: t(`${T}.modal.add.title`),
    icon: '$plus',
    buttons: [{ id: 'save', label: t('button.save'), color: 'primary' }, cancelButton(t)],
    fields,
    initialValues: {},
  }

  if (options.supportsRestart) {
    fields.push(restartField(t))
    modal.initialValues.restart = true
  } else {
    modal.affixLink = { message: t(`${T}.fileManagerHint`), url: options.fileManagerPath ?? '' }
  }
  return modal
}

/** The key is validated against the snapshot without its own line; the value is the current one. */
export function editModal (t: Translate, item: Pick<EnvVariable, 'line' | 'key' | 'value'>, snapshot: string | null | undefined, options: Pick<EnvModalOptions, 'supportsRestart'>): EnvModal {
  const fields: EnvModalField[] = [
    { type: 'text', label: t(`${T}.form.key`), name: 'key', required: true, rules: keyRules(t, snapshot, item.line, item.key) },
    { type: 'text', label: t(`${T}.form.value`), name: 'value' },
  ]
  const modal: EnvModal = {
    kind: 'edit',
    title: t(`${T}.modal.edit.title`),
    icon: '$edit',
    buttons: [{ id: 'save', label: t('button.save'), color: 'primary' }, cancelButton(t)],
    fields,
    initialValues: { key: item.key, value: item.value },
  }

  if (options.supportsRestart) {
    fields.push(restartField(t))
    modal.initialValues.restart = true
  }
  return modal
}

/**
 * The required `confirm` checkbox gates the Delete button (the view passes it to `BasicModal` as
 * confirm-required). The key in the message is escaped, as legacy does before `v-html`.
 */
export function deleteModal (t: Translate, item: Pick<EnvVariable, 'key'>, options: Pick<EnvModalOptions, 'supportsRestart'>): EnvModal {
  const fields: EnvModalField[] = [
    { type: 'checkbox', label: t('message.confirmAction'), name: 'confirm', required: true },
  ]
  const modal: EnvModal = {
    kind: 'delete',
    title: t(`${T}.modal.delete.title`),
    icon: '$alertwarning',
    color: 'error',
    message: t(`${T}.modal.delete.message`, { key: escapeHtml(item.key) }),
    buttons: [{ id: 'delete', label: t('button.delete'), color: 'error' }, cancelButton(t)],
    fields,
    initialValues: {},
  }

  if (options.supportsRestart) {
    fields.push(restartField(t))
    modal.initialValues.restart = true
  }
  return modal
}

/**
 * A pasted block of `KEY=value` lines (must add, update or skip at least one line), the overwrite
 * checkbox, and restart only when the server supports it (no File Manager link here, as legacy).
 */
export function importModal (t: Translate, snapshot: string | null | undefined, options: Pick<EnvModalOptions, 'supportsRestart'>): EnvModal {
  const fields: EnvModalField[] = [
    {
      type: 'textarea',
      label: t(`${T}.form.contents`),
      name: 'contents',
      required: true,
      placeholder: 'KEY=value',
      rules: [importRule(t, snapshot)],
    },
    { type: 'checkbox', label: t(`${T}.form.overwrite`), name: 'overwrite' },
  ]
  const modal: EnvModal = {
    kind: 'import',
    title: t(`${T}.modal.import.title`),
    icon: '$download',
    buttons: [{ id: 'import', label: t(`${T}.import`), color: 'primary' }, cancelButton(t)],
    fields,
    initialValues: { overwrite: false },
  }

  if (options.supportsRestart) {
    fields.push(restartField(t))
    modal.initialValues.restart = true
  }
  return modal
}

/** `---` for an empty value, otherwise the mask until the row is revealed with the eye. */
export function displayValue (item: Pick<EnvVariable, 'value'>, revealed: boolean): string {
  if (!item.value) {
    return '---'
  }
  return revealed ? item.value : ENV_VALUE_MASK
}
