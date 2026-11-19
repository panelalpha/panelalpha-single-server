import type { Translate } from './ftp-accounts'
import type { FtpDomain, FtpServerInfo } from './ftp.api'
// Pure builders: the view owns the modal state, the values and the requests.
import type { FieldRule } from '@/shared/ui/form/field-rule'
import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
import type {
  ModalCheckboxField,
  ModalGeneratePasswordField,
  ModalTextField,
  ModalTextSelectField,
} from '@/shared/ui/modal/basic-modal.types'
import { escapeHtml } from '@/shared/format/escape-html'
import { cancelButton } from '@/shared/ui/modal/action-modal'

export type FtpModalKind = 'add' | 'edit' | 'info' | 'delete'

/** The field types the FTP modals use (Add and Delete have fields; Info has none). */
export type FtpModalField = ModalTextField | ModalTextSelectField | ModalGeneratePasswordField | ModalCheckboxField

/** The values the modal fields write into. */
export type FtpFormValues = Record<string, unknown>

export interface FtpModal {
  kind: FtpModalKind
  title: string
  icon: string
  color?: string
  /** Trusted HTML (`v-html`): API values in it are escaped. */
  message?: string
  buttons: ModalButton[]
  fields: FtpModalField[]
  /** What the form starts with (the seed of Add). */
  initialValues: FtpFormValues
}

/**
 * The key a field writes to: the select part of a `text-select` is not used as its name. Typed structurally so the SFTP modal
 * fields (no `text-select`) use it too.
 */
export function modalFieldName (field: { type: string, name?: string, textName?: string }): string {
  return (field.type === 'text-select' ? field.textName : field.name) ?? ''
}

/**
 * Legacy username rules, run on the whole `user@domain` value. The fourth rule is ours: the username goes into the DELETE path
 * unencoded (`ftp.api.ts`, as legacy does), so `/`, `?`, `#` and `%` would change the request.
 */
function usernameRules (t: Translate): FieldRule[] {
  const label = t('form.label.username')
  return [
    value => !!value || t('form.validation.required', { field: label }),
    value => (!!value && /.+@.+/.test(String(value))) || t('form.validation.invalid', { field: label }),
    value => {
      const text = String(value ?? '')
      const at = text.lastIndexOf('@')
      return !text || at === -1 || !text.slice(0, Math.max(0, at)).includes('@') || t('form.validation.invalid', { field: label })
    },
    value => !/[/?#%]/.test(String(value ?? '')) || t('form.validation.invalid', { field: label }),
  ]
}

function passwordRules (t: Translate): FieldRule[] {
  const label = t('form.label.password')
  return [
    value => !!value || t('form.validation.required', { field: label }),
    value => (!!value && String(value).length >= 8) || t('form.validation.minLength', { field: label, length: 8 }),
    value => String(value ?? '').length <= 255 || t('form.validation.maxLength', { field: label, length: 255 }),
  ]
}

/**
 * The username check: the three rules on `user@domain`. The text-select rules show their error on blur
 * (`TextSelectInput`); submit only blocks.
 */
export function isUsernameValid (t: Translate, user: string, domain: string): boolean {
  const value = `${user}@${domain}`
  return usernameRules(t).every(rule => rule(value) === true)
}

export function addFtpModal (t: Translate, options: { domains: FtpDomain[], homedir?: string, usageSupported: boolean }): FtpModal {
  const fields: FtpModalField[] = [
    {
      type: 'text-select',
      label: t('form.label.username'),
      tooltip: 'tooltip.add_ftp_account.username',
      textName: 'user',
      selectName: 'domain',
      suffix: '@',
      options: options.domains.map(item => ({ label: item.domain, value: item.domain })),
      rules: usernameRules(t),
    },
    {
      type: 'generatePassword',
      label: t('form.label.password'),
      name: 'password',
      tooltip: 'tooltip.add_ftp_account.password',
      rules: passwordRules(t),
    },
    {
      type: 'text',
      label: t('form.label.directory'),
      name: 'directory',
      tooltip: 'tooltip.add_ftp_account.directory',
      prefix: options.homedir,
    },
  ]

  if (options.usageSupported) {
    fields.push(
      {
        type: 'checkbox',
        label: t('form.label.unlimitedQuota'),
        name: 'unlimited_quota',
        tooltip: 'tooltip.add_ftp_account.unlimited_quota',
      },
      {
        type: 'text',
        label: t('form.label.quota'),
        name: 'quota',
        tooltip: 'tooltip.add_ftp_account.quota',
        hidden: true,
      },
    )
  }

  return {
    kind: 'add',
    title: t('heading.hosting.ftp.modal.add.title'),
    icon: '$plus',
    buttons: [{ id: 'add', label: t('button.ftp.add'), color: 'primary' }, cancelButton(t)],
    fields,
    initialValues: { domain: options.domains[0]?.domain, unlimited_quota: true },
  }
}

/** An unlimited account is sent with `quota = 0`; the other values go as they are. */
export function buildCreatePayload (values: FtpFormValues): FtpFormValues {
  return values.unlimited_quota ? { ...values, quota: 0 } : { ...values }
}

export function editFtpModal (t: Translate, item: { user: string }): FtpModal {
  return {
    kind: 'edit',
    title: t('heading.hosting.ftp.modal.update.title'),
    icon: '$edit',
    message: `<b>${t('heading.hosting.ftp.modal.update.info')}:</b> ${escapeHtml(item.user)}`,
    buttons: [{ id: 'update', label: t('button.update'), color: 'primary' }, cancelButton(t)],
    fields: [
      {
        type: 'generatePassword',
        label: t('form.label.password'),
        name: 'password',
        tooltip: 'tooltip.edit_ftp_account.password',
        rules: passwordRules(t),
      },
    ],
    initialValues: { password: null },
  }
}

/** A 422's password messages; null for any other failure. */
export function ftpPasswordRefusal (error: unknown): string[] | null {
  const response = (error as { response?: { status?: number, data?: { errors?: unknown } } } | null | undefined)?.response
  if (response?.status !== 422) {
    return null
  }
  const bag = (response.data?.errors && typeof response.data.errors === 'object' ? response.data.errors : {}) as Record<string, unknown>
  const password = bag.password
  if (password === undefined) {
    return null
  }
  const messages = (Array.isArray(password) ? password : [password]).map(String)
  return messages.length > 0 ? messages : null
}

export function withoutFtpPasswordMessage (modal: FtpModal): FtpModal {
  if (!modal.fields.some(field => field.type === 'generatePassword' && field.errorMessages?.length)) {
    return modal
  }
  return {
    ...modal,
    fields: modal.fields.map(field => (field.type === 'generatePassword' ? { ...field, errorMessages: [] } : field)),
  }
}

/** The server's host and port, the account name escaped. Only Cancel, as legacy. */
export function infoFtpModal (t: Translate, item: { user: string }, info: FtpServerInfo): FtpModal {
  const rows = { username: item.user, host: info.host, port: info.port }
  const list = Object.entries(rows)
    .map(([key, value]) => `<li><strong class="d-inline-block">${t(`heading.hosting.ftp.modal.show.info.${key}`)}:</strong> <span class="d-inline-block">${escapeHtml(String(value))}</span></li>`)
    .join('')

  return {
    kind: 'info',
    title: t('heading.hosting.ftp.modal.show.title', { user: `<span class="text-break-long">${escapeHtml(item.user)}</span>` }),
    icon: '$help',
    message: `<ul>${list}</ul>`,
    buttons: [cancelButton(t)],
    fields: [],
    initialValues: {},
  }
}

/** The required `confirm` checkbox gates the Delete button (`confirm-required` in the view). */
export function deleteFtpModal (t: Translate): FtpModal {
  return {
    kind: 'delete',
    title: t('heading.hosting.ftp.modal.delete.title'),
    icon: '$alertwarning',
    color: 'error',
    buttons: [{ id: 'delete', label: t('button.delete'), color: 'error' }, cancelButton(t)],
    fields: [
      {
        type: 'checkbox',
        label: t('form.confirmDelete.ftp'),
        name: 'confirm',
        message: `<b>${t('message.confirmAction')}</b>`,
        required: true,
      },
    ],
    initialValues: {},
  }
}

/** On a change of `unlimited_quota`: the quota field is shown only while the account is not unlimited. */
export function toggleQuotaHidden (fields: FtpModalField[], unlimited: boolean): void {
  for (const field of fields) {
    if (modalFieldName(field) === 'quota') {
      field.hidden = unlimited
    }
  }
}
