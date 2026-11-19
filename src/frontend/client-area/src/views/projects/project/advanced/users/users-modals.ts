import type { Translate } from './users-table'
import type { InstanceAppUser } from './users.api'
import type { FieldRule } from '@/shared/ui/form/field-rule'
import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
import type {
  ModalCheckboxField,
  ModalPasswordField,
  ModalSelectField,
  ModalTextField,
} from '@/shared/ui/modal/basic-modal.types'
// Pure builders: the view owns the modal state, the values and the requests. Rules are local because the kit `EMAIL_PATTERN`
// differs from legacy `/.+@.+\..+/`.
import { escapeHtml } from '@/shared/format/escape-html'
import { cancelButton } from '@/shared/ui/modal/action-modal'

export type UsersModalKind = 'create' | 'reset' | 'delete'

export type UsersModalField = ModalTextField | ModalPasswordField | ModalSelectField | ModalCheckboxField

export interface UsersModal {
  kind: UsersModalKind
  title: string
  icon: string
  color?: string
  /** Trusted HTML (`v-html`): API values in it are escaped. */
  message?: string
  buttons: ModalButton[]
  fields: UsersModalField[]
}

function requiredRule (t: Translate, label: string): FieldRule {
  return value => !!value || t('form.validation.required', { field: label })
}

/** Create modal: username, email, password and role, in this order. */
export function createUserModal (t: Translate, roles: string[]): UsersModal {
  const usernameLabel = t('form.label.username')
  const emailLabel = t('form.label.email')
  const passwordLabel = t('form.label.password')
  const roleLabel = t('form.label.role')

  return {
    kind: 'create',
    title: t('heading.instance.advanced.users.modal.create.title'),
    icon: '$edit',
    buttons: [{ id: 'create', label: t('button.create'), color: 'primary' }, cancelButton(t)],
    fields: [
      {
        type: 'text',
        label: usernameLabel,
        name: 'username',
        placeholder: t('form.placeholder.username'),
        tooltip: 'tooltip.instance.user.field.username',
        rules: [
          requiredRule(t, usernameLabel),
          value => (!!value && String(value).length <= 60) || t('form.validation.maxLength', { field: usernameLabel, length: 60 }),
        ],
      },
      {
        type: 'text',
        label: emailLabel,
        name: 'email',
        placeholder: t('form.placeholder.email'),
        tooltip: 'tooltip.instance.user.field.email',
        rules: [
          requiredRule(t, emailLabel),
          value => (!!value && /.@.+\..+/.test(String(value))) || t('form.validation.valid', { field: emailLabel }),
        ],
      },
      {
        // No `required` flag: the password branch of the kit would show the English legacy message; legacy password rules use `form.validation.required`.
        type: 'password',
        label: passwordLabel,
        name: 'password',
        tooltip: 'tooltip.instance.user.field.password',
        rules: [
          requiredRule(t, passwordLabel),
          value => (!!value && String(value).length >= 8) || t('form.validation.minLength', { field: passwordLabel, length: 8 }),
        ],
      },
      {
        type: 'select',
        label: roleLabel,
        name: 'role',
        tooltip: 'tooltip.instance.user.field.role',
        // Lite shows the role as plain text.
        plainOptions: true,
        options: roles.map(role => ({ label: role, value: role })),
        rules: [requiredRule(t, roleLabel)],
      },
    ],
  }
}

/**
 * One password field, warning icon. The rules use the `passwordNew` label as legacy does. The placeholder is not set: the
 * password field type does not take one (legacy shows `form.placeholder.password`).
 */
export function resetPasswordModal (t: Translate): UsersModal {
  const passwordLabel = t('form.label.passwordNew')

  return {
    kind: 'reset',
    title: t('heading.instance.advanced.users.modal.resetPassword.title'),
    icon: '$alertwarning',
    color: 'warning',
    buttons: [{ id: 'reset', label: t('button.resetPassword'), color: 'warning' }, cancelButton(t)],
    fields: [
      {
        type: 'password',
        label: passwordLabel,
        name: 'password',
        tooltip: 'tooltip.instance.user.field.password',
        rules: [
          requiredRule(t, passwordLabel),
          value => (!!value && String(value).length >= 8) || t('form.validation.minLength', { field: passwordLabel, length: 8 }),
        ],
      },
    ],
  }
}

/**
 * Error icon, the email in the message and a required `confirm` checkbox that gates the Delete button (`confirm-required` in the
 * view). The email goes into `v-html`, so it is escaped.
 */
export function deleteUserModal (t: Translate, item: InstanceAppUser): UsersModal {
  return {
    kind: 'delete',
    title: t('heading.instance.advanced.users.modal.delete.title'),
    icon: '$alertwarning',
    color: 'error',
    message: t('heading.instance.advanced.users.modal.delete.message', { email: escapeHtml(item.email ?? '') }),
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
