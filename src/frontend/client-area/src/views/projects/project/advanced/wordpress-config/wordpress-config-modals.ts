import type { Translate } from './configs-table'
import type { WordpressConfigItem } from './wordpress-config.api'
import type { FieldRule } from '@/shared/ui/form/field-rule'
import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
import type {
  ModalCheckboxField,
  ModalSelectField,
  ModalTextField,
} from '@/shared/ui/modal/basic-modal.types'
// Pure builders: the view owns the modal state, the values and the requests.
import { getErrorMessages, isApiError } from '@/shared/api/error-message'
import { rebrandResourceCopy } from '@/shared/api/resource-paths'
import { escapeHtml } from '@/shared/format/escape-html'
import { cancelButton } from '@/shared/ui/modal/action-modal'

export type WordpressConfigModalKind = 'create' | 'edit' | 'delete'

export type WordpressConfigModalField = ModalTextField | ModalSelectField | ModalCheckboxField

export interface WordpressConfigModal {
  kind: WordpressConfigModalKind
  title: string
  icon: string
  color?: string
  /** Trusted HTML (`v-html`): API values in it are escaped. */
  message?: string
  buttons: ModalButton[]
  fields: WordpressConfigModalField[]
}

function requiredRule (t: Translate, label: string): FieldRule {
  return value => !!value || t('form.validation.required', { field: label })
}

/** The Engine's `wp/config/{name}` route carries a PHP constant or variable name (without a leading `$`). */
const CONFIG_NAME_PATTERN = /^[a-z_]\w*$/i

/** The server caps the name at 255 characters (`WordPressConfigCreateRequest`), so the form does too. */
const CONFIG_NAME_MAX_LENGTH = 255

function configNameRule (t: Translate, label: string): FieldRule {
  return value => {
    const name = String(value ?? '')
    if (name.length > CONFIG_NAME_MAX_LENGTH) {
      return t('form.validation.maxLength', { field: label, length: CONFIG_NAME_MAX_LENGTH })
    }
    return CONFIG_NAME_PATTERN.test(name) || t('form.validation.phpName', { field: label })
  }
}

/** The longest value the Engine reads back from `wp-config.php`, in UTF-8 bytes; a longer one breaks the whole WordPress section. */
const CONFIG_VALUE_MAX_BYTES = 4094

/** The length the Engine counts: UTF-8 bytes, so `ą` is two of them and `€` three. */
function configValueBytes (value: string): number {
  return new TextEncoder().encode(value).length
}

function configValueRule (t: Translate, label: string): FieldRule {
  return value => configValueBytes(String(value ?? '')) <= CONFIG_VALUE_MAX_BYTES
    || t('form.validation.maxBytes', { field: label, length: CONFIG_VALUE_MAX_BYTES })
}

/**
 * The name, value and type fields of the Create and Edit modals. Only the
 * placeholders differ between the two modals, so the caller passes them. `nameIsPath` adds the identifier rule where the name
 * becomes the Engine's `wp/config/{name}` path; the Edit form's name is not that path, so it keeps the rule it had.
 */
function configFields (t: Translate, placeholders: { name: string, value: string }, nameIsPath = false): WordpressConfigModalField[] {
  const nameLabel = t('form.label.name')
  const valueLabel = t('form.label.value')
  const typeLabel = t('form.label.type')

  return [
    {
      type: 'text',
      label: nameLabel,
      name: 'name',
      placeholder: placeholders.name,
      tooltip: 'tooltip.create_config.name',
      rules: nameIsPath ? [requiredRule(t, nameLabel), configNameRule(t, nameLabel)] : [requiredRule(t, nameLabel)],
    },
    {
      type: 'text',
      label: valueLabel,
      name: 'value',
      placeholder: placeholders.value,
      tooltip: 'tooltip.create_config.value',
      rules: [requiredRule(t, valueLabel), configValueRule(t, valueLabel)],
    },
    {
      type: 'select',
      label: typeLabel,
      name: 'type',
      tooltip: 'tooltip.create_config.type',
      options: [
        { label: t('form.option.constant'), value: 'constant' },
        { label: t('form.option.variable'), value: 'variable' },
      ],
      rules: [requiredRule(t, typeLabel)],
    },
  ]
}

/** Create modal: name, value and type; the name and value placeholders are the labels. */
export function createConfigModal (t: Translate): WordpressConfigModal {
  return {
    kind: 'create',
    title: t('heading.instance.advanced.wordpressConfig.modal.create.title'),
    icon: '$edit',
    buttons: [{ id: 'create', label: t('button.create'), color: 'primary' }, cancelButton(t)],
    fields: configFields(t, {
      name: t('form.label.name'),
      value: t('form.placeholder.value'),
    }, true),
  }
}

/**
 * The same fields as Create, with the placeholders swapped (the name gets its
 * own placeholder, the value takes the label). The `secret` type is not in the options; an edited secret row shows its raw type.
 */
export function editConfigModal (t: Translate): WordpressConfigModal {
  return {
    kind: 'edit',
    title: t('heading.instance.advanced.wordpressConfig.modal.edit.title'),
    icon: '$edit',
    buttons: [{ id: 'update', label: t('button.update'), color: 'primary' }, cancelButton(t)],
    fields: configFields(t, {
      name: t('form.placeholder.name'),
      value: t('form.label.value'),
    }),
  }
}

/**
 * Error icon, the config name in the message and a required `confirm`
 * checkbox that gates the Delete button (`confirm-required` in the view). The name goes into `v-html`, so it is escaped.
 */
export function deleteConfigModal (t: Translate, item: WordpressConfigItem): WordpressConfigModal {
  return {
    kind: 'delete',
    title: t('heading.instance.advanced.wordpressConfig.modal.delete.title'),
    icon: '$alertwarning',
    color: 'error',
    message: t('heading.instance.advanced.wordpressConfig.modal.delete.info', { name: escapeHtml(item.name ?? '') }),
    buttons: [{ id: 'delete', label: t('button.delete'), color: 'error' }, cancelButton(t)],
    fields: [
      {
        type: 'checkbox',
        name: 'confirm',
        label: t('form.confirmDelete.wordpressConfig'),
        message: `<b>${t('message.confirmAction')}</b>`,
        required: true,
      },
    ],
  }
}

/**
 * Remove by name: the recovery of the page when the list read fails, so a configuration whose row cannot be listed is still
 * removable. The DELETE route takes the name in the path and the type in its body, so the
 * dialog asks for both; the name is that path, so it takes the identifier rule the Create form puts on it.
 */
export function removeByNameConfigModal (t: Translate): WordpressConfigModal {
  const nameLabel = t('form.label.name')
  const typeLabel = t('form.label.type')

  return {
    kind: 'delete',
    title: t('heading.instance.advanced.wordpressConfig.modal.remove.title'),
    icon: '$alertwarning',
    color: 'error',
    buttons: [{ id: 'remove', label: t('button.delete'), color: 'error' }, cancelButton(t)],
    fields: [
      {
        type: 'text',
        label: nameLabel,
        name: 'name',
        placeholder: t('form.placeholder.name'),
        tooltip: 'tooltip.create_config.name',
        rules: [requiredRule(t, nameLabel), configNameRule(t, nameLabel)],
      },
      {
        type: 'select',
        label: typeLabel,
        name: 'type',
        tooltip: 'tooltip.create_config.type',
        options: [
          { label: t('form.option.constant'), value: 'constant' },
          { label: t('form.option.variable'), value: 'variable' },
        ],
        rules: [requiredRule(t, typeLabel)],
      },
      {
        type: 'checkbox',
        name: 'confirm',
        label: t('form.confirmDelete.wordpressConfig'),
        message: `<b>${t('message.confirmAction')}</b>`,
        required: true,
      },
    ],
  }
}

/** The `errors` bag of a 422, per field; `null` when the failure is not a refusal the dialog can show in it. */
function refusalBag (error: unknown): Record<string, string[]> | null {
  if (!isApiError(error) || error.response?.status !== 422) {
    return null
  }
  const errors = (error.response.data as { errors?: unknown } | null | undefined)?.errors
  if (!errors || typeof errors !== 'object') {
    return {}
  }
  const bag: Record<string, string[]> = {}
  for (const [name, list] of Object.entries(errors as Record<string, unknown>)) {
    bag[name] = (Array.isArray(list) ? list : [list]).map(item => rebrandResourceCopy(String(item)))
  }
  return bag
}

export interface WordpressConfigRefusal {
  /** The modal with the server's messages under the fields they name. */
  modal: WordpressConfigModal
  /** The messages that name no field of this modal, shown above the fields; `''` when every one is under a field. */
  message: string
}

/**
 * A refused create or edit (422) stays in its dialog: the server names the field it refused (`errors.value`) and that message belongs
 * under that field. A message that names a field this dialog cannot show (the type select) or a 422 without a field bag goes above the
 * fields. `null` for any other failure, which the screen reports as a whole.
 */
export function refusedConfigModal (modal: WordpressConfigModal, error: unknown): WordpressConfigRefusal | null {
  const bag = refusalBag(error)
  if (bag === null) {
    return null
  }
  const held = new Set<string>()
  const fields = modal.fields.map(field => {
    const messages = field.type === 'text' ? bag[field.name] : undefined
    if (!messages?.length) {
      return field
    }
    held.add(field.name)
    return { ...field, errorMessages: messages }
  })
  const others = Object.entries(bag).filter(([name]) => !held.has(name)).flatMap(([, messages]) => messages)
  const message = Object.keys(bag).length === 0 ? getErrorMessages(error).join(' ') : others.join(' ')
  return { modal: { ...modal, fields }, message }
}

/** The modal without a message the server held under `name`, so an edit clears it and the field's own rules report instead. */
export function withoutConfigFieldMessage (modal: WordpressConfigModal, name: string): WordpressConfigModal {
  if (!modal.fields.some(field => field.type === 'text' && field.name === name && field.errorMessages?.length)) {
    return modal
  }
  return {
    ...modal,
    fields: modal.fields.map(field => (field.type === 'text' && field.name === name ? { ...field, errorMessages: [] } : field)),
  }
}
