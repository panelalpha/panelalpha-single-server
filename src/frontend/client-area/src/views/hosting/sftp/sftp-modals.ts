import type { Translate } from '@/views/hosting/ftp/ftp-accounts'
import type { HostingServerAccount } from '@/views/hosting/hosting.types'
import type { SftpServerInfo } from './sftp.api'
import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
import type {
  ModalCheckboxField,
  ModalGeneratePasswordField,
  ModalSelectField,
  ModalTextField,
} from '@/shared/ui/modal/basic-modal.types'
import { modalFieldName } from '@/views/hosting/ftp/ftp-modals'
// Pure builders: the view owns the modal state, the values and the requests.
import { escapeHtml } from '@/shared/format/escape-html'
import { cancelButton } from '@/shared/ui/modal/action-modal'

export type SftpModalKind = 'add' | 'edit' | 'info' | 'delete' | 'disconnect' | 'access'

/** The access method of the page: set from the list response, `null` until it arrives. */
export type SftpAccessType = 'ssh' | 'sftp' | null

/** The field types the SFTP modals use: the account and the auth method are text and select, the password is generated. */
export type SftpModalField = ModalTextField | ModalSelectField | ModalGeneratePasswordField | ModalCheckboxField

/** The values the modal fields write into. */
export type SftpFormValues = Record<string, unknown>

/** `ssh` when the plan allows SSH access, `sftp` otherwise. */
export type SftpPageType = 'ssh' | 'sftp'

export interface SftpModal {
  kind: SftpModalKind
  title: string
  icon: string
  color?: string
  /** Trusted HTML (`v-html`): API values in it are escaped. */
  message?: string
  buttons: ModalButton[]
  fields: SftpModalField[]
  /** What the form starts with (the seed). */
  initialValues: SftpFormValues
}

/** The account fields the Add prefix reads. `username` and `details.remote_id` come from the API and are not typed on the account. */
interface PrefixSource {
  server_type?: string
  username?: unknown
  details?: unknown
}

/** The authentication methods: password first, so it is the seed of both Add and Edit. */
function authMethodOptions (t: Translate) {
  return [
    { label: t('form.option.password'), value: 'password' },
    { label: t('form.option.sshKey'), value: 'public_key' },
  ]
}

/** The username prefix: the PanelAlpha account name, or the WP Cloud remote id (`remote_id-`). */
function accountPrefix (account: PrefixSource, variant: 'hosting' | 'project' = 'hosting'): string {
  // In a project the prefix is always `username_`, WP Cloud included.
  if (variant === 'project') {
    return `${String(account.username)}_`
  }
  if (account.server_type === 'panelalpha') {
    return `${String(account.username)}_`
  }
  const details = account.details as { remote_id?: unknown } | null | undefined
  return `${String(details?.remote_id)}-`
}

/** The seed is the password method, the public key is hidden until the SSH Key method is picked. */
export function addSftpModal (t: Translate, options: { pageType: SftpPageType, serverAccount: HostingServerAccount, variant?: 'hosting' | 'project' }): SftpModal {
  const { pageType } = options
  return {
    kind: 'add',
    title: t(`heading.hosting.${pageType}.modal.add.title`),
    icon: '$plus',
    buttons: [{ id: 'add', label: t(`button.${pageType}.add`), color: 'primary' }, cancelButton(t)],
    fields: [
      {
        type: 'text',
        label: t('form.label.username'),
        name: 'username',
        tooltip: `tooltip.add_${pageType}_account.username`,
        prefix: accountPrefix(options.serverAccount, options.variant),
      },
      {
        type: 'select',
        label: t('form.label.authenticationMethod'),
        name: 'type',
        tooltip: `tooltip.add_${pageType}_account.type`,
        options: authMethodOptions(t),
        required: true,
      },
      {
        type: 'generatePassword',
        label: t('form.label.password'),
        name: 'password',
        tooltip: `tooltip.add_${pageType}_account.password`,
      },
      {
        type: 'text',
        label: t('form.label.public_key'),
        name: 'public_key',
        tooltip: `tooltip.add_${pageType}_account.public_key`,
        hidden: true,
      },
    ],
    initialValues: { username: null, type: 'password', password: null, public_key: null },
  }
}

/** No username field; the message names the account being changed (escaped). */
export function editSftpModal (t: Translate, options: { pageType: SftpPageType, item: { user: string } }): SftpModal {
  const { pageType, item } = options
  return {
    kind: 'edit',
    title: t(`heading.hosting.${pageType}.modal.update.title`),
    icon: '$edit',
    message: `<b>${t(`heading.hosting.${pageType}.modal.update.info`)}:</b> ${escapeHtml(item.user)}`,
    buttons: [{ id: 'update', label: t('button.update'), color: 'primary' }, cancelButton(t)],
    fields: [
      {
        type: 'select',
        label: t('form.label.authenticationMethod'),
        name: 'type',
        tooltip: `tooltip.add_${pageType}_account.type`,
        options: authMethodOptions(t),
        required: true,
      },
      {
        type: 'generatePassword',
        label: t('form.label.password'),
        name: 'password',
        tooltip: `tooltip.edit_${pageType}_account.password`,
      },
      {
        type: 'text',
        label: t('form.label.public_key'),
        name: 'public_key',
        tooltip: `tooltip.edit_${pageType}_account.public_key`,
        hidden: true,
      },
    ],
    initialValues: { type: 'password', password: null, public_key: null },
  }
}

/** The server's host and port, the account name escaped. Only Cancel, as legacy. */
export function infoSftpModal (t: Translate, options: { pageType: SftpPageType, item: { user: string }, info: SftpServerInfo }): SftpModal {
  const { pageType, item, info } = options
  const rows = { username: item.user, host: info.host, port: info.port }
  const list = Object.entries(rows)
    .map(([key, value]) => `<li><strong class="d-inline-block">${t(`heading.hosting.${pageType}.modal.show.info.${key}`)}:</strong> <span class="d-inline-block">${escapeHtml(String(value))}</span></li>`)
    .join('')

  return {
    kind: 'info',
    title: t(`heading.hosting.${pageType}.modal.show.title`, { user: `<span class="text-break-long">${escapeHtml(item.user)}</span>` }),
    icon: '$help',
    message: `<ul>${list}</ul>`,
    buttons: [cancelButton(t)],
    fields: [],
    initialValues: {},
  }
}

/** The required `confirm` checkbox gates the Delete button (`confirm-required` in the view). */
export function deleteSftpModal (t: Translate, options: { pageType: SftpPageType }): SftpModal {
  const { pageType } = options
  return {
    kind: 'delete',
    title: t(`heading.hosting.${pageType}.modal.delete.title`),
    icon: '$alertwarning',
    color: 'error',
    buttons: [{ id: 'delete', label: t('button.delete'), color: 'error' }, cancelButton(t)],
    fields: [
      {
        type: 'checkbox',
        label: t(`form.confirmDelete.${pageType}`),
        name: 'confirm',
        message: `<b>${t('message.confirmAction')}</b>`,
        required: true,
      },
    ],
    initialValues: {},
  }
}

/** No fields; the Disconnect all button comes first, Cancel after it. */
export function disconnectSftpModal (t: Translate, options: { pageType: SftpPageType }): SftpModal {
  const { pageType } = options
  return {
    kind: 'disconnect',
    title: t(`heading.hosting.${pageType}.modal.disconnect.title`),
    icon: '$logout',
    color: 'primary',
    message: t(`heading.hosting.${pageType}.modal.disconnect.message`),
    buttons: [{ id: 'disconnect', label: t('button.disconnect.all'), color: 'primary' }, cancelButton(t)],
    fields: [],
    initialValues: {},
  }
}

/** The access method select starts at the page's current access type; no validation. */
export function accessSftpModal (t: Translate, options: { pageType: SftpPageType, accessType: SftpAccessType }): SftpModal {
  const { pageType, accessType } = options
  return {
    kind: 'access',
    title: t(`heading.hosting.${pageType}.modal.manageSSH.title`),
    icon: '$settings',
    color: 'primary',
    message: t(`heading.hosting.${pageType}.modal.manageSSH.message`),
    buttons: [{ id: 'setAccessMethod', label: t('button.setAccessMethod'), color: 'primary' }, cancelButton(t)],
    fields: [
      {
        type: 'select',
        label: t(`heading.hosting.${pageType}.modal.manageSSH.field`),
        name: 'access_type',
        tooltip: `tooltip.hosting.${pageType}.accessMethod`,
        options: [
          { label: t('general.ssh'), value: 'ssh' },
          { label: t('general.sftp'), value: 'sftp' },
        ],
      },
    ],
    initialValues: { access_type: accessType },
  }
}

/** On a change of the authentication method: the password shows for `password`, the public key for any other method. */
export function toggleAuthFields (fields: SftpModalField[], type: unknown): void {
  const password = type === 'password'
  for (const field of fields) {
    const name = modalFieldName(field)
    if (name === 'public_key') {
      field.hidden = password
    }
    if (name === 'password') {
      field.hidden = !password
    }
  }
}
