// Legacy hosting account item as ActiveServerAccountSelector lists it (`item-text="domain"`, `item-value="id"`).
export interface HostingAccountItem {
  id: number | string
  domain: string
}

/** An email domain as the records selector lists it (`item-value="id"`, `item-text="domain"`). */
export interface EmailDomainOption {
  id: number | string
  domain: string
}

/** One SPF or DKIM verdict: `configured` once the DNS answers, `loading` until then. */
export interface RecordState {
  configured: boolean
  loading: boolean
}

/** The SPF and DKIM verdicts of one email domain, keyed by its id in the records map. */
export interface DomainRecordsState {
  spf: RecordState
  dkim: RecordState
}

/** A DNS record to publish for an email domain (`name`, `type`, `value`); other keys are shown as they come. */
export interface DnsRecord {
  name: string
  type?: string
  value: string
}
