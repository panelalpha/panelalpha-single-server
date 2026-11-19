import { resolveARecord, resolveCnameRecord, resolveNsRecords, resolveNsRecordsByRdap, resolveTxt } from './dns-google'

// `verifyDomainResolving` with its comparison helpers (app variant; identical in app-lite apart from
// the `normalizeNs` handling in `nsStatus`, which is not used here). Used by the Summary nameserver card and the instance kit's
// `DnsSslIndicator`.

export interface DnsSettings {
  [key: string]: unknown
  display_options?: unknown
  verification_methods?: unknown
  verification_mode?: string
  valid_cname_addresses?: unknown
}

export interface DnsServerRecord {
  type: string
  name: string
  value: string
}

export interface VerifyDomainResolvingInput {
  domain: string
  onboardingSubdomain: string | null | undefined
  dnsSettings: DnsSettings
  hasDnsServer: boolean | undefined
  ipv4Addresses: string[]
  nameservers: string[] | undefined
  hostCNames: string[] | undefined
  recordsFromDnsServer: DnsServerRecord[] | undefined
  /** Also ask RDAP for the nameservers of a new domain. */
  eagerDnsVerification?: boolean
  /** CDN records not ready: the A record counts as satisfied in `any` mode. */
  skipARecordVerification?: boolean
}

interface Comparison {
  resolving: boolean
  matching: boolean
}

/** `normalizeNs`: trimmed, lower-cased, without the trailing dot. */
export function normalizeNs (ns: unknown): string {
  if (ns === null || ns === undefined) {
    return ''
  }
  let value = String(ns).trim().toLowerCase()
  if (value.endsWith('.')) {
    value = value.slice(0, -1)
  }
  return value
}

/** `generateIPsFromCIDR`: every address of the block (32-bit signed arithmetic as legacy). */
export function generateIpsFromCidr (cidr: string): string[] {
  const [baseIp, mask] = cidr.split('/') as [string, string]
  const maskBits = Number.parseInt(mask)
  const parts = baseIp.split('.').map(part => Number.parseInt(part))
  const baseIpNum = (parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!
  const total = 2 ** (32 - maskBits)
  const networkMask = -1 << (32 - maskBits)
  const first = baseIpNum & networkMask
  const list: string[] = []
  for (let i = 0; i < total; i++) {
    const current = first + i
    list.push([(current >> 24) & 255, (current >> 16) & 255, (current >> 8) & 255, current & 255].join('.'))
  }
  return list
}

/** `getIpv4Addresses`: CIDR blocks are expanded, plain addresses kept. */
export function getIpv4Addresses (addresses: string[]): string[] {
  return addresses.flatMap(address => address.includes('/') ? generateIpsFromCidr(address) : [address])
}

export async function compareNsRecords (domain: string, compareWith: string[], eagerDnsVerification?: boolean): Promise<Comparison> {
  const result: Comparison = { resolving: false, matching: false }
  const expected = new Set(compareWith.map(ns => normalizeNs(ns)))

  const nameservers = await resolveNsRecords(domain)
  if (nameservers.length > 0) {
    result.resolving = true
    result.matching = nameservers.every(ns => expected.has(normalizeNs(ns)))
  }
  if (result.matching) {
    return result
  }
  if (domain.startsWith('www.')) {
    // legacy drops `eagerDnsVerification` on this recursion
    return compareNsRecords(domain.slice(4), compareWith)
  }
  if (eagerDnsVerification) {
    const byRdap = await resolveNsRecordsByRdap(domain)
    if (byRdap.length > 0) {
      result.resolving = true
      result.matching = byRdap.every(ns => expected.has(normalizeNs(ns)))
    }
  }
  return result
}

/** `cloudflareNSDetected`: every nameserver of the domain (or of its parent without `www.`) is a Cloudflare one. */
export async function cloudflareNsDetected (domain: string): Promise<boolean> {
  const nameservers = await resolveNsRecords(domain)
  const detected = nameservers.length > 0 && nameservers.every(ns => (ns.endsWith('.') ? ns.slice(0, -1) : ns).includes('cloudflare'))
  if (detected) {
    return true
  }
  if (domain.startsWith('www.')) {
    return cloudflareNsDetected(domain.slice(4))
  }
  return detected
}

type Resolver = (domain: string) => Promise<string | null>
type Matches = (response: string) => boolean

async function compareRecord (domain: string, resolve: Resolver, matches: Matches, trimDot: boolean): Promise<Comparison> {
  const result: Comparison = { resolving: false, matching: false }
  let response = await resolve(domain)
  if (response) {
    result.resolving = true
    if (trimDot && response.endsWith('.')) {
      response = response.slice(0, -1)
    }
    result.matching = matches(response)
  }
  if (result.matching) {
    return result
  }
  if (domain.startsWith('www.')) {
    return compareRecord(domain.slice(4), resolve, matches, trimDot)
  }
  return result
}

/** `compareARecord`: the first A answer is one of the valid addresses. */
export function compareARecord (domain: string, validIpAddresses: string[]): Promise<Comparison> {
  return compareRecord(domain, resolveARecord, response => validIpAddresses.includes(response), false)
}

/** `compareCNAMELikeRecord`: the CNAME target ends with `.<valid domain>`. */
export function compareCnameLikeRecord (domain: string, validCnameDomains: string[]): Promise<Comparison> {
  return compareRecord(domain, resolveCnameRecord, response => validCnameDomains.some(valid => response.endsWith(`.${valid}`)), true)
}

/** `compareCNAMERecord`: the CNAME target is one of the valid domains. */
export function compareCnameRecord (domain: string, validCnameDomains: string[]): Promise<Comparison> {
  return compareRecord(domain, resolveCnameRecord, response => validCnameDomains.includes(response), true)
}

/** `verifyTXTRecord`: the first TXT answer equals the value exactly. */
export async function verifyTxtRecord (name: string, value: string): Promise<boolean> {
  const response = await resolveTxt(name)
  return Boolean(response) && response === value
}

type Mode = 'any' | 'all'

/** One method's result under the mode: `any` stops at the first match (true), `all` at the first miss (false); otherwise go on. */
function decide (mode: Mode, matching: boolean): boolean | undefined {
  if (mode === 'any' && matching) {
    return true
  }
  if (mode === 'all' && !matching) {
    return false
  }
  return undefined
}

/** `resolve_records_from_dns_servers`: the host CNAMEs and every record the DNS server holds for the domain have to resolve. */
async function recordsFromDnsServersMatch ({ domain, hostCNames, recordsFromDnsServer, eagerDnsVerification }: VerifyDomainResolvingInput): Promise<boolean> {
  if (Array.isArray(hostCNames) && hostCNames.length > 0 && !(await compareCnameRecord(domain, hostCNames)).matching) {
    return false
  }
  for (const record of recordsFromDnsServer ?? []) {
    let matching = true
    switch (record.type) {
      case 'A': {
        matching = (await compareARecord(record.name, [record.value])).matching

        break
      }
      case 'NS': {
        matching = (await compareNsRecords(record.name, [record.value], eagerDnsVerification)).matching

        break
      }
      case 'CNAME': {
        matching = (await compareCnameRecord(record.name, [record.value])).matching

        break
      }
      case 'TXT': {
        matching = await verifyTxtRecord(record.name, record.value)

        break
      }
    // No default
    }
    if (!matching) {
      return false
    }
  }
  return true
}

/** The methods in the legacy order. `null`: the method does not apply (not enabled, or missing what it needs) and is skipped. */
function methodChecks (input: VerifyDomainResolvingInput, methods: unknown[], mode: Mode): Array<() => Promise<boolean | null>> {
  const { domain, onboardingSubdomain, dnsSettings, hasDnsServer, ipv4Addresses, nameservers, eagerDnsVerification, skipARecordVerification } = input
  const validCnames = dnsSettings.valid_cname_addresses
  return [
    async () => {
      if (!methods.includes('resolve_a_record')) {
        return null
      }
      if (skipARecordVerification) {
        // CDN records not ready: the A record counts as satisfied in `any` mode, and is not asked at all
        return mode === 'any' ? true : null
      }
      return (await compareARecord(domain, getIpv4Addresses(ipv4Addresses))).matching
    },
    async () => methods.includes('resolve_ns_records') && hasDnsServer
      ? (await compareNsRecords(domain, nameservers ?? [], eagerDnsVerification)).matching
      : null,
    async () => methods.includes('resolve_cname_record_custom') && Array.isArray(validCnames) && validCnames.length > 0
      ? (await compareCnameLikeRecord(domain, validCnames as string[])).matching
      : null,
    async () => methods.includes('resolve_cname_record_onboarding') && onboardingSubdomain
      ? (await compareCnameRecord(domain, [onboardingSubdomain])).matching
      : null,
    async () => methods.includes('resolve_records_from_dns_servers') ? await recordsFromDnsServersMatch(input) : null,
  ]
}

/**
 * True without a check for the onboarding subdomain and for a plan with no verification methods. Otherwise the
 * enabled methods run in the legacy order (A, NS with a DNS server, custom CNAME, onboarding CNAME, records from DNS servers):
 * `any` mode returns true on the first match, `all` mode false on the first miss, and the fallthrough is `mode === 'all'`.
 */
export async function verifyDomainResolving (input: VerifyDomainResolvingInput): Promise<boolean> {
  if (input.domain === input.onboardingSubdomain) {
    return true
  }

  const methods = input.dnsSettings.verification_methods
  if (!Array.isArray(methods) || methods.length === 0) {
    return true
  }
  const mode: Mode = input.dnsSettings.verification_mode === 'all' ? 'all' : 'any'

  for (const check of methodChecks(input, methods, mode)) {
    const matching = await check()
    const verdict = matching === null ? undefined : decide(mode, matching)
    if (verdict !== undefined) {
      return verdict
    }
  }
  return mode === 'all'
}
