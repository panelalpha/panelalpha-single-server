import type { Translate } from '@/views/hosting/email-addresses/email-accounts'
import type { EmailDomain } from '@/views/hosting/email-domain-records'
import type { FieldRule } from '@/shared/ui/form/field-rule'
import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
import { cancelButton } from '@/shared/ui/modal/action-modal'
// Pure builders: the view owns the modal state, the values and the requests. `modalFieldName` is the one of Email Addresses
// (`../email-addresses/email-account-modals`).

export type EmailForwarderModalKind = 'add' | 'delete'

/** What the view needs to render one forwarder `BasicModal`. */
export interface EmailForwarderModal {
  kind: EmailForwarderModalKind
  title: string
  icon: string
  color?: string
  buttons: ModalButton[]
  fields: ModalField[]
  /** What the form starts with. */
  initialValues: Record<string, unknown>
}

/**
 * Legacy `text-select` rule of the address: `/.+@.+/` on the whole value (`email@domain`), shown on blur, not blocking the submit. Its message is
 * `form.validation.required`, not an email message.
 */
function emailRules (t: Translate): FieldRule[] {
  const label = t('form.label.email')
  return [
    value => (!!value && /.+@.+/.test(String(value))) || t('form.validation.required', { field: label }),
  ]
}

/** Legacy rules of the destination: required first, then `/.+@.+/`. */
function destinationRules (t: Translate): FieldRule[] {
  const label = t('form.label.destination')
  return [
    value => !!value || t('form.validation.required', { field: label }),
    value => /.+@.+/.test(String(value)) || t('form.validation.email', { field: label }),
  ]
}

/** The only option of the select is the domain selected on the page. */
export function buildAddForwarderModal (domain: Pick<EmailDomain, 'domain'>, t: Translate): EmailForwarderModal {
  return {
    kind: 'add',
    title: t('heading.hosting.emailForwarders.modal.add.title'),
    icon: '$plus',
    buttons: [{ id: 'add', label: t('button.emailForwarder.add'), color: 'primary' }, cancelButton(t)],
    fields: [
      {
        type: 'text-select',
        label: t('form.label.email'),
        tooltip: 'tooltip.add_forwarder.email',
        textName: 'email',
        selectName: 'domain',
        suffix: '@',
        options: [{ label: domain.domain, value: domain.domain }],
        rules: emailRules(t),
      },
      {
        type: 'text',
        label: t('form.label.destination'),
        name: 'destination',
        tooltip: 'tooltip.add_forwarder.destination',
        rules: destinationRules(t),
      },
    ],
    initialValues: { domain: domain.domain },
  }
}

/**
 * Error colour, the required `confirm` checkbox gates the Delete button (`confirmRequired` / `confirmed`
 * on the `BasicModal`, as Email Addresses).
 */
export function buildDeleteForwarderModal (t: Translate): EmailForwarderModal {
  return {
    kind: 'delete',
    title: t('heading.hosting.emailForwarders.modal.delete.title'),
    icon: '$alertwarning',
    color: 'error',
    buttons: [{ id: 'delete', label: t('button.emailForwarder.delete'), color: 'error' }, cancelButton(t)],
    fields: [
      {
        type: 'checkbox',
        label: t('form.confirmDelete.emailForwarder'),
        name: 'confirm',
        message: `<b>${t('message.confirmAction')}</b>`,
        required: true,
      },
    ],
    initialValues: {},
  }
}
