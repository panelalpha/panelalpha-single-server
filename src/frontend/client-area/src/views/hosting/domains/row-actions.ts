import type { Translate } from './add-domain'
import type { HostingDomain } from './domains.types'
import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
import { isPanelAlphaOnlineHost } from '@/entities/project/open-project'
import { isApiError } from '@/shared/api/error-message'
import { rebrandResourceCopy } from '@/shared/api/resource-paths'
import { cancelButton } from '@/shared/ui/modal/action-modal'

// The title, the fields and the buttons of the row actions, and the Edit request body. The dialog state and the requests live in
// `use-domain-actions.ts`.

const MAX_LENGTH = 255

/** Titles and messages are `v-html`; the domain is the one interpolated value, so it is escaped. */
export function escapeHtml (value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/** The Edit title: the domain stays on one line while it fits and breaks only when it is longer than the line (`text-break-long`). */
export function editDomainTitle (domain: string, t: Translate): string {
  return t('heading.hosting.domains.modal.update.title', { domain: `<span class="text-break-long">${escapeHtml(domain)}</span>` })
}

/** An empty value becomes `https://`, a value without a protocol gets it; `http(s)://` stays. */
export function normalizeRedirectUrl (value: string | null | undefined): string {
  const trimmed = (value || '').trim()
  if (trimmed === '') {
    return 'https://'
  }
  return /^https?:\/\//i.test(trimmed) ? (value as string) : `https://${trimmed}`
}

/** The names of the Edit dialog's fields, as the panel's 422 names them. */
export type EditDomainFieldErrors = Partial<Record<'document_root' | 'redirect_url', string[]>>

/**
 * The fields of the Edit dialog. `redirectEnabled` is the live checkbox: legacy flipped `hidden` of the URL field in the checkbox's
 * `onChange`, which is the same as deriving it from the value (the start value is the row).
 */
export function editDomainFields (
  row: Pick<HostingDomain, 'capabilities' | 'redirect_enabled'>,
  t: Translate,
  redirectEnabled = Boolean(row.redirect_enabled),
  fieldErrors: EditDomainFieldErrors = {},
): ModalField[] {
  const fields: ModalField[] = []
  if (row.capabilities.can_update_document_root) {
    const label = (): string => t('form.label.documentRoot')
    fields.push({
      label: label(),
      name: 'document_root',
      tooltip: 'tooltip.edit_domain.document_root',
      type: 'text',
      rules: [
        v => !!v || t('form.validation.required', { field: label() }),
        v => (typeof v === 'string' && v.length <= MAX_LENGTH && v !== '') || t('form.validation.maxLength', { field: label(), length: MAX_LENGTH }),
      ],
      placeholder: t('form.placeholder.documentRoot'),
      errorMessages: fieldErrors.document_root ?? [],
    })
  }
  if (row.capabilities.can_redirect) {
    fields.push(
      {
        label: t('form.label.redirectDomain'),
        name: 'redirect_enabled',
        type: 'checkbox',
      },
      {
        label: t('form.label.redirectUrl'),
        name: 'redirect_url',
        tooltip: 'tooltip.edit_domain.redirect_url',
        type: 'text',
        hidden: !redirectEnabled,
        errorMessages: fieldErrors.redirect_url ?? [],
      },
    )
  }
  return fields
}

/** `BasicModal` started from `{ ...item }`, so every field of the row is a start value. */
export function editDomainValues (row: HostingDomain): Record<string, unknown> {
  return { ...row }
}

/** The PUT body: the whole element with the edited fields over it (legacy sent the whole `formValues`). */
export function updatePayload (row: HostingDomain, values: Record<string, unknown>): Record<string, unknown> {
  return { ...row, ...values }
}

export interface EditDomainRefusal {
  /** The 422's messages under the fields they name. */
  fields: EditDomainFieldErrors
  /** What the bag holds for a name the dialog has no field for; `''` when every message sits under a field. */
  message: string
}

const EDIT_DOMAIN_FIELDS: ReadonlyArray<keyof EditDomainFieldErrors> = ['document_root', 'redirect_url']

/** A refused Edit (422) as the fields it names; `null` for any other failure. */
export function editDomainRefusal (error: unknown): EditDomainRefusal | null {
  if (!isApiError(error) || error.response?.status !== 422) {
    return null
  }
  const bag = (error.response.data as { errors?: unknown } | null | undefined)?.errors
  if (!bag || typeof bag !== 'object') {
    return null
  }

  const fields: EditDomainFieldErrors = {}
  const others: string[] = []
  for (const [name, messages] of Object.entries(bag as Record<string, unknown>)) {
    const list = (Array.isArray(messages) ? messages : [messages]).map(message => rebrandResourceCopy(String(message)))
    if ((EDIT_DOMAIN_FIELDS as readonly string[]).includes(name)) {
      fields[name as keyof EditDomainFieldErrors] = list
    } else {
      others.push(...list)
    }
  }

  return Object.keys(fields).length > 0 ? { fields, message: others.join(' ') } : null
}

export function editDomainButtons (t: Translate): ModalButton[] {
  return [
    { id: 'submit', label: t('button.update'), color: 'primary' },
    cancelButton(t),
  ]
}

/** The Delete dialog asks for the `confirm` checkbox, which also gates the submit button. */
export function deleteDomainFields (t: Translate): ModalField[] {
  return [
    {
      message: `<b>${t('message.confirmAction')}</b>`,
      label: t('form.confirmDelete.domain'),
      name: 'confirm',
      type: 'checkbox',
      required: true,
    },
  ]
}

export function deleteDomainButtons (t: Translate): ModalButton[] {
  return [
    { id: 'submit', label: t('button.delete'), color: 'error' },
    cancelButton(t),
  ]
}

/** The confirm message, with what happens to a PanelAlpha Online main domain. */
export function setPrimaryMessage (domain: string, t: Translate, mainDomain?: string | null): string {
  const message = t('heading.hosting.domains.modal.setAsPrimary.message', { domain: escapeHtml(domain) })

  return isPanelAlphaOnlineHost(mainDomain)
    ? `${message} <p class="mt-4">${t('heading.hosting.domains.modal.setAsPrimary.onlineWarning', { domain: escapeHtml(String(mainDomain)) })}</p>`
    : message
}

export function setPrimaryButtons (t: Translate): ModalButton[] {
  return [
    { id: 'submit', label: t('button.confirm'), color: 'primary' },
    cancelButton(t),
  ]
}
