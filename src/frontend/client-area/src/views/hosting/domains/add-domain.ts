import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
import type { ModalField, ModalSelectOption } from '@/shared/ui/modal/basic-modal.types'
import { isApiError } from '@/shared/api/error-message'
import { cancelButton } from '@/shared/ui/modal/action-modal'

// The fields of the Add dialog, their rules and the request body. The dialog state and the requests live in `use-domain-actions.ts`.

export type Translate = (key: string, options?: Record<string, unknown>) => string

export interface AddDomainValues {
  type: string
  domain: string | null
  parent_domain: string | null
  target_domain: string | null
}

/**
 * Which of the three domain inputs hide. Legacy built them from `item.type` and flipped them in the `type` field's `onChange`; the
 * `onChange` never touches `target_domain`, and the subdomain input starts hidden for every type (it compares with `'subdomain'`,
 * not `'sub'`). Both quirks stay.
 */
export interface DomainInputsHidden {
  alias: boolean
  target: boolean
  sub: boolean
  addon: boolean
}

export const DOMAIN_PATTERN = /^[\w.-]+$/
const MAX_LENGTH = 255

/** The initial hidden flags (`hidden: item.type !== '…'` of each field). */
export function initialDomainInputsHidden (type: string): DomainInputsHidden {
  return {
    alias: type !== 'alias',
    target: type !== 'alias',
    sub: true,
    addon: type !== 'addon',
  }
}

/** The `onChange` of the `type` field: `addon`, `sub` and `alias` flip the three inputs; any other type changes nothing. */
export function domainInputsHiddenAfterTypeChange (type: string, current: DomainInputsHidden): DomainInputsHidden {
  if (type === 'addon') {
    return { ...current, addon: false, sub: true, alias: true }
  }
  if (type === 'sub') {
    return { ...current, addon: true, sub: false, alias: true }
  }
  if (type === 'alias') {
    return { ...current, addon: true, sub: true, alias: false }
  }
  return current
}

/** Legacy opens the dialog from `domainTypes[0]` and `parentDomains[0]`; with none of them it threw. Here the click does nothing. */
export function canOpenAddDomain (types: readonly string[], parents: readonly string[]): boolean {
  return types.length > 0 && parents.length > 0
}

/** The domains a subdomain or an alias can hang on: every row but a `sub` or an `alias`. */
export function parentDomains (rows: ReadonlyArray<{ domain: string, type: string }>): string[] {
  return rows.filter(row => row.type !== 'sub' && row.type !== 'alias').map(row => row.domain)
}

/** The item and the `null` the field names get in `BasicModal`. */
export function initialAddDomainValues (types: readonly string[], parents: readonly string[]): AddDomainValues {
  return {
    type: types[0] ?? '',
    parent_domain: parents[0] ?? null,
    target_domain: parents[0] ?? null,
    domain: null,
  }
}

function domainRules (t: Translate, options: { maxLength: boolean, noWww: boolean }): Array<(value: unknown) => true | string> {
  const field = (): string => t('form.label.domain')
  const rules: Array<(value: unknown) => true | string> = [
    v => !!v || t('form.validation.required', { field: field() }),
  ]
  // The order of the rules differs between the three legacy inputs (alias: length before pattern; sub and addon: pattern before length).
  const length = (v: unknown): true | string => (typeof v === 'string' && v.length <= MAX_LENGTH && v !== '') || t('form.validation.maxLength', { field: field(), length: MAX_LENGTH })
  const pattern = (v: unknown): true | string => (typeof v === 'string' && DOMAIN_PATTERN.test(v)) || t('form.validation.valid', { field: field() })
  if (options.maxLength) {
    rules.push(length, pattern)
  } else {
    rules.push(pattern, length)
  }
  if (options.noWww) {
    rules.push(v => (typeof v === 'string' && v !== '' && !v.toLowerCase().startsWith('www.')) || t('form.validation.invalid_www', { field: field() }))
  }
  return rules
}

/** The form fields, in legacy order: alias, alias target, subdomain, addon, type. */
export function addDomainFields (
  types: readonly string[],
  parents: readonly string[],
  hidden: DomainInputsHidden,
  t: Translate,
  domainErrors: string[] = [],
): ModalField[] {
  const parentOptions: ModalSelectOption[] = parents.map(domain => ({ label: domain, value: domain }))
  const typeOptions: ModalSelectOption[] = types.map(type => ({ label: t(`form.option.${type}`), value: type }))
  return [
    {
      label: t('form.label.alias'),
      name: 'domain',
      type: 'text',
      tooltip: 'tooltip.add_domain.domain.alias',
      rules: domainRules(t, { maxLength: true, noWww: false }),
      placeholder: t('form.placeholder.domain'),
      hidden: hidden.alias,
    },
    {
      label: t('form.label.domain'),
      name: 'target_domain',
      tooltip: 'tooltip.add_domain.target_domain',
      type: 'select',
      options: parentOptions,
      hidden: hidden.target,
    },
    {
      label: t('form.label.domain'),
      type: 'text-select',
      suffix: '.',
      textName: 'domain',
      selectName: 'parent_domain',
      tooltip: 'tooltip.add_domain.domain.sub',
      options: parentOptions,
      hidden: hidden.sub,
      rules: domainRules(t, { maxLength: false, noWww: true }),
    },
    {
      label: t('form.label.domain'),
      type: 'domain-input',
      textName: 'domain',
      tooltip: 'tooltip.add_domain.domain.addon',
      placeholder: 'domain.name',
      hidden: hidden.addon,
      rules: domainRules(t, { maxLength: false, noWww: true }),
      errorMessages: domainErrors,
    },
    {
      label: t('form.label.type'),
      name: 'type',
      tooltip: 'tooltip.add_domain.type',
      type: 'select',
      options: typeOptions,
      required: true,
    },
  ]
}

/** The buttons of the Add dialog: `button.domain.add` was `unshift`ed before the cancel button. */
export function addDomainButtons (t: Translate): ModalButton[] {
  return [
    { id: 'submit', label: t('button.domain.add'), color: 'primary' },
    cancelButton(t),
  ]
}

/**
 * The POST body and the domain it adds. A subdomain gets its parent appended (`postData.domain += "." + postData.parent_domain`); the
 * whole form goes out, the inputs of the other types included.
 */
export function addDomainPayload (values: AddDomainValues): AddDomainValues {
  const payload = { ...values }
  if (payload.type === 'sub') {
    payload.domain = `${payload.domain ?? ''}.${payload.parent_domain ?? ''}`
  }
  return payload
}

/** `form.label.subdomain` for a subdomain, `form.label.domain` otherwise (the `{type}` of the success message). */
export function addedDomainTypeLabel (type: string, t: Translate): string {
  return type === 'sub' ? t('form.label.subdomain') : t('form.label.domain')
}

/** The live `DnsOptions` is for the addon being typed, and for the dns-instructions step. */
export function showsAddDomainDnsOptions (mode: string, type: string | undefined): boolean {
  if (mode === 'dns-instructions') {
    return true
  }
  return mode === 'add-domain' && type === 'addon'
}

/**
 * A 422 answer of the add is about the submitted name, which the panel validates in the `domain` bag
 * (`{"errors":{"domain":["The domain field format is invalid."]}}`): the message belongs under the field, not only in a toast.
 */
export function isRefusedDomainAdd (error: unknown): boolean {
  return isApiError(error) && error.response?.status === 422
}
