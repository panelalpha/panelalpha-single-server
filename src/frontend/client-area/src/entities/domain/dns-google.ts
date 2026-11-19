// Browser-side DNS lookups through Google's DoH endpoint (and RDAP), as legacy does them (identical in app and
// app-lite for these functions). The harness answers `https://dns.google/*` and `https://rdap.org/*` per state (`ParityState.external`).
// Every request carries `referrerPolicy: 'no-referrer'` and `cache: 'no-cache'`; a failed request is an empty answer, never an error.

const A_TYPE = 1
const NS_TYPE = 2
const CNAME_TYPE = 5
const SOA_TYPE = 6
const TXT_TYPE = 16

interface DnsRecord {
  name?: string
  type: number
  data: string
}

interface DnsAnswer {
  Answer?: DnsRecord[]
  Authority?: DnsRecord[]
}

async function query (name: string, type: number | string): Promise<DnsAnswer> {
  const response = await fetch(`https://dns.google/resolve?name=${name}&type=${type}`, {
    referrerPolicy: 'no-referrer',
    cache: 'no-cache',
  })
  return await response.json() as DnsAnswer
}

/** The data of the first answer of `type`, `null` when there is none or the request fails (`resolveTXTRecord`, `resolveARecord`, `resolveCNAMERecord`). */
async function firstAnswer (name: string, queryType: number | string, answerType: number): Promise<string | null> {
  try {
    const json = await query(name, queryType)
    for (const answer of json.Answer ?? []) {
      if (answer.type === answerType) {
        return answer.data
      }
    }
    return null
  } catch {
    return null
  }
}

/** Resolves a TXT record. `name` goes into the URL as is (legacy does not encode it). */
export function resolveTxt (name: string): Promise<string | null> {
  return firstAnswer(name, 'TXT', TXT_TYPE)
}

/** The first A answer. */
export function resolveARecord (name: string): Promise<string | null> {
  return firstAnswer(name, A_TYPE, A_TYPE)
}

/** The first CNAME answer. */
export function resolveCnameRecord (name: string): Promise<string | null> {
  return firstAnswer(name, CNAME_TYPE, CNAME_TYPE)
}

const resolvedNameservers = new Map<string, Promise<string[]>>()

export function resetNameserverCache (): void {
  resolvedNameservers.clear()
}

/**
 * NS answers, else NS authority records, else the NS of the SOA zone when it is another name.
 * Cached per domain for the page's lifetime (module `Map`, the promise itself, as legacy).
 */
export function resolveNsRecords (domain: string): Promise<string[]> {
  if (!resolvedNameservers.has(domain)) {
    resolvedNameservers.set(domain, (async () => {
      try {
        const json = await query(domain, NS_TYPE)
        const ns: string[] = []
        for (const answer of json.Answer ?? []) {
          if (answer.type === NS_TYPE) {
            ns.push(answer.data)
          }
        }
        if (ns.length === 0 && json.Authority) {
          for (const answer of json.Authority) {
            if (answer.type === NS_TYPE) {
              ns.push(answer.data)
            }
          }
        }
        if (ns.length === 0 && json.Authority && json.Authority.length > 0) {
          const soa = json.Authority.find(answer => answer && answer.type === SOA_TYPE && answer.name)
          if (soa && soa.name && soa.name !== domain) {
            return await resolveNsRecords(soa.name)
          }
        }
        return ns
      } catch {
        return []
      }
    })())
  }
  return resolvedNameservers.get(domain)!
}

/**
 * Kept as in legacy: legacy calls `ns.endsWith(".")` on each RDAP nameserver, which is an object
 * (`{ ldhName }`), so a response with nameservers throws inside the chain and the `.catch` returns `[]`. Not fixed here (parity).
 */
export async function resolveNsRecordsByRdap (domain: string): Promise<string[]> {
  try {
    const response = await fetch(`https://rdap.org/domain/${domain}`, {
      referrerPolicy: 'no-referrer',
      cache: 'no-cache',
    })
    const json = await response.json() as { nameservers?: any[] }
    const nameservers: string[] = []
    for (let ns of json.nameservers ?? []) {
      if (ns.endsWith('.')) {
        ns = ns.slice(0, -1)
      }
      nameservers.push(ns.ldhName)
    }
    return nameservers
  } catch {
    return []
  }
}
