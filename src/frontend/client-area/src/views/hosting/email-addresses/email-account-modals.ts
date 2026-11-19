import type { EmailDomain } from '@/views/hosting/email-domain-records'
import type { EmailAccountRow, Translate } from './email-accounts'
import type { FieldRule } from '@/shared/ui/form/field-rule'
import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
import { escapeHtml } from '@/shared/format/escape-html'
import { cancelButton } from '@/shared/ui/modal/action-modal'
// Pure builders: the view owns the modal state, the values and the requests. The inline `text-wrap: nowrap` of the legacy Edit title is the
// `text-break-long` class of `BasicModal.scss` here, which breaks a name longer than the line.

/** Password minimum of both modals (the backend store rule is `min:8`, the update rule has a TODO). */
export const PASSWORD_MIN_LENGTH = 8

export type EmailAccountModalKind = 'add' | 'edit' | 'delete'

/** What the view needs to render one account `BasicModal`. */
export interface EmailAccountModal {
  kind: EmailAccountModalKind
  title: string
  icon: string
  color?: string
  buttons: ModalButton[]
  fields: ModalField[]
  /** What the form starts with (plus the hidden password placeholders of Edit). */
  initialValues: Record<string, unknown>
}

/**
 * The key a field writes to. A `text-select` writes its whole value (`{ email, domain }`), so its key is the text part (`textName`);
 * a hidden-password placeholder may have no name.
 */
export function modalFieldName (field: ModalField): string {
  if (field.type === 'text-select') {
    return field.textName
  }
  return ('name' in field && field.name) || ''
}

/** Legacy `required` and `minLength` rules of the password (min 8 in both modals). */
function passwordRules (t: Translate): FieldRule[] {
  const label = t('form.label.password')
  return [
    value => !!value || t('form.validation.required', { field: label }),
    value => (!!value && String(value).length >= PASSWORD_MIN_LENGTH)
      || t('form.validation.minLength', { field: label, length: PASSWORD_MIN_LENGTH }),
  ]
}

/**
 * The password rule of Edit. The field is hidden until "Set New Password", so an untouched password (`null`) passes and the account
 * keeps its password (legacy PUT sends `password: null`). A revealed one must meet the password rules.
 */
function editPasswordRules (t: Translate): FieldRule[] {
  const rules = passwordRules(t)
  return [
    value => {
      if (value === null) {
        return true
      }
      for (const rule of rules) {
        const result = rule(value)
        if (result !== true) {
          return result
        }
      }
      return true
    },
  ]
}

/** Legacy `text-select` rule of the address: `/.+@.+/` on the whole value (`email@domain`), shown on blur, not blocking the submit. */
function emailRules (t: Translate): FieldRule[] {
  const label = t('form.label.email')
  return [
    value => (!!value && /.+@.+/.test(String(value))) || t('form.validation.required', { field: label }),
  ]
}

/** The domain is the one selected on the page. */
export function buildAddAccountModal (domain: Pick<EmailDomain, 'domain'>, t: Translate): EmailAccountModal {
  return {
    kind: 'add',
    title: t('heading.hosting.emailAddress.modal.add.title'),
    icon: '$plus',
    buttons: [{ id: 'add', label: t('button.emailAddress.add'), color: 'primary' }, cancelButton(t)],
    fields: [
      {
        type: 'text-select',
        label: t('form.label.email'),
        tooltip: 'tooltip.add_email_account.email',
        textName: 'email',
        selectName: 'domain',
        suffix: '@',
        options: [{ label: domain.domain, value: domain.domain }],
        rules: emailRules(t),
      },
      {
        type: 'generatePassword',
        label: t('form.label.password'),
        name: 'password',
        tooltip: 'tooltip.add_email_account.password',
        rules: passwordRules(t),
      },
      {
        type: 'checkbox',
        label: t('form.label.unlimitedQuota'),
        name: 'unlimited_quota',
        tooltip: 'tooltip.add_email_account.unlimited_quota',
      },
      {
        type: 'text',
        label: t('form.label.quota'),
        name: 'quota',
        tooltip: 'tooltip.add_email_account.quota',
        hidden: true,
      },
    ],
    initialValues: { domain: domain.domain, unlimited_quota: true },
  }
}

/**
 * The title carries the address escaped (legacy `v-html`). The quota
 * field is hidden for an unlimited account; the starting values are `quota: parseInt(disk_quota)` for a limited one.
 */
export function buildEditAccountModal (item: Pick<EmailAccountRow, 'email' | 'disk_quota'>, t: Translate): EmailAccountModal {
  const unlimited = item.disk_quota === 'unlimited'
  return {
    kind: 'edit',
    title: t('heading.hosting.emailAddress.modal.update.title', {
      email: `<span class="text-break-long">${escapeHtml(item.email)}</span>`,
    }),
    icon: '$edit',
    buttons: [{ id: 'update', label: t('button.emailAddress.update'), color: 'primary' }, cancelButton(t)],
    fields: [
      {
        type: 'hiddenPassword',
        label: t('form.label.password'),
        name: 'hiddenPassword',
        tooltip: 'tooltip.edit_email_account.password',
      },
      {
        type: 'generatePassword',
        label: t('form.label.password'),
        name: 'password',
        tooltip: 'tooltip.edit_email_account.password',
        rules: editPasswordRules(t),
        hidden: true,
      },
      {
        type: 'checkbox',
        label: t('form.label.unlimitedQuota'),
        name: 'unlimited_quota',
        tooltip: 'tooltip.edit_email_account.unlimited_quota',
      },
      {
        type: 'text',
        label: t('form.label.quota'),
        name: 'quota',
        tooltip: 'tooltip.edit_email_account.quota',
        hidden: unlimited,
      },
    ],
    initialValues: unlimited
      ? { hiddenPassword: null, password: null, unlimited_quota: true, quota: '' }
      : { hiddenPassword: null, password: null, unlimited_quota: false, quota: Number.parseInt(String(item.disk_quota), 10) },
  }
}

/**
 * Error colour, the required `confirm` checkbox gates the Delete button
 * (`confirmRequired` / `confirmed` on the `BasicModal`, as FTP).
 */
export function buildDeleteAccountModal (t: Translate): EmailAccountModal {
  return {
    kind: 'delete',
    title: t('heading.hosting.emailAddress.modal.delete.title'),
    icon: '$alertwarning',
    color: 'error',
    buttons: [{ id: 'delete', label: t('button.emailAddress.delete'), color: 'error' }, cancelButton(t)],
    fields: [
      {
        type: 'checkbox',
        label: t('form.confirmDelete.emailAddress'),
        name: 'confirm',
        message: `<b>${t('message.confirmAction')}</b>`,
        required: true,
      },
    ],
    initialValues: {},
  }
}

/** Legacy submit of both modals: an unlimited account is sent with `quota = 0`; the other values go as they are. */
export function accountPayload (values: Record<string, unknown>): Record<string, unknown> {
  return values.unlimited_quota ? { ...values, quota: 0 } : { ...values }
}

/** On a change of `unlimited_quota`: the quota field is shown only while the account is not unlimited. */
export function toggleQuotaHidden (fields: ModalField[], unlimited: boolean): void {
  for (const field of fields) {
    if (modalFieldName(field) === 'quota') {
      field.hidden = unlimited
    }
  }
}

/** On "Set New Password": the hidden placeholder goes, the generate field comes. */
export function revealPassword (fields: ModalField[]): void {
  for (const field of fields) {
    if (modalFieldName(field) === 'hiddenPassword') {
      field.hidden = true
    }
    if (modalFieldName(field) === 'password') {
      field.hidden = false
    }
  }
}
