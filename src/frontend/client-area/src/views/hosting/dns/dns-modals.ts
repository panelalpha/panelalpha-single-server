import type { DnsRecordTypeOption, DnsRow } from './dns'
import type { Translate } from './dns-record-fields'
import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
import { escapeHtml } from '@/shared/format/escape-html'
import { cancelButton } from '@/shared/ui/modal/action-modal'
import { ADD_ITEM, dnsRecordFields, initialRecordValues, stripTxtQuotes } from './dns-record-fields'
// Pure builders: the view owns the modal state, the record and the requests.

/** The modals of the DNS screen. */
export type DnsModalKind = 'proxyWarning' | 'add' | 'edit' | 'delete'

/** What the view needs to render the one `BasicModal` of the screen. */
export interface DnsModal {
  kind: DnsModalKind
  title: string
  icon: string
  color?: string
  /** Trusted HTML, rendered with `v-html`. */
  message?: string
  /** Shown in the warning box under the message. */
  alert?: string
  buttons: ModalButton[]
  fields: ModalField[]
  initialValues: Record<string, unknown>
}

/** The zone and the provider facts the record forms need. */
export interface DnsRecordModalContext {
  zoneName: string
  allowProxy: boolean
  recordTypes: DnsRecordTypeOption[]
}

/** The id of the confirm button of the proxy warning; the view checks it. */
export const PROXY_ENABLE_BUTTON_ID = 'proxy-enable'
/** The id of the submit button of the Add modal. */
export const RECORD_ADD_BUTTON_ID = 'add'
/** The id of the submit button of the Edit modal. */
export const RECORD_UPDATE_BUTTON_ID = 'update'
/** The id of the Delete button of the Delete modal. */
export const RECORD_DELETE_BUTTON_ID = 'delete'

/** The warning before a record goes behind the Cloudflare proxy. No fields. */
export function buildProxyWarningModal (t: Translate): DnsModal {
  return {
    kind: 'proxyWarning',
    title: t('heading.hosting.dns.modal.proxy-warning.title'),
    icon: '$alertwarning',
    color: 'warning',
    message: t('heading.hosting.dns.modal.proxy-warning.info'),
    alert: t('heading.hosting.dns.modal.proxy-warning.alert'),
    buttons: [{ id: PROXY_ENABLE_BUTTON_ID, label: t('button.dns.proxy.enable'), color: 'primary' }, cancelButton(t)],
    fields: [],
    initialValues: {},
  }
}

/** The zone name in the message is trusted HTML, so it is escaped (legacy built it without escaping). */
function zoneMessage (t: Translate, zoneName: string): string {
  return t('heading.hosting.dns.modal.update.message', { zone: `<strong>${escapeHtml(zoneName)}</strong>` })
}

/** An A record with the `ADD_ITEM` start values. */
export function buildAddRecordModal (t: Translate, context: DnsRecordModalContext): DnsModal {
  const fields = dnsRecordFields(t, { type: 'A', edit: false, allowProxy: context.allowProxy, recordTypes: context.recordTypes })
  return {
    kind: 'add',
    title: t('heading.hosting.dns.modal.add.title'),
    icon: '$plus',
    message: zoneMessage(t, context.zoneName),
    buttons: [{ id: RECORD_ADD_BUTTON_ID, label: t('button.dns.add'), color: 'primary' }, cancelButton(t)],
    fields,
    initialValues: initialRecordValues(ADD_ITEM, fields),
  }
}

/** The form of the record's type, with the TXT quotes stripped on a copy. */
export function buildEditRecordModal (t: Translate, record: DnsRow, context: DnsRecordModalContext): DnsModal {
  const fields = dnsRecordFields(t, { type: record.type, edit: true, allowProxy: context.allowProxy, recordTypes: context.recordTypes })
  return {
    kind: 'edit',
    title: t('heading.hosting.dns.modal.update.title'),
    icon: '$edit',
    message: zoneMessage(t, context.zoneName),
    buttons: [{ id: RECORD_UPDATE_BUTTON_ID, label: t('button.update'), color: 'primary' }, cancelButton(t)],
    fields,
    initialValues: initialRecordValues(stripTxtQuotes(record), fields),
  }
}

/**
 * Error colour, the warning icon, and the required `confirm` checkbox
 * that gates the Delete button (`confirmRequired` / `confirmed` on the `BasicModal`, as in the email accounts).
 */
export function buildDeleteRecordModal (t: Translate): DnsModal {
  return {
    kind: 'delete',
    title: t('heading.hosting.dns.modal.delete.title'),
    icon: '$alertwarning',
    color: 'error',
    buttons: [{ id: RECORD_DELETE_BUTTON_ID, label: t('button.delete'), color: 'error' }, cancelButton(t)],
    fields: [
      {
        type: 'checkbox',
        label: t('form.confirmDelete.dns'),
        name: 'confirm',
        message: `<b>${t('message.confirmAction')}</b>`,
        required: true,
      },
    ],
    initialValues: {},
  }
}
