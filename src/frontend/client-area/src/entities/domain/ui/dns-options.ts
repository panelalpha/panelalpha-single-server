// The logic of `DnsOptions` (app variant with the CDN records and `cdnPending`) as pure functions.

export interface DnsRecordInput {
  [key: string]: unknown
  type?: string
  name?: string
  value?: string
}

export interface DnsRecordRow {
  name: string
  type: string
  value: string
}

export interface DnsOptionsInput {
  domain?: string | null
  onboardingSubdomain?: string | null
  dnsSettings?: { display_options?: unknown } | null
  hasDnsServer?: boolean
  ipv4Addresses?: string[] | null
  nameservers?: string[] | null
  hostCNames?: string[] | null
  dnsServerRecords?: DnsRecordInput[] | null
  cdnDnsRecords?: DnsRecordInput[] | null
  cdnPending?: boolean
}

/** `displayDnsOptions`: anything but an array is no option. */
export function displayDnsOptions (input: Pick<DnsOptionsInput, 'dnsSettings'>): unknown[] {
  const options = input.dnsSettings?.display_options
  return Array.isArray(options) ? options : []
}

/** `computedDomain`: the domain without a leading `www.`. */
export function computedDomain (domain: string | null | undefined): string {
  if (!domain) {
    return ''
  }
  return domain.startsWith('www.') ? domain.slice(4) : domain
}

/** The key (under `general.`) of the third line of a record. */
export function recordTypeLabel (type: string): 'address' | 'value' {
  return ['A', 'AAAA', 'CNAME'].includes(type) ? 'address' : 'value'
}

/** `ipv4AddressesToDisplay`: the CIDR ranges (`a/b`) are left out. */
export function ipv4AddressesToDisplay (addresses: string[] | null | undefined): string[] {
  return (addresses ?? []).filter(ip => !ip.includes('/'))
}

/** Records with a type and a value, their trailing dots removed. */
export function normalizeCdnRecords (records: DnsRecordInput[] | null | undefined): DnsRecordRow[] {
  return (records ?? [])
    .filter((record): record is DnsRecordInput & { type: string, value: string } => Boolean(record && record.type && record.value))
    .map(record => ({
      name: String(record.name || '').replace(/\.$/, ''),
      type: record.type,
      value: String(record.value || '').replace(/\.$/, ''),
    }))
}

/**
 * The records were issued for the domain of the apex A record. While the user sets another domain, the
 * record names follow it (the CDN edge targets stay valid) and an ACME challenge, bound to the issued domain, is dropped.
 */
export function cdnRecordsToDisplay (records: DnsRecordInput[] | null | undefined, domain: string | null | undefined): DnsRecordRow[] {
  const normalized = normalizeCdnRecords(records)
  const apex = normalized.find(record => record.type === 'A' && record.name && !record.name.startsWith('www.'))
  const base = apex ? apex.name : ''
  const target = computedDomain(domain)

  if (!base || !target || base === target) {
    return normalized
  }
  return normalized
    .filter(record => !record.name.startsWith('_acme-challenge'))
    .map(record => {
      if (record.name === base) {
        return { ...record, name: target }
      }
      if (record.name === `www.${base}`) {
        return { ...record, name: `www.${target}`, value: target }
      }
      return record
    })
}

/** `isApexARecord`. */
export function isApexARecord (record: Pick<DnsRecordRow, 'type' | 'name'>, domain: string | null | undefined): boolean {
  const target = computedDomain(domain)
  return record.type === 'A' && Boolean(target) && record.name === target
}

/** `dnsServerRecordsToDisplay`: the zone records, then a CNAME per host CNAME (named after the domain as given, `www.` included). */
export function dnsServerRecordsToDisplay (input: Pick<DnsOptionsInput, 'dnsServerRecords' | 'hostCNames' | 'domain'>): DnsRecordInput[] {
  const cnames = (input.hostCNames ?? []).map(cname => ({ name: input.domain ?? '', type: 'CNAME', value: cname }))
  return (input.dnsServerRecords ?? []).concat(cnames)
}

export interface DnsOptionsView {
  /** Anything to show at all (the root `v-if`). */
  visible: boolean
  titleVisible: boolean
  showCdnDnsRecords: boolean
  showARecord: boolean
  showCnameRecord: boolean
  showNameservers: boolean
  showDnsServerRecords: boolean
  /** The first panel (A records, zone records, CDN records, CDN pending). */
  showRecordsPanel: boolean
  /** Any panel at all (the `v-expansion-panels` `v-if`). */
  showPanels: boolean
  cdnRecords: DnsRecordRow[]
}

/** The visibility rules of `DnsOptions`. */
export function dnsOptionsView (input: DnsOptionsInput, hideTitle = false): DnsOptionsView {
  const options = displayDnsOptions(input)
  const domain = computedDomain(input.domain)
  const cdnPending = Boolean(input.cdnPending)
  const cdnRecords = cdnRecordsToDisplay(input.cdnDnsRecords, input.domain)
  const showCdnDnsRecords = cdnRecords.length > 0

  const showARecord = options.includes('a_records') && !cdnPending && !showCdnDnsRecords
  const showCnameRecord = Boolean(domain) && Boolean(input.onboardingSubdomain) && options.includes('cname_record')
  const showNameservers = Boolean(domain) && Boolean(input.hasDnsServer) && (input.nameservers?.length ?? 0) > 0 && options.includes('ns_records')
  const hasZoneRecords = (input.dnsServerRecords?.length ?? 0) > 0 || (input.hostCNames?.length ?? 0) > 0
  const showDnsServerRecords = Boolean(domain) && hasZoneRecords && options.includes('records_from_dns_server')
  const showRecordsPanel = showARecord || showDnsServerRecords || showCdnDnsRecords || cdnPending

  return {
    visible: options.length > 0 || showCdnDnsRecords || cdnPending,
    titleVisible: !hideTitle && options.length > 1,
    showCdnDnsRecords,
    showARecord,
    showCnameRecord,
    showNameservers,
    showDnsServerRecords,
    showRecordsPanel,
    showPanels: showRecordsPanel || showCnameRecord || showNameservers,
    cdnRecords,
  }
}

/** The service fields the domain dialog reads. Structural, so the entity does not import the hosting views. */
export interface DomainDnsServiceInput {
  dns_settings?: { display_options?: unknown } | null
  dns_server_enabled?: boolean
}

/** The server account fields the domain dialog reads. */
export interface DomainDnsAccountInput {
  ipv4_addresses?: string[] | null
  host_c_names?: string[] | null
  nameservers?: string[] | null
}

/** The props of `DnsOptions` in the domain dialog, with no null where the component needs a value. */
export interface DomainDnsOptionsInput {
  domain: string
  dnsSettings: { display_options?: unknown }
  hasDnsServer: boolean
  ipv4Addresses: string[]
  nameservers: string[]
  hostCNames: string[]
  onboardingSubdomain: null
  dnsServerRecords: DnsRecordInput[]
  cdnDnsRecords: DnsRecordInput[]
}

/**
 * The inputs of `DnsOptions` in the domain dialog. The dialog has no onboarding subdomain and no CDN or zone records,
 * so only `a_records` (and the nameservers or host CNAMEs, when the plan has them) can give a panel.
 */
export function domainDnsOptionsInput (
  service: DomainDnsServiceInput,
  account: DomainDnsAccountInput,
  domain: string | null | undefined,
): DomainDnsOptionsInput {
  return {
    domain: domain ?? '',
    dnsSettings: service.dns_settings ?? {},
    hasDnsServer: Boolean(service.dns_server_enabled),
    ipv4Addresses: account.ipv4_addresses ?? [],
    nameservers: account.nameservers ?? [],
    hostCNames: account.host_c_names ?? [],
    onboardingSubdomain: null,
    dnsServerRecords: [],
    cdnDnsRecords: [],
  }
}

/**
 * Whether the domain dialog has DNS instructions worth a step. `DnsOptions` must show a panel (`showPanels`, not `visible`: a
 * display option alone, for example `cname_record` with no onboarding subdomain, gives an empty panel list). An `a_records` panel
 * with no IPv4 address to show only has the `www` CNAME line, which is no use alone, so it does not count.
 */
export function hasDomainDnsInstructions (
  service: DomainDnsServiceInput,
  account: DomainDnsAccountInput,
  domain: string | null | undefined,
): boolean {
  const input = domainDnsOptionsInput(service, account, domain)
  const view = dnsOptionsView(input, true)
  if (!view.showPanels) {
    return false
  }
  const hasAddress = ipv4AddressesToDisplay(input.ipv4Addresses).length > 0
  const recordsPanelUseful = view.showCdnDnsRecords || view.showDnsServerRecords || (view.showARecord && hasAddress)
  return recordsPanelUseful || view.showCnameRecord || view.showNameservers
}
