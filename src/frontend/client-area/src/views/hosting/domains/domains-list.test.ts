import { describe, expect, it } from 'vitest'
import { domainHeaders, domainTypeText, needsNsVerification, resolveProxyPointsTo, safeHttpUrl, toDomainRow, usesProxyPointsTo, verificationIpv4, zoneConfigurationRecords } from './domains-list'

const t = (key: string) => `t:${key}`
const NOW = new Date('2026-10-07T10:00:00Z')

function raw (overrides: Record<string, unknown> = {}) {
  return { domain: 'a.test', type: 'addon', capabilities: {}, ...overrides } as never
}

describe('domainTypeText', () => {
  it('translates every type', () => {
    expect(domainTypeText('addon', {}, t)).toBe('t:heading.hosting.domains.domain.addon')
    expect(domainTypeText('sub', {}, t)).toBe('t:heading.hosting.domains.domain.sub')
    expect(domainTypeText('alias', {}, t)).toBe('t:heading.hosting.domains.domain.alias')
    expect(domainTypeText('main', { hosting_server_type: 'cpanel' }, t)).toBe('t:heading.hosting.domains.domain.main')
  })

  it('reads a main domain of a wp-cloud service as primary', () => {
    expect(domainTypeText('main', { hosting_server_type: 'wp-cloud' }, t)).toBe('t:heading.hosting.domains.domain.primary')
  })

  it('keeps an unknown type as it is', () => {
    expect(domainTypeText('weird', {}, t)).toBe('weird')
  })
})

describe('toDomainRow', () => {
  const context = { service: {}, account: { id: 11 }, t, now: NOW }

  it('starts with the DNS verdict ok and the certificates loading', () => {
    const row = toDomainRow(raw({ updated_at: '2026-10-07T07:00:00Z' }), context)

    expect(row).toMatchObject({
      domain: 'a.test',
      nsStatus: 'ok',
      sslStatusLoading: true,
      sslDetectedCert: null,
      sslInstalledCert: null,
      editSslButtonLoading: false,
      serverAccountId: 11,
      type_text: 't:heading.hosting.domains.domain.addon',
      updated_at_text: '3 hours ago',
    })
  })

  it('writes points_to from the proxy rules, or null', () => {
    const rules = [{ id: 1, transport: 'http', upstream_port: 8080, upstream_protocol: 'http', listen_port: 80, server_name: 'a.test', upstream_host: 'app' }]

    expect(toDomainRow(raw(), { ...context, proxyRules: rules }).points_to).toBe('app:8080')
    expect(toDomainRow(raw({ domain: 'b.test' }), { ...context, proxyRules: rules }).points_to).toBeNull()
    expect(toDomainRow(raw(), context).points_to).toBeNull()
  })

  it('shows a dash for a domain that was never updated', () => {
    expect(toDomainRow(raw({ updated_at: null }), context).updated_at_text).toBe('-')
  })
})

describe('needsNsVerification', () => {
  it('skips a sub domain and a domain without a DNS zone', () => {
    expect(needsNsVerification({ type: 'addon', has_dns_zone: true })).toBe(true)
    expect(needsNsVerification({ type: 'main', has_dns_zone: true })).toBe(true)
    expect(needsNsVerification({ type: 'sub', has_dns_zone: true })).toBe(false)
    expect(needsNsVerification({ type: 'addon', has_dns_zone: false })).toBe(false)
    expect(needsNsVerification({ type: 'addon' })).toBe(false)
  })
})

describe('verificationIpv4', () => {
  const account = { ipv4_addresses: ['192.0.2.10'] }

  it('prefers the A records of the CDN', () => {
    const cdn = [
      { type: 'A', value: '198.51.100.1' },
      { type: 'CNAME', value: 'edge.example.net' },
      { type: 'A', value: '' },
      { type: 'A', value: '198.51.100.2' },
    ]
    expect(verificationIpv4({ cdn_dns_records: cdn }, account)).toEqual(['198.51.100.1', '198.51.100.2'])
  })

  it('falls back to the addresses of the account', () => {
    expect(verificationIpv4({ cdn_dns_records: [{ type: 'CNAME', value: 'x' }] }, account)).toEqual(['192.0.2.10'])
    expect(verificationIpv4({ cdn_dns_records: null }, account)).toEqual(['192.0.2.10'])
    expect(verificationIpv4({}, {})).toEqual([])
  })
})

describe('zoneConfigurationRecords', () => {
  it('reads the records of the zone, or none', () => {
    const records = [{ type: 'A', name: 'a.test', value: '192.0.2.10' }]
    expect(zoneConfigurationRecords({ domain_zone: { details: { configuration_records: records } } })).toBe(records)
    expect(zoneConfigurationRecords({ domain_zone: null })).toEqual([])
    expect(zoneConfigurationRecords({})).toEqual([])
  })
})

describe('domainHeaders', () => {
  it('lists the five columns', () => {
    expect(domainHeaders({}).map(header => header.value)).toEqual(['domain', 'ssl_status', 'type', 'document_root', 'actions'])
    expect(domainHeaders({}).map(header => header.sortable)).toEqual([true, true, true, true, undefined])
  })

  it('reads the document root column as pointsTo with the flag, and as documentRoot without it', () => {
    expect(domainHeaders({}, true).find(header => header.value === 'document_root')?.text).toBe('pointsTo')
    expect(domainHeaders({}).find(header => header.value === 'document_root')?.text).toBe('documentRoot')
  })

  it('has no document root column for wp-cloud with or without the flag', () => {
    expect(domainHeaders({ hosting_server_type: 'wp-cloud' }, true).map(header => header.value)).toEqual(['domain', 'ssl_status', 'type', 'actions'])
    expect(domainHeaders({ hosting_server_type: 'wp-cloud' }, false).map(header => header.value)).toEqual(['domain', 'ssl_status', 'type', 'actions'])
  })

  it('drops the document root column of a wp-cloud service', () => {
    expect(domainHeaders({ hosting_server_type: 'wp-cloud' }).map(header => header.value)).toEqual(['domain', 'ssl_status', 'type', 'actions'])
  })
})

describe('safeHttpUrl', () => {
  it('passes http and https, in any case', () => {
    expect(safeHttpUrl('https://example.com/a')).toBe('https://example.com/a')
    expect(safeHttpUrl('HTTP://example.com')).toBe('HTTP://example.com')
  })

  it('drops other schemes, bare hosts and empty values', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeHttpUrl('example.com')).toBeUndefined()
    expect(safeHttpUrl('')).toBeUndefined()
    expect(safeHttpUrl(null)).toBeUndefined()
  })
})

describe('usesProxyPointsTo', () => {
  it('is true for panelalpha or single-server, false otherwise', () => {
    expect(usesProxyPointsTo({ hosting_server_type: 'panelalpha' }, false)).toBe(true)
    expect(usesProxyPointsTo({ hosting_server_type: 'cpanel' }, true)).toBe(true)
    expect(usesProxyPointsTo({ hosting_server_type: 'cpanel' }, false)).toBe(false)
  })
})

describe('resolveProxyPointsTo', () => {
  function rule (overrides: Record<string, unknown> = {}) {
    return { id: 1, transport: 'http', upstream_host: 'app', upstream_port: 8080, upstream_protocol: 'http', listen_port: 80, server_name: 'a.test', enabled: true, ...overrides } as never
  }

  it('is null without rules', () => {
    expect(resolveProxyPointsTo('a.test', [])).toBeNull()
  })

  it('ignores a tcp rule, a disabled one, another server_name and a rule without an upstream', () => {
    expect(resolveProxyPointsTo('a.test', [
      rule({ transport: 'tcp' }),
      rule({ enabled: false }),
      rule({ server_name: 'b.test' }),
      rule({ upstream_host: '' }),
      rule({ upstream_port: 0 }),
    ])).toBeNull()
  })

  it('prefers 80, then 443, then the first one', () => {
    expect(resolveProxyPointsTo('a.test', [rule({ listen_port: 443, upstream_port: 1 }), rule({ listen_port: 80, upstream_port: 2 })])).toBe('app:2')
    expect(resolveProxyPointsTo('a.test', [rule({ listen_port: 8000, upstream_port: 3 }), rule({ listen_port: 443, upstream_port: 4 })])).toBe('app:4')
    expect(resolveProxyPointsTo('a.test', [rule({ listen_port: 8000, upstream_port: 5 }), rule({ listen_port: 9000, upstream_port: 6 })])).toBe('app:5')
  })

  it('reads listen_port given as a string and treats a missing enabled as enabled', () => {
    expect(resolveProxyPointsTo('a.test', [rule({ listen_port: '443', upstream_port: 7 }), rule({ listen_port: '80', upstream_port: 8, enabled: undefined })])).toBe('app:8')
  })
})
