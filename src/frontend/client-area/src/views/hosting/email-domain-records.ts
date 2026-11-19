import { resolveTxt } from '@/entities/domain/dns-google'

// Port of the legacy email domain records mixin: is every DKIM and SPF record of every email
// domain of a service published in DNS. The verdict is cached per domain for the page's lifetime (module `Map`, as legacy).

/** One record to publish: the DNS name, its type and the value (`type` is for display only). */
export interface EmailDomainRecord {
  name: string
  type?: string
  value: string
}

/** One item of `GET /services/{id}/email/domains`. The API always sends `id` and `domain`. */
export interface EmailDomain {
  id: number | string
  domain: string
  dkim_records?: EmailDomainRecord[]
  spf_records?: EmailDomainRecord[]
}

/** The separate SPF and DKIM verdicts of one domain. */
export interface DomainRecordsVerdict {
  spf: boolean
  dkim: boolean
}

interface CachedVerdict {
  spf?: boolean
  dkim?: boolean
}

const cache = new Map<string, CachedVerdict>()

export function resetEmailRecordsCache (): void {
  cache.clear()
}

/** The cache key of a domain: its API id. */
export function domainKey (domain: EmailDomain): string {
  return String(domain.id)
}

/** Strips the quotes TXT answers come in and collapses whitespace. */
export function normalizeTxt (txt: string | null | undefined): string {
  if (!txt || typeof txt !== 'string') {
    return ''
  }
  return txt
    .replace(/^"+|"+$/g, '')
    .replace(/"\s+"/g, '')
    .replace(/"/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const SPF_MECHANISM = /^[+\-~?]?(?:all|ip4:\S+|ip6:\S+|a(?::\S+)?(?:\/\d{1,2})?|mx(?::\S+)?(?:\/\d{1,2})?|ptr(?::\S+)?|exists:\S+|include:\S+)$/i
const SPF_MODIFIER = /^(?:redirect|exp)=.+$/i

export function isValidSpfSyntax (txt: string | null | undefined): boolean {
  const normalized = normalizeTxt(txt)
  if (!/^v=spf1\b/i.test(normalized)) {
    return false
  }
  const tokens = normalized.split(/\s+/).slice(1)
  return tokens.length > 0 && tokens.every(token => SPF_MECHANISM.test(token) || SPF_MODIFIER.test(token))
}

const exists = (txt: string | null): txt is string => typeof txt === 'string' && txt.trim() !== ''

async function checkDkim (records: EmailDomainRecord[]): Promise<boolean> {
  try {
    const values = await Promise.all(records.map(record => resolveTxt(record.name)))
    return values.every((txt, index) => exists(txt) && normalizeTxt(txt) === normalizeTxt(records[index]!.value))
  } catch {
    return false
  }
}

async function checkSpf (records: EmailDomainRecord[]): Promise<boolean> {
  try {
    const values = await Promise.all(records.map(record => resolveTxt(record.name)))
    return values.every(txt => exists(txt) && isValidSpfSyntax(txt))
  } catch {
    return false
  }
}

/**
 * SPF and DKIM verdicts of one domain. A verdict already known in the cache is
 * returned without a DNS lookup; an empty record list is configured. The domain is not changed.
 */
export async function checkDomainRecords (domain: EmailDomain): Promise<DomainRecordsVerdict> {
  const key = domainKey(domain)
  const entry = cache.get(key) ?? {}
  cache.set(key, entry)

  const [dkim, spf] = await Promise.all([
    entry.dkim ?? checkDkim(Array.isArray(domain.dkim_records) ? domain.dkim_records : []),
    entry.spf ?? checkSpf(Array.isArray(domain.spf_records) ? domain.spf_records : []),
  ])
  entry.dkim = dkim
  entry.spf = spf
  return { spf, dkim }
}

/** A domain is configured when both its DKIM and its SPF records are published. */
export function isDomainConfigured (verdict: DomainRecordsVerdict): boolean {
  return verdict.dkim && verdict.spf
}

async function checkDomain (domain: EmailDomain): Promise<boolean> {
  return isDomainConfigured(await checkDomainRecords(domain))
}

/** No domains counts as configured. */
export async function checkAllDomains (domains: EmailDomain[]): Promise<boolean> {
  if (!Array.isArray(domains) || domains.length === 0) {
    return true
  }
  const verdicts = await Promise.all(domains.map(domain => checkDomain(domain)))
  return verdicts.every(Boolean)
}
