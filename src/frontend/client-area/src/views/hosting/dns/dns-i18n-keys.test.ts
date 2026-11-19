import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The keys of the DNS screen must exist in both fixtures (app and lite).
// Keys with a count (`count`) are in the fixtures as `_one` / `_other`; then one of the forms is enough.

const here = dirname(fileURLToPath(import.meta.url))
// src/views/hosting/dns -> the package root (4 levels up).
const fixtureRoot = join(here, '../../../../parity/fixtures')

type Flat = Record<string, string>

function flatten (node: unknown, prefix = '', out: Flat = {}): Flat {
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      flatten(value, prefix ? `${prefix}.${key}` : key, out)
    }
  } else if (prefix) {
    out[prefix] = String(node)
  }
  return out
}

const app = flatten(JSON.parse(readFileSync(join(fixtureRoot, 'translation.en.json'), 'utf8')))
const lite = flatten(JSON.parse(readFileSync(join(fixtureRoot, 'lite/translation.en.json'), 'utf8')))

const hasKey = (flat: Flat, key: string) => key in flat || `${key}_one` in flat || `${key}_other` in flat

/**
 * Keys left out of the test: legacy shows the raw key, because the key `pointer` does not exist in the backend.
 * A 1:1 port keeps this gap, so the key is not checked in the fixtures and is not added to PAGE_KEYS.
 */
const EXCLUDED_KEYS = new Set([
  // Not in the backend, legacy shows the raw key.
  'tooltip.add_dns_record.pointer',
])

/** Keys of the DNS screen, as the `t(...)` calls pass them in DnsView.vue, dns-record-fields.ts and dns-modals.ts (direct levels). */
const PAGE_KEYS = [
  'heading.hosting.dns.title',
  'heading.hosting.dns.zones.title',
  'heading.hosting.dns.zones.tooltip',
  'heading.hosting.dns.modal.add.title',
  'heading.hosting.dns.modal.update.title',
  'heading.hosting.dns.modal.update.message',
  'heading.hosting.dns.modal.delete.title',
  'heading.hosting.dns.modal.proxy-warning.title',
  'heading.hosting.dns.modal.proxy-warning.info',
  'heading.hosting.dns.modal.proxy-warning.alert',
  'button.dns.add',
  'button.dns.edit',
  'button.dns.delete',
  'button.dns.proxy.enable',
  'button.update',
  'button.delete',
  'button.cancel',
  'button.click.enable',
  'button.click.disable',
  'notification.hosting.dns.add.success',
  'notification.hosting.dns.update.success',
  'notification.hosting.dns.delete.success',
  'message.emptyTable.dns.title',
  'message.emptyTable.dns.description',
  'message.confirmAction',
  'form.confirmDelete.dns',
  'form.validation.required',
  'form.validation.maxLength',
  'form.validation.gt',
  'form.option.issue',
  'form.option.issuewild',
  'form.option.iodef',
  'table.header.name',
  'table.header.ttl',
  'table.header.type',
  'table.header.record',
  // Fields of the record form (dns-record-fields.ts).
  'form.label.type',
  'form.label.name',
  'form.label.ttl',
  'form.label.address',
  'form.label.tag',
  'form.label.value',
  'form.label.flag',
  'form.label.cname',
  'form.label.target',
  'form.label.weight',
  'form.label.port',
  'form.label.priority',
  'form.label.txt',
  'form.label.destination',
  'form.label.nameserver',
  'form.label.pointer',
  'form.label.rdata',
  'form.label.proxy',
  // Field hints (tooltip: 'tooltip.add_dns_record.*' in dns-record-fields.ts); `pointer` is excluded (EXCLUDED_KEYS).
  'tooltip.add_dns_record.type',
  'tooltip.add_dns_record.name',
  'tooltip.add_dns_record.ttl',
  'tooltip.add_dns_record.address',
  'tooltip.add_dns_record.tag',
  'tooltip.add_dns_record.value',
  'tooltip.add_dns_record.flag',
  'tooltip.add_dns_record.cname',
  'tooltip.add_dns_record.target',
  'tooltip.add_dns_record.weight',
  'tooltip.add_dns_record.port',
  'tooltip.add_dns_record.priority',
  'tooltip.add_dns_record.txtdata',
  'tooltip.add_dns_record.preference',
  'tooltip.add_dns_record.exchange',
  'tooltip.add_dns_record.nameserver',
  'tooltip.add_dns_record.rdata',
  'tooltip.add_dns_record.proxy',
  // Account selector (the shared `ActiveServerAccountSelector`, used on the screen).
  'heading.hosting.summary.hostingAccount',
  'tooltip.hosting.summary.hostingAccount.tooltip',
]

// Literal keys from the view and the modules: the PAGE_KEYS list must contain all of them, otherwise a typo passes the test.
// Covers `t('…')`, `t('…', {…})` and key literals passed on (e.g. `tooltip: '…'`, `successKey`).
const SCANNED_FILES = ['DnsView.vue', 'dns-record-fields.ts', 'dns-modals.ts']
const KEY_LITERAL = /'((?:heading|button|notification|message|table|form|tooltip)\.[\w.-]+)'/g
const VIEW_KEYS = SCANNED_FILES.flatMap(file => {
  const source = readFileSync(join(here, file), 'utf8')
  return [...source.matchAll(KEY_LITERAL)].map(match => match[1])
})

describe('dns page i18n keys', () => {
  it('lists each key used by the page without duplicates', () => {
    expect(new Set(PAGE_KEYS).size).toBe(PAGE_KEYS.length)
  })

  it('keeps the excluded pointer key out of the page list', () => {
    for (const key of EXCLUDED_KEYS) {
      expect(PAGE_KEYS).not.toContain(key)
    }
  })

  it('covers every literal key used in DnsView.vue, dns-record-fields.ts and dns-modals.ts', () => {
    const missing = VIEW_KEYS.filter(key => !PAGE_KEYS.includes(key) && !EXCLUDED_KEYS.has(key))
    expect([...new Set(missing)]).toEqual([])
  })

  it.each(PAGE_KEYS)('%s exists in the app fixture', key => {
    expect(hasKey(app, key)).toBe(true)
  })

  it.each(PAGE_KEYS)('%s exists in the lite fixture', key => {
    expect(hasKey(lite, key)).toBe(true)
  })
})
