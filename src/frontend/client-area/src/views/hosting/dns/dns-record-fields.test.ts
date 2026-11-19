import type { DnsRecord } from './dns.api'
import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
import { describe, expect, it } from 'vitest'
import {
  ADD_ITEM,
  applyTypeChange,
  dnsRecordFields,
  initialRecordValues,
  recordIdForUpdate,
  recordPathForDelete,
  stripTxtQuotes,
} from './dns-record-fields'

const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key)

const RECORD_TYPES = [
  { label: 'A', value: 'A' },
  { label: 'TXT', value: 'TXT' },
]

function build (type: string, extra: { edit?: boolean, allowProxy?: boolean } = {}): ModalField[] {
  return dnsRecordFields(t, { type, edit: extra.edit ?? false, allowProxy: extra.allowProxy ?? true, recordTypes: RECORD_TYPES })
}

function nameOf (field: ModalField): string | undefined {
  return 'name' in field ? field.name : undefined
}

/** Names of the fields shown at start (not hidden). */
function visibleNames (fields: ModalField[]): string[] {
  return fields.filter(field => !field.hidden).map(field => nameOf(field) ?? '')
}

function fieldNamed (fields: ModalField[], name: string): ModalField {
  const field = fields.find(item => nameOf(item) === name)
  if (!field) {
    throw new Error(`no field ${name}`)
  }
  return field
}

/** The rules of a named field, run on a value: the first failing message, or `true` when all pass. */
function check (fields: ModalField[], name: string, value: unknown): boolean | string {
  const field = fieldNamed(fields, name)
  for (const rule of field.rules ?? []) {
    const result = rule(value)
    if (result !== true) {
      return result
    }
  }
  return true
}

const ALL_NAMES = [
  'type', 'name', 'ttl', 'address', 'tag', 'value', 'flag', 'cname', 'target', 'weight', 'port', 'priority',
  'txtdata', 'preference', 'exchange', 'nameserver', 'pointer', 'rdata', 'proxied',
]

describe('dnsRecordFields', () => {
  it('builds the fields in legacy order, with proxied last only when the proxy is allowed', () => {
    expect(build('A').map(field => nameOf(field))).toEqual(ALL_NAMES)
    expect(build('A', { allowProxy: false }).map(field => nameOf(field))).toEqual(ALL_NAMES.slice(0, -1))
  })

  it('uses the legacy field types, labels and tooltips', () => {
    const fields = build('A')

    expect(fieldNamed(fields, 'type')).toMatchObject({ type: 'select', label: 'form.label.type', tooltip: 'tooltip.add_dns_record.type', options: RECORD_TYPES })
    expect(fieldNamed(fields, 'txtdata')).toMatchObject({ type: 'textarea', label: 'form.label.txt', tooltip: 'tooltip.add_dns_record.txtdata' })
    expect(fieldNamed(fields, 'flag')).toMatchObject({ type: 'checkbox', label: 'form.label.flag' })
    expect(fieldNamed(fields, 'proxied')).toMatchObject({ type: 'switch', label: 'form.label.proxy', tooltip: 'tooltip.add_dns_record.proxy' })
    expect(fieldNamed(fields, 'preference')).toMatchObject({ label: 'form.label.priority' })
    expect(fieldNamed(fields, 'priority')).toMatchObject({ label: 'form.label.priority' })
    expect(fieldNamed(fields, 'exchange')).toMatchObject({ label: 'form.label.destination' })
  })

  it('makes the type readonly only in Edit', () => {
    expect(fieldNamed(build('A'), 'type')).toMatchObject({ readonly: false })
    expect(fieldNamed(build('A', { edit: true }), 'type')).toMatchObject({ readonly: true })
  })

  it('offers the three CAA tags with the legacy labels', () => {
    expect(fieldNamed(build('CAA'), 'tag')).toMatchObject({
      options: [
        { label: 'form.option.issue', value: 'issue' },
        { label: 'form.option.issuewild', value: 'issuewild' },
        { label: 'form.option.iodef', value: 'iodef' },
      ],
    })
  })

  it('starts with the legacy visibility for A and AAAA: address and proxy only, plus name, ttl and type', () => {
    expect(visibleNames(build('A'))).toEqual(['type', 'name', 'ttl', 'address', 'proxied'])
    expect(visibleNames(build('AAAA'))).toEqual(['type', 'name', 'ttl', 'address', 'proxied'])
  })

  it('starts with the legacy visibility for CAA, CNAME, SRV, TXT, MX, NS and PTR', () => {
    expect(visibleNames(build('CAA'))).toEqual(['type', 'name', 'ttl', 'tag', 'value', 'flag'])
    expect(visibleNames(build('CNAME'))).toEqual(['type', 'name', 'ttl', 'cname', 'proxied'])
    expect(visibleNames(build('SRV'))).toEqual(['type', 'name', 'ttl', 'target', 'weight', 'port', 'priority'])
    expect(visibleNames(build('TXT'))).toEqual(['type', 'name', 'ttl', 'txtdata'])
    expect(visibleNames(build('MX'))).toEqual(['type', 'name', 'ttl', 'preference', 'exchange'])
    expect(visibleNames(build('NS'))).toEqual(['type', 'name', 'ttl', 'nameserver'])
    expect(visibleNames(build('PTR'))).toEqual(['type', 'name', 'ttl', 'pointer'])
  })

  it('starts with rdata shown for a type outside the list (SOA), and nothing type-specific', () => {
    expect(visibleNames(build('SOA'))).toEqual(['type', 'name', 'ttl', 'rdata'])
  })

  it('hides rdata for the listed types and shows it for the others', () => {
    for (const type of ['A', 'AAAA', 'CAA', 'CNAME', 'MX', 'SRV', 'TXT', 'NS', 'PTR']) {
      expect(fieldNamed(build(type), 'rdata').hidden).toBe(true)
    }
    expect(fieldNamed(build('SOA'), 'rdata').hidden).toBe(false)
  })

  it('shows proxied only for A, AAAA and CNAME', () => {
    expect(fieldNamed(build('A'), 'proxied').hidden).toBe(false)
    expect(fieldNamed(build('AAAA'), 'proxied').hidden).toBe(false)
    expect(fieldNamed(build('CNAME'), 'proxied').hidden).toBe(false)
    expect(fieldNamed(build('TXT'), 'proxied').hidden).toBe(true)
    expect(fieldNamed(build('SOA'), 'proxied').hidden).toBe(true)
  })

  it('applies the legacy rules to name, ttl and address only', () => {
    const fields = build('A')
    for (const field of fields) {
      const named = nameOf(field)
      const hasRules = field.rules !== undefined && field.rules.length > 0
      expect({ named, hasRules }).toEqual({ named, hasRules: ['name', 'ttl', 'address'].includes(named ?? '') })
    }
  })

  it('rejects a 256-character name and accepts a 255-character one', () => {
    const fields = build('A')
    expect(check(fields, 'name', 'a'.repeat(256))).toBe('form.validation.maxLength:{"field":"form.label.name","length":255}')
    expect(check(fields, 'name', 'a'.repeat(255))).toBe(true)
    expect(check(fields, 'name', '')).toBe('form.validation.required:{"field":"form.label.name"}')
  })

  it('applies the same length and required rules to address', () => {
    const fields = build('A')
    expect(check(fields, 'address', 'a'.repeat(256))).toContain('form.validation.maxLength')
    expect(check(fields, 'address', '')).toContain('form.validation.required')
    expect(check(fields, 'address', '192.0.2.1')).toBe(true)
  })

  it('rejects ttl Auto and -1, accepts the string 0, and rejects the number 0 as legacy does', () => {
    const fields = build('A')
    expect(check(fields, 'ttl', 'Auto')).toContain('form.validation.gt')
    expect(check(fields, 'ttl', '-1')).toContain('form.validation.gt')
    expect(check(fields, 'ttl', '0')).toBe(true)
    expect(check(fields, 'ttl', 0)).toContain('form.validation.required')
    expect(check(fields, 'ttl', '14400')).toBe(true)
  })
})

describe('applyTypeChange', () => {
  it('shows exactly the target, weight, port and priority for SRV', () => {
    const next = applyTypeChange(build('A'), 'SRV')

    expect(visibleNames(next)).toEqual(['type', 'name', 'ttl', 'target', 'weight', 'port', 'priority'])
  })

  it('shows the address and proxy for A and AAAA', () => {
    expect(visibleNames(applyTypeChange(build('TXT'), 'A'))).toEqual(['type', 'name', 'ttl', 'address', 'proxied'])
    expect(visibleNames(applyTypeChange(build('TXT'), 'AAAA'))).toEqual(['type', 'name', 'ttl', 'address', 'proxied'])
  })

  it('shows the CAA fields', () => {
    expect(visibleNames(applyTypeChange(build('A'), 'CAA'))).toEqual(['type', 'name', 'ttl', 'tag', 'value', 'flag'])
  })

  it('shows the cname and proxy for CNAME', () => {
    expect(visibleNames(applyTypeChange(build('A'), 'CNAME'))).toEqual(['type', 'name', 'ttl', 'cname', 'proxied'])
  })

  it('shows the txt field for TXT', () => {
    expect(visibleNames(applyTypeChange(build('A'), 'TXT'))).toEqual(['type', 'name', 'ttl', 'txtdata'])
  })

  it('shows the preference and exchange for MX', () => {
    expect(visibleNames(applyTypeChange(build('A'), 'MX'))).toEqual(['type', 'name', 'ttl', 'preference', 'exchange'])
  })

  it('shows the nameserver for NS', () => {
    expect(visibleNames(applyTypeChange(build('A'), 'NS'))).toEqual(['type', 'name', 'ttl', 'nameserver'])
  })

  it('shows the pointer for PTR', () => {
    expect(visibleNames(applyTypeChange(build('A'), 'PTR'))).toEqual(['type', 'name', 'ttl', 'pointer'])
  })

  it('takes the default branch for an unlisted type: rdata shown, and nameserver left as it was', () => {
    const fromNs = applyTypeChange(build('NS'), 'SOA')
    expect(visibleNames(fromNs)).toEqual(['type', 'name', 'ttl', 'nameserver', 'rdata'])
    expect(fieldNamed(fromNs, 'nameserver').hidden).toBe(false)
  })

  it('takes the default branch for SOA, which hides the type-specific fields it does not show', () => {
    const next = applyTypeChange(build('A'), 'SOA')
    expect(visibleNames(next)).toEqual(['type', 'name', 'ttl', 'rdata'])
  })

  it('leaves fields outside the lists with their hidden flag', () => {
    const fields = build('A')
    const next = applyTypeChange(fields, 'TXT')

    expect(fieldNamed(next, 'name').hidden).toBeFalsy()
    expect(fieldNamed(next, 'ttl').hidden).toBeFalsy()
    expect(fieldNamed(next, 'type').hidden).toBeFalsy()
    expect(fieldNamed(next, 'address').hidden).toBe(true)
  })

  it('returns new objects and does not mutate the input', () => {
    const fields = build('A')
    const snapshot = JSON.stringify(fields.map(field => ({ ...field, rules: undefined })))
    const next = applyTypeChange(fields, 'SRV')

    expect(next).not.toBe(fields)
    expect(next[0]).not.toBe(fields[0])
    expect(JSON.stringify(fields.map(field => ({ ...field, rules: undefined })))).toBe(snapshot)
  })

  it('skips names that are not in the fields (no proxy field without allowProxy)', () => {
    const fields = build('A', { allowProxy: false })
    const next = applyTypeChange(fields, 'A')

    expect(next.map(field => nameOf(field))).toEqual(ALL_NAMES.slice(0, -1))
  })
})

describe('ADD_ITEM', () => {
  it('starts an Add with type A, TTL 14400 and the CAA tag issue (legacy values)', () => {
    expect({ ...ADD_ITEM }).toEqual({ type: 'A', ttl: '14400', tag: 'issue' })
  })
})

describe('initialRecordValues', () => {
  it('adds null for each named field that has no value and keeps the values of the row', () => {
    const fields = build('A')
    const values = initialRecordValues({ type: 'A', name: 'www', ttl: 300, content: '192.0.2.1' }, fields)

    expect(values).toMatchObject({ type: 'A', name: 'www', ttl: 300, content: '192.0.2.1' })
    expect(values.address).toBeNull()
    expect(values.proxied).toBeNull()
    expect(values.txtdata).toBeNull()
    expect(values.tag).toBeNull()
  })

  it('keeps a falsy value such as 0 and does not overwrite it with null', () => {
    const values = initialRecordValues({ line: 0, ttl: 0 }, build('A'))

    expect(values.ttl).toBe(0)
    expect(values.line).toBe(0)
  })

  it('does not mutate the item', () => {
    const item = { type: 'A', name: 'www' }
    initialRecordValues(item, build('A'))

    expect(item).toEqual({ type: 'A', name: 'www' })
  })
})

describe('recordIdForUpdate', () => {
  it('uses line, and keeps line 0', () => {
    expect(recordIdForUpdate({ line: 0, Line: 5, name: 'www', type: 'A', content: '' } as DnsRecord)).toBe(0)
  })

  it('falls back to Line when line is undefined', () => {
    expect(recordIdForUpdate({ Line: 7, name: 'www', type: 'A', content: '' } as DnsRecord)).toBe(7)
  })

  it('falls back to the name when both line and Line are undefined', () => {
    expect(recordIdForUpdate({ name: 'www', type: 'A', content: '' } as DnsRecord)).toBe('www')
  })
})

describe('recordPathForDelete', () => {
  it('uses line, and keeps line 0 as "0"', () => {
    expect(recordPathForDelete({ line: 0, name: 'www', type: 'A', content: '' } as DnsRecord)).toBe('0')
  })

  it('falls back to Line', () => {
    expect(recordPathForDelete({ Line: 9, name: 'www', type: 'A', content: '' } as DnsRecord)).toBe('9')
  })

  it('falls back to name?type= when there is no line', () => {
    expect(recordPathForDelete({ name: '_acme', type: 'TXT', content: '' } as DnsRecord)).toBe('_acme?type=TXT')
  })
})

describe('stripTxtQuotes', () => {
  it('removes the quotes around a TXT value, on a copy', () => {
    const record = { type: 'TXT', name: 'x', txtdata: '"hello"', content: '' } as DnsRecord
    const stripped = stripTxtQuotes(record)

    expect(stripped.txtdata).toBe('hello')
    expect(record.txtdata).toBe('"hello"')
    expect(stripped).not.toBe(record)
  })

  it('does not strip a single quote character, nor a value without quotes', () => {
    expect(stripTxtQuotes({ type: 'TXT', name: 'x', txtdata: '"', content: '' } as DnsRecord).txtdata).toBe('"')
    expect(stripTxtQuotes({ type: 'TXT', name: 'x', txtdata: 'plain', content: '' } as DnsRecord).txtdata).toBe('plain')
  })

  it('leaves a non-TXT record alone, even when its value is quoted', () => {
    const record = { type: 'A', name: 'x', txtdata: '"hello"', content: '' } as DnsRecord
    const stripped = stripTxtQuotes(record)

    expect(stripped).toEqual(record)
    expect(stripped).not.toBe(record)
  })
})
