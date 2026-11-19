import type { DnsRecord } from './dns.api'
import { describe, expect, it } from 'vitest'
import { dnsHeaders, showCannotManageAlert, toDnsRow, toRecordTypeOptions } from './dns'

function record (overrides: Partial<DnsRecord> = {}): DnsRecord {
  return { name: 'example.com', ttl: 3600, type: 'A', content: '1.2.3.4', ...overrides }
}

describe('dns', () => {
  describe('toDnsRow', () => {
    it('shows TTL 1 as Auto', () => {
      expect(toDnsRow(record({ ttl: 1 })).ttl).toBe('Auto')
    })

    it('keeps any other TTL as it is', () => {
      expect(toDnsRow(record({ ttl: 3600 })).ttl).toBe(3600)
      expect(toDnsRow(record({ ttl: '300' })).ttl).toBe('300')
    })

    it('adds a row that is not loading and keeps the other fields', () => {
      const row = toDnsRow(record({ line: 7, proxied: true }))

      expect(row).toEqual({ name: 'example.com', ttl: 3600, type: 'A', content: '1.2.3.4', line: 7, proxied: true, loading: false })
    })
  })

  describe('dnsHeaders', () => {
    it('has name, ttl, type, value and actions without proxy', () => {
      expect(dnsHeaders(false).map(header => header.value)).toEqual(['name', 'ttl', 'type', 'content', 'actions'])
    })

    it('puts the proxy column before the actions and makes it not sortable', () => {
      const headers = dnsHeaders(true)

      expect(headers.map(header => header.value)).toEqual(['name', 'ttl', 'type', 'content', 'proxied', 'actions'])
      expect(headers[4]).toEqual({ text: 'proxy', value: 'proxied', sortable: false })
    })
  })

  describe('toRecordTypeOptions', () => {
    it('makes a label and a value of each type', () => {
      expect(toRecordTypeOptions(['A', 'TXT'])).toEqual([
        { label: 'A', value: 'A' },
        { label: 'TXT', value: 'TXT' },
      ])
    })
  })

  describe('showCannotManageAlert', () => {
    const zone = { id: 5, name: 'example.com' }

    it('shows when the records are loaded, there are no types and a zone is selected', () => {
      expect(showCannotManageAlert({ recordsLoading: false, recordTypesCount: 0, zone })).toBe(true)
    })

    it('hides while the records load', () => {
      expect(showCannotManageAlert({ recordsLoading: true, recordTypesCount: 0, zone })).toBe(false)
    })

    it('hides when the provider has record types', () => {
      expect(showCannotManageAlert({ recordsLoading: false, recordTypesCount: 3, zone })).toBe(false)
    })

    it('hides without a zone or with a zone that has no id', () => {
      expect(showCannotManageAlert({ recordsLoading: false, recordTypesCount: 0, zone: null })).toBe(false)
      expect(showCannotManageAlert({ recordsLoading: false, recordTypesCount: 0, zone: {} })).toBe(false)
    })
  })
})
