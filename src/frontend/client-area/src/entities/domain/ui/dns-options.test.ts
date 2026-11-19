import { describe, expect, it } from 'vitest'
import {
  cdnRecordsToDisplay,
  computedDomain,
  displayDnsOptions,
  dnsOptionsView,
  dnsServerRecordsToDisplay,
  domainDnsOptionsInput,
  hasDomainDnsInstructions,
  ipv4AddressesToDisplay,
  isApexARecord,
  recordTypeLabel,
} from './dns-options'

const cdn = [
  { type: 'A', name: 'example.org.', value: '203.0.113.5.' },
  { type: 'CNAME', name: 'www.example.org', value: 'example.org' },
  { type: 'TXT', name: '_acme-challenge.example.org', value: 'token' },
  { type: 'A', name: 'ignored.example.org', value: '' },
]

describe('displayDnsOptions', () => {
  it('is the display_options array and nothing otherwise', () => {
    expect(displayDnsOptions({ dnsSettings: { display_options: ['a_records'] } })).toEqual(['a_records'])
    expect(displayDnsOptions({ dnsSettings: { display_options: 'a_records' } })).toEqual([])
    expect(displayDnsOptions({ dnsSettings: null })).toEqual([])
  })
})

describe('computedDomain', () => {
  it('drops a leading www', () => {
    expect(computedDomain('www.example.org')).toBe('example.org')
    expect(computedDomain('example.org')).toBe('example.org')
    expect(computedDomain(undefined)).toBe('')
  })
})

describe('record helpers', () => {
  it('labels the third line by the record type', () => {
    expect(recordTypeLabel('A')).toBe('address')
    expect(recordTypeLabel('AAAA')).toBe('address')
    expect(recordTypeLabel('CNAME')).toBe('address')
    expect(recordTypeLabel('TXT')).toBe('value')
  })

  it('leaves the CIDR ranges out of the addresses', () => {
    expect(ipv4AddressesToDisplay(['192.0.2.10', '10.0.0.0/8'])).toEqual(['192.0.2.10'])
    expect(ipv4AddressesToDisplay(null)).toEqual([])
  })

  it('adds a CNAME per host CNAME after the zone records', () => {
    const rows = dnsServerRecordsToDisplay({
      domain: 'www.example.org',
      dnsServerRecords: [{ type: 'A', name: 'example.org', value: '192.0.2.10' }],
      hostCNames: ['host.example.net'],
    })
    expect(rows).toEqual([
      { type: 'A', name: 'example.org', value: '192.0.2.10' },
      { name: 'www.example.org', type: 'CNAME', value: 'host.example.net' },
    ])
  })

  it('knows the apex A record', () => {
    expect(isApexARecord({ type: 'A', name: 'example.org' }, 'www.example.org')).toBe(true)
    expect(isApexARecord({ type: 'CNAME', name: 'example.org' }, 'example.org')).toBe(false)
    expect(isApexARecord({ type: 'A', name: 'example.org' }, '')).toBe(false)
  })
})

describe('cdnRecordsToDisplay', () => {
  it('normalizes the records: type and value required, trailing dots removed', () => {
    expect(cdnRecordsToDisplay(cdn, 'example.org')).toEqual([
      { type: 'A', name: 'example.org', value: '203.0.113.5' },
      { type: 'CNAME', name: 'www.example.org', value: 'example.org' },
      { type: 'TXT', name: '_acme-challenge.example.org', value: 'token' },
    ])
  })

  it('renames the records for another domain and drops the ACME challenge', () => {
    expect(cdnRecordsToDisplay(cdn, 'other.net')).toEqual([
      { type: 'A', name: 'other.net', value: '203.0.113.5' },
      { type: 'CNAME', name: 'www.other.net', value: 'other.net' },
    ])
  })

  it('keeps the records while no domain is typed', () => {
    expect(cdnRecordsToDisplay(cdn, '')).toHaveLength(3)
  })
})

describe('dnsOptionsView', () => {
  const settings = { display_options: ['a_records', 'cname_record', 'ns_records', 'records_from_dns_server'] }

  it('shows each panel by its option and its data', () => {
    const view = dnsOptionsView({
      domain: 'example.org',
      dnsSettings: settings,
      onboardingSubdomain: 'onboarding.example.net',
      hasDnsServer: true,
      nameservers: ['ns1.example.net'],
      dnsServerRecords: [{ type: 'A', name: 'example.org', value: '192.0.2.10' }],
    })
    expect(view).toMatchObject({
      visible: true,
      titleVisible: true,
      showARecord: true,
      showCnameRecord: true,
      showNameservers: true,
      showDnsServerRecords: true,
      showRecordsPanel: true,
      showPanels: true,
    })
  })

  it('hides the panels that need a domain while there is none', () => {
    const view = dnsOptionsView({
      domain: '',
      dnsSettings: settings,
      onboardingSubdomain: 'onboarding.example.net',
      hasDnsServer: true,
      nameservers: ['ns1.example.net'],
      hostCNames: ['host.example.net'],
    })
    expect(view).toMatchObject({ showARecord: true, showCnameRecord: false, showNameservers: false, showDnsServerRecords: false })
  })

  it('needs a DNS server and nameservers for the nameservers panel', () => {
    const base = { domain: 'example.org', dnsSettings: settings }
    expect(dnsOptionsView({ ...base, hasDnsServer: false, nameservers: ['ns1'] }).showNameservers).toBe(false)
    expect(dnsOptionsView({ ...base, hasDnsServer: true, nameservers: [] }).showNameservers).toBe(false)
  })

  it('shows the CDN records instead of the A records', () => {
    const view = dnsOptionsView({ domain: 'example.org', dnsSettings: settings, cdnDnsRecords: cdn })
    expect(view.showCdnDnsRecords).toBe(true)
    expect(view.showARecord).toBe(false)
    expect(view.showRecordsPanel).toBe(true)
  })

  it('shows the CDN pending note without any display option', () => {
    const view = dnsOptionsView({ domain: 'example.org', dnsSettings: { display_options: [] }, cdnPending: true })
    expect(view).toMatchObject({ visible: true, showARecord: false, showRecordsPanel: true, showPanels: true })
  })

  it('shows nothing without options, CDN records or the pending note', () => {
    expect(dnsOptionsView({ domain: 'example.org', dnsSettings: { display_options: [] } }).visible).toBe(false)
  })

  it('shows no panel for a CNAME option without an onboarding subdomain', () => {
    const view = dnsOptionsView({ domain: 'example.org', dnsSettings: { display_options: ['cname_record'] } })
    expect(view).toMatchObject({ visible: true, showCnameRecord: false, showPanels: false })
  })

  it('hides the title for one option or when asked', () => {
    expect(dnsOptionsView({ dnsSettings: { display_options: ['a_records'] } }).titleVisible).toBe(false)
    expect(dnsOptionsView({ dnsSettings: settings }, true).titleVisible).toBe(false)
  })
})

describe('domainDnsOptionsInput', () => {
  it('maps the service and the account to the DnsOptions props', () => {
    expect(domainDnsOptionsInput(
      { dns_settings: { display_options: ['a_records'] }, dns_server_enabled: true },
      { ipv4_addresses: ['192.0.2.10'], host_c_names: ['host.example.net'], nameservers: ['ns1.example.net'] },
      'example.org',
    )).toEqual({
      domain: 'example.org',
      dnsSettings: { display_options: ['a_records'] },
      hasDnsServer: true,
      ipv4Addresses: ['192.0.2.10'],
      nameservers: ['ns1.example.net'],
      hostCNames: ['host.example.net'],
      onboardingSubdomain: null,
      dnsServerRecords: [],
      cdnDnsRecords: [],
    })
  })

  it('uses empty defaults for the missing fields', () => {
    expect(domainDnsOptionsInput({}, {}, undefined)).toEqual({
      domain: '',
      dnsSettings: {},
      hasDnsServer: false,
      ipv4Addresses: [],
      nameservers: [],
      hostCNames: [],
      onboardingSubdomain: null,
      dnsServerRecords: [],
      cdnDnsRecords: [],
    })
  })
})

describe('hasDomainDnsInstructions', () => {
  const withOptions = (...display: string[]) => ({ dns_settings: { display_options: display } })

  it('is true for a_records with an IPv4 address', () => {
    expect(hasDomainDnsInstructions(withOptions('a_records'), { ipv4_addresses: ['192.0.2.10'] }, 'example.org')).toBe(true)
  })

  it('is false for a_records with no IPv4 address (the panel would only hold the www line)', () => {
    expect(hasDomainDnsInstructions(withOptions('a_records'), { ipv4_addresses: [] }, 'example.org')).toBe(false)
    expect(hasDomainDnsInstructions(withOptions('a_records'), {}, 'example.org')).toBe(false)
  })

  it('is false for a_records with only a CIDR range', () => {
    expect(hasDomainDnsInstructions(withOptions('a_records'), { ipv4_addresses: ['10.0.0.0/8'] }, 'example.org')).toBe(false)
  })

  it('is false when the service has no DNS settings', () => {
    expect(hasDomainDnsInstructions({}, { ipv4_addresses: ['192.0.2.10'] }, 'example.org')).toBe(false)
  })

  it('is false for empty display options', () => {
    expect(hasDomainDnsInstructions(withOptions(), { ipv4_addresses: ['192.0.2.10'] }, 'example.org')).toBe(false)
  })

  it('is false for cname_record, which needs an onboarding subdomain the dialog never has', () => {
    expect(hasDomainDnsInstructions(withOptions('cname_record'), { host_c_names: ['host.example.net'] }, 'example.org')).toBe(false)
  })

  it('is false for ns_records without a DNS server', () => {
    expect(hasDomainDnsInstructions(
      { ...withOptions('ns_records'), dns_server_enabled: false },
      { nameservers: ['ns1.example.net'] },
      'example.org',
    )).toBe(false)
  })

  it('is false for ns_records with a DNS server but no nameservers', () => {
    expect(hasDomainDnsInstructions(
      { ...withOptions('ns_records'), dns_server_enabled: true },
      { nameservers: [] },
      'example.org',
    )).toBe(false)
  })

  it('is false for records_from_dns_server without host CNAMEs or zone records', () => {
    expect(hasDomainDnsInstructions(withOptions('records_from_dns_server'), { host_c_names: [] }, 'example.org')).toBe(false)
  })

  it('is true for ns_records with a DNS server and nameservers', () => {
    expect(hasDomainDnsInstructions(
      { ...withOptions('ns_records'), dns_server_enabled: true },
      { nameservers: ['ns1.example.net'] },
      'example.org',
    )).toBe(true)
  })
})
