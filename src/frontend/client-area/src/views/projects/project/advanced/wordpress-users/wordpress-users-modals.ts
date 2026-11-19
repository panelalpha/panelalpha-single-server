import type { Translate } from './wordpress-users-table'
import type { WordpressUser } from './wordpress-users.api'
import type { FieldRule } from '@/shared/ui/form/field-rule'
import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
import type {
  ModalCheckboxField,
  ModalPasswordField,
  ModalSelectField,
  ModalTextField,
} from '@/shared/ui/modal/basic-modal.types'
// Pure builders: the view owns the modal state, the values and the requests.
import { getErrorMessages, isApiError } from '@/shared/api/error-message'
import { rebrandResourceCopy } from '@/shared/api/resource-paths'
import { escapeHtml } from '@/shared/format/escape-html'
import { passwordPolicyRules } from '@/shared/ui/form/use-form-rules'
import { cancelButton } from '@/shared/ui/modal/action-modal'

export type WordpressUsersModalKind = 'create' | 'edit' | 'reset' | 'reset-done' | 'delete'

export type WordpressUsersModalField = ModalTextField | ModalPasswordField | ModalSelectField | ModalCheckboxField

export interface WordpressUsersModal {
  kind: WordpressUsersModalKind
  title: string
  icon: string
  color?: string
  /** Trusted HTML (`v-html`): API values in it are escaped. */
  message?: string
  buttons: ModalButton[]
  fields: WordpressUsersModalField[]
}

function requiredRule (t: Translate, label: string): FieldRule {
  return value => !!value || t('form.validation.required', { field: label })
}

function maxLengthRule (t: Translate, label: string, length: number): FieldRule {
  return value => (!!value && String(value).length <= length) || t('form.validation.maxLength', { field: label, length })
}

/** The username field: required, at most 60 characters. Shared with Edit, which orders the fields differently. */
function usernameField (t: Translate): ModalTextField {
  const label = t('form.label.username')
  return {
    type: 'text',
    label,
    name: 'username',
    placeholder: t('form.placeholder.username'),
    tooltip: 'tooltip.instance.user.field.username',
    rules: [requiredRule(t, label), maxLengthRule(t, label, 60)],
  }
}

/** The email field: required, and the legacy `/.+@.+\..+/` pattern. */
function emailField (t: Translate): ModalTextField {
  const label = t('form.label.email')
  return {
    type: 'text',
    label,
    name: 'email',
    placeholder: t('form.placeholder.email'),
    tooltip: 'tooltip.instance.user.field.email',
    rules: [
      requiredRule(t, label),
      value => (!!value && /.@.+\..+/.test(String(value))) || t('form.validation.valid', { field: label }),
    ],
  }
}

/** The display name field: required, at most 60 characters. */
function displayNameField (t: Translate): ModalTextField {
  const label = t('form.label.displayName')
  return {
    type: 'text',
    label,
    name: 'display_name',
    placeholder: t('form.placeholder.displayName'),
    tooltip: 'tooltip.instance.user.field.displayName',
    rules: [requiredRule(t, label), maxLengthRule(t, label, 60)],
  }
}

/**
 * The password field of Create: the shared panel password policy (`passwordPolicyRules`), which mirrors the server's
 * `Password::defaults()`, so a weak password is refused before submit. The rules carry their own required check. No `required` flag:
 * the kit password branch would show the English message.
 */
function passwordField (t: Translate): ModalPasswordField {
  return {
    type: 'password',
    label: t('form.label.password'),
    name: 'password',
    tooltip: 'tooltip.instance.user.field.password',
    rules: passwordPolicyRules(t),
    description: passwordRulesHint(t),
  }
}

/**
 * One line under the Create password field that lists the policy. It reuses the wizard checker keys, which the deployed fixtures do not
 * have yet, so each call passes its English default.
 */
function passwordRulesHint (t: Translate): string {
  const rules = [
    t('setup.wizard.checker.length', { defaultValue: '8 characters' }),
    t('setup.wizard.checker.uppercase', { defaultValue: '1 uppercase character' }),
    t('setup.wizard.checker.lowercase', { defaultValue: '1 lowercase character' }),
    t('setup.wizard.checker.number', { defaultValue: '1 number' }),
    t('setup.wizard.checker.symbol', { defaultValue: '1 symbol' }),
  ]
  const title = t('setup.wizard.checker.title', { defaultValue: 'To ensure that your password is strong, use at least:' })
  return `${title} ${rules.join(', ')}`
}

/**
 * The role select. `plainOptions` shows the role as plain text (lite behaviour). The
 * values are the WordPress role slugs, the labels are the translated `form.option.*` keys.
 */
function roleField (t: Translate): ModalSelectField {
  const label = t('form.label.role')
  return {
    type: 'select',
    label,
    name: 'role',
    tooltip: 'tooltip.instance.user.field.role',
    plainOptions: true,
    options: ['administrator', 'author', 'contributor', 'editor', 'subscriber'].map(role => ({
      label: t(`form.option.${role}`),
      value: role,
    })),
    rules: [requiredRule(t, label)],
  }
}

/** The send-email checkbox: no rules. */
function sendEmailField (t: Translate): ModalCheckboxField {
  return {
    type: 'checkbox',
    label: t('form.label.sendEmail'),
    name: 'send_email',
  }
}

/**
 * The password field of Edit: no rules (an empty value keeps the password, and the backend takes `null`), and the
 * `passwordLeaveEmpty` tooltip. The Create field keeps its rules.
 */
function editPasswordField (t: Translate): ModalPasswordField {
  return {
    type: 'password',
    label: t('form.label.password'),
    name: 'password',
    tooltip: 'tooltip.instance.user.field.passwordLeaveEmpty',
  }
}

/** Edit modal: username, email, password, display name and role, in this order. No send-email. */
export function editWordpressUserModal (t: Translate): WordpressUsersModal {
  return {
    kind: 'edit',
    title: t('heading.instance.advanced.users.modal.update.title'),
    icon: '$edit',
    buttons: [{ id: 'update', label: t('button.update'), color: 'primary' }, cancelButton(t)],
    fields: [
      usernameField(t),
      emailField(t),
      editPasswordField(t),
      displayNameField(t),
      roleField(t),
    ],
  }
}

/**
 * Same shape as `deleteUserModal` in Users: error icon, the email in the message
 * and a required `confirm` checkbox that gates the Delete button (`confirm-required` in the view). The email goes into `v-html`, so it is
 * escaped.
 */
export function deleteWordpressUserModal (t: Translate, item: WordpressUser): WordpressUsersModal {
  return {
    kind: 'delete',
    title: t('heading.instance.advanced.users.modal.delete.title'),
    icon: '$alertwarning',
    color: 'error',
    message: t('heading.instance.advanced.users.modal.delete.message', { email: escapeHtml(item.email) }),
    buttons: [{ id: 'delete', label: t('button.delete'), color: 'error' }, cancelButton(t)],
    fields: [
      {
        type: 'checkbox',
        label: t('form.confirmDelete.user'),
        name: 'confirm',
        message: `<b>${t('message.confirmAction')}</b>`,
        required: true,
      },
    ],
  }
}

/** Create modal: username, email, display name, password, role and send-email, in this order. */
export function createWordpressUserModal (t: Translate): WordpressUsersModal {
  return {
    kind: 'create',
    title: t('heading.instance.advanced.users.modal.create.title'),
    icon: '$edit',
    buttons: [{ id: 'create', label: t('button.create'), color: 'primary' }, cancelButton(t)],
    fields: [
      usernameField(t),
      emailField(t),
      displayNameField(t),
      passwordField(t),
      roleField(t),
      sendEmailField(t),
    ],
  }
}

/**
 * Warning icon, the email in the message, no fields. The email goes into
 * `v-html`, so it is escaped.
 */
export function resetWordpressUserPasswordModal (t: Translate, item: WordpressUser): WordpressUsersModal {
  return {
    kind: 'reset',
    title: t('heading.instance.advanced.users.modal.resetPassword.title'),
    icon: '$alertwarning',
    color: 'warning',
    message: t('heading.instance.advanced.users.modal.resetPassword.message', { email: escapeHtml(item.email) }),
    buttons: [{ id: 'reset', label: t('button.resetPassword'), color: 'warning' }, cancelButton(t)],
    fields: [],
  }
}

/**
 * The state after a successful reset, minus its repeat: the same title, an empty message and one
 * readonly `new_password` field, with Copy and Close. The password it shows is the one the reset just set, so no button of this state may
 * send another reset. The view fills the field after it swaps the modal in.
 */
export function resetWordpressUserPasswordDoneModal (t: Translate): WordpressUsersModal {
  return {
    kind: 'reset-done',
    title: t('heading.instance.advanced.users.modal.resetPassword.title'),
    icon: '$alertwarning',
    color: 'warning',
    message: '',
    buttons: [
      { id: 'copy', label: t('button.copy'), color: 'normal' },
      { id: 'close', label: t('button.close'), color: 'primary' },
    ],
    fields: [
      {
        type: 'text',
        label: t('form.label.passwordNew'),
        name: 'new_password',
        readonly: true,
      },
    ],
  }
}

/** The field types that can show a message the screen holds (a select and a checkbox cannot). */
function takesMessage (field: WordpressUsersModalField): field is ModalTextField | ModalPasswordField {
  return field.type === 'text' || field.type === 'password'
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

export interface WordpressUserRefusal {
  /** The modal with the server's messages under the fields they name. */
  modal: WordpressUsersModal
  /** The messages that name no field this modal can show, for above the fields; `''` when every one is under a field. */
  message: string
}

/** A refused create or edit (422): its messages under the fields they name, the rest above the fields; `null` otherwise. */
export function refusedWordpressUserModal (modal: WordpressUsersModal, error: unknown): WordpressUserRefusal | null {
  const bag = refusalBag(error)
  if (bag === null) {
    return null
  }
  const held = new Set<string>()
  const fields = modal.fields.map(field => {
    const messages = takesMessage(field) ? bag[field.name] : undefined
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

/** The modal without the held message of the field the user just edited, so its own rule reports from then on. */
export function withoutWordpressUserFieldMessage (modal: WordpressUsersModal, name: string): WordpressUsersModal {
  const index = modal.fields.findIndex(field => field.name === name && takesMessage(field) && field.errorMessages?.length)
  if (index === -1) {
    return modal
  }
  const fields = modal.fields.map((field, at) => (at === index && takesMessage(field) ? { ...field, errorMessages: [] } : field))
  return { ...modal, fields }
}
