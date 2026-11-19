import type { DnsRecordTypeOption } from './dns'
import type { DnsRecord } from './dns.api'
import type { FieldRule } from '@/shared/ui/form/field-rule'
import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
// Pure builders: the view owns the modal, the values and the requests.

export type Translate = (key: string, options?: Record<string, unknown>) => string

/** The record types the legacy type change knows; every other type takes the `default` branch. */
export type DnsTypeChangeKey = 'A' | 'AAAA' | 'CAA' | 'CNAME' | 'SRV' | 'TXT' | 'MX' | 'NS' | 'PTR' | 'default'

export interface DnsTypeVisibility {
  show: string[]
  hide: string[]
}

/** The fields of one record form, as the legacy code builds them. */
export interface DnsRecordFieldsOptions {
  type: string
  edit: boolean
  allowProxy: boolean
  recordTypes: DnsRecordTypeOption[]
}

/** The start values of the Add modal. */
export const ADD_ITEM: Readonly<Record<string, string>> = Object.freeze({ type: 'A', ttl: '14400', tag: 'issue' })

/** On a type change in Add. The lists are data; `applyTypeChange` applies `show`, then `hide`. */
export const TYPE_CHANGE_VISIBILITY: Record<DnsTypeChangeKey, DnsTypeVisibility> = {
  A: {
    show: ['address', 'proxied'],
    hide: ['flag', 'tag', 'value', 'cname', 'target', 'weight', 'port', 'priority', 'txtdata', 'preference', 'exchange', 'nameserver', 'pointer', 'rdata'],
  },
  AAAA: {
    show: ['address', 'proxied'],
    hide: ['flag', 'tag', 'value', 'cname', 'target', 'weight', 'port', 'priority', 'txtdata', 'preference', 'exchange', 'nameserver', 'pointer', 'rdata'],
  },
  CAA: {
    show: ['flag', 'tag', 'value'],
    hide: ['address', 'cname', 'target', 'weight', 'port', 'priority', 'txtdata', 'preference', 'exchange', 'proxied', 'nameserver', 'pointer', 'rdata'],
  },
  CNAME: {
    show: ['cname', 'proxied'],
    hide: ['address', 'flag', 'tag', 'value', 'target', 'weight', 'port', 'priority', 'txtdata', 'preference', 'exchange', 'nameserver', 'pointer', 'rdata'],
  },
  SRV: {
    show: ['target', 'weight', 'port', 'priority', 'proxied', 'nameserver', 'pointer', 'rdata'],
    hide: ['address', 'flag', 'tag', 'value', 'cname', 'txtdata', 'preference', 'exchange', 'proxied', 'nameserver', 'pointer', 'rdata'],
  },
  TXT: {
    show: ['txtdata'],
    hide: ['address', 'flag', 'tag', 'value', 'cname', 'target', 'weight', 'port', 'priority', 'preference', 'exchange', 'proxied', 'nameserver', 'pointer', 'rdata'],
  },
  MX: {
    show: ['preference', 'exchange'],
    hide: ['address', 'flag', 'tag', 'value', 'cname', 'target', 'weight', 'port', 'priority', 'txtdata', 'proxied', 'rdata', 'nameserver', 'pointer'],
  },
  NS: {
    show: ['nameserver'],
    hide: ['address', 'flag', 'tag', 'value', 'cname', 'target', 'weight', 'port', 'priority', 'txtdata', 'proxied', 'preference', 'exchange', 'rdata', 'pointer'],
  },
  PTR: {
    show: ['pointer'],
    hide: ['address', 'flag', 'tag', 'value', 'cname', 'target', 'weight', 'port', 'priority', 'txtdata', 'proxied', 'preference', 'exchange', 'nameserver', 'rdata'],
  },
  // Note: `nameserver` is not hidden here, as in legacy.
  default: {
    show: ['rdata'],
    hide: ['address', 'flag', 'tag', 'value', 'cname', 'target', 'weight', 'port', 'priority', 'txtdata', 'proxied', 'preference', 'exchange', 'pointer'],
  },
}

/** Initial `hidden` flags: the types for which each type-specific field is shown. */
const VISIBLE_FOR_TYPES: Record<string, readonly string[]> = {
  address: ['A', 'AAAA'],
  proxied: ['A', 'AAAA', 'CNAME'],
  tag: ['CAA'],
  value: ['CAA'],
  flag: ['CAA'],
  cname: ['CNAME'],
  target: ['SRV'],
  weight: ['SRV'],
  port: ['SRV'],
  priority: ['SRV'],
  txtdata: ['TXT'],
  preference: ['MX'],
  exchange: ['MX'],
  nameserver: ['NS'],
  pointer: ['PTR'],
}

/** Legacy initial `rdata` is hidden for these types; every other type (SOA, ...) shows it. */
const RDATA_HIDDEN_FOR_TYPES: ReadonlySet<string> = new Set(['A', 'AAAA', 'CAA', 'CNAME', 'MX', 'SRV', 'TXT', 'NS', 'PTR'])

/** The initial `hidden` of a field for the selected type. Fields without a type list (name, ttl, type) are always shown. */
function hiddenAtStart (name: string, type: string): boolean {
  if (name === 'rdata') {
    return RDATA_HIDDEN_FOR_TYPES.has(type)
  }
  const visibleFor = VISIBLE_FOR_TYPES[name]
  return visibleFor ? !visibleFor.includes(type) : false
}

/** Legacy `required` message plus the `maxLength` 255 of name and address. */
function textRules (t: Translate, fieldLabel: string): FieldRule[] {
  return [
    value => !!value || t('form.validation.required', { field: fieldLabel }),
    value => (!!value && String(value).length <= 255) || t('form.validation.maxLength', { field: fieldLabel, length: 255 }),
  ]
}

/** Legacy TTL rules: `!!v` (so the number `0` fails, the string `'0'` passes) and `v >= 0` (so `Auto` and `-1` fail). */
function ttlRules (t: Translate): FieldRule[] {
  const fieldLabel = t('form.label.ttl')
  return [
    value => !!value || t('form.validation.required', { field: fieldLabel }),
    value => Number(value) >= 0 || t('form.validation.gt', { field: fieldLabel, number: 0 }),
  ]
}

/**
 * The fields of the record form in legacy order. `name`, `ttl` and `address` carry the
 * legacy rules; the proxy switch is added only when the provider allows the Cloudflare proxy.
 */
export function dnsRecordFields (t: Translate, options: DnsRecordFieldsOptions): ModalField[] {
  const { type, edit, allowProxy, recordTypes } = options
  const hidden = (name: string): boolean => hiddenAtStart(name, type)

  const fields: ModalField[] = [
    {
      type: 'select',
      label: t('form.label.type'),
      name: 'type',
      tooltip: 'tooltip.add_dns_record.type',
      readonly: edit,
      options: recordTypes.map(({ label, value }) => ({ label, value })),
    },
    {
      type: 'text',
      label: t('form.label.name'),
      name: 'name',
      tooltip: 'tooltip.add_dns_record.name',
      rules: textRules(t, t('form.label.name')),
    },
    {
      type: 'text',
      label: t('form.label.ttl'),
      name: 'ttl',
      tooltip: 'tooltip.add_dns_record.ttl',
      rules: ttlRules(t),
    },
    {
      type: 'text',
      label: t('form.label.address'),
      name: 'address',
      tooltip: 'tooltip.add_dns_record.address',
      hidden: hidden('address'),
      rules: textRules(t, t('form.label.address')),
    },
    {
      type: 'select',
      label: t('form.label.tag'),
      name: 'tag',
      tooltip: 'tooltip.add_dns_record.tag',
      hidden: hidden('tag'),
      options: [
        { label: t('form.option.issue'), value: 'issue' },
        { label: t('form.option.issuewild'), value: 'issuewild' },
        { label: t('form.option.iodef'), value: 'iodef' },
      ],
    },
    {
      type: 'text',
      label: t('form.label.value'),
      name: 'value',
      tooltip: 'tooltip.add_dns_record.value',
      hidden: hidden('value'),
    },
    {
      type: 'checkbox',
      label: t('form.label.flag'),
      name: 'flag',
      tooltip: 'tooltip.add_dns_record.flag',
      hidden: hidden('flag'),
    },
    {
      type: 'text',
      label: t('form.label.cname'),
      name: 'cname',
      tooltip: 'tooltip.add_dns_record.cname',
      hidden: hidden('cname'),
    },
    {
      type: 'text',
      label: t('form.label.target'),
      name: 'target',
      tooltip: 'tooltip.add_dns_record.target',
      hidden: hidden('target'),
    },
    {
      type: 'text',
      label: t('form.label.weight'),
      name: 'weight',
      tooltip: 'tooltip.add_dns_record.weight',
      hidden: hidden('weight'),
    },
    {
      type: 'text',
      label: t('form.label.port'),
      name: 'port',
      tooltip: 'tooltip.add_dns_record.port',
      hidden: hidden('port'),
    },
    {
      type: 'text',
      label: t('form.label.priority'),
      name: 'priority',
      tooltip: 'tooltip.add_dns_record.priority',
      hidden: hidden('priority'),
    },
    {
      type: 'textarea',
      label: t('form.label.txt'),
      name: 'txtdata',
      tooltip: 'tooltip.add_dns_record.txtdata',
      hidden: hidden('txtdata'),
    },
    {
      type: 'text',
      label: t('form.label.priority'),
      name: 'preference',
      tooltip: 'tooltip.add_dns_record.preference',
      hidden: hidden('preference'),
    },
    {
      type: 'text',
      label: t('form.label.destination'),
      name: 'exchange',
      tooltip: 'tooltip.add_dns_record.exchange',
      hidden: hidden('exchange'),
    },
    {
      type: 'text',
      label: t('form.label.nameserver'),
      name: 'nameserver',
      tooltip: 'tooltip.add_dns_record.nameserver',
      hidden: hidden('nameserver'),
    },
    {
      type: 'text',
      label: t('form.label.pointer'),
      name: 'pointer',
      tooltip: 'tooltip.add_dns_record.pointer',
      hidden: hidden('pointer'),
    },
    {
      type: 'text',
      label: t('form.label.rdata'),
      name: 'rdata',
      tooltip: 'tooltip.add_dns_record.rdata',
      hidden: hidden('rdata'),
    },
  ]

  if (allowProxy) {
    fields.push({
      type: 'switch',
      label: t('form.label.proxy'),
      name: 'proxied',
      tooltip: 'tooltip.add_dns_record.proxy',
      hidden: hidden('proxied'),
    })
  }

  return fields
}

function fieldName (field: ModalField): string | undefined {
  return 'name' in field ? field.name : undefined
}

/**
 * On a type change: a new array with the `hidden` flags recomputed. `show` is applied first and `hide` second, so a name
 * in both lists ends hidden (the SRV branch). Fields outside the lists keep their `hidden`; names missing from `fields` are skipped.
 */
export function applyTypeChange (fields: ModalField[], type: string): ModalField[] {
  const hasOwn = Object.prototype.hasOwnProperty.call(TYPE_CHANGE_VISIBILITY, type)
  const { show, hide } = TYPE_CHANGE_VISIBILITY[hasOwn ? (type as DnsTypeChangeKey) : 'default']

  return fields.map(field => {
    const name = fieldName(field)
    if (name === undefined) {
      return { ...field }
    }
    if (hide.includes(name)) {
      return { ...field, hidden: true }
    }
    if (show.includes(name)) {
      return { ...field, hidden: false }
    }
    return { ...field }
  })
}

/**
 * Copies the item, and every named field without a value gets `null`.
 * The result is the body of POST and PUT, so the fields of the row that the form does not show are sent back too, as legacy does.
 */
export function initialRecordValues (item: Record<string, unknown>, fields: ModalField[]): Record<string, unknown> {
  const values: Record<string, unknown> = { ...item }
  for (const field of fields) {
    const name = fieldName(field)
    if (name !== undefined && values[name] === undefined) {
      values[name] = null
    }
  }
  return values
}

/** A TXT value in quotes is shown without them. Works on a copy; the row is kept. */
export function stripTxtQuotes<T extends DnsRecord> (record: T): T {
  const { txtdata } = record
  const quoted = record.type === 'TXT'
    && typeof txtdata === 'string'
    && txtdata.length >= 2
    && txtdata.at(0) === '"'
    && txtdata.at(-1) === '"'
  if (!quoted) {
    return { ...record }
  }
  return { ...record, txtdata: txtdata.slice(1, -1) }
}

/** The legacy `line`, or its `Line` spelling when `line` is `undefined`. `0` stays `0`. */
function lineOf (record: DnsRecord): number | string | undefined {
  return record.line === undefined ? record.Line : record.line
}

/** The id in `PUT …/records/{id}`: the line, else the name. */
export function recordIdForUpdate (record: DnsRecord): number | string {
  const line = lineOf(record)
  return line === undefined ? record.name : line
}

/** The path in `DELETE …/records/{path}`: the line, else `name?type=TYPE`. */
export function recordPathForDelete (record: DnsRecord): string {
  const line = lineOf(record)
  return line === undefined ? `${record.name}?type=${record.type}` : String(line)
}
