import type { DnsRecord, DnsZone } from './dns.api'
import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'

// Pure logic of the DNS screen, ported from the legacy Dns view. The labels are translated by the view.

/** A table row: the record with the TTL shown as `Auto` for `1`, and the `loading` flag of the proxy toggle. */
export interface DnsRow extends DnsRecord {
  loading: boolean
}

/** A record-type option of the Add and Edit modal. */
export interface DnsRecordTypeOption {
  label: string
  value: string
}

/** Shown when the provider has no record types (the text is English and not translated, as in legacy). */
export const CANNOT_MANAGE_VIA_API = 'DNS records for this provider cannot be managed via API.'

/** TTL `1` is "Auto"; a fresh row is not loading (the proxy toggle sets it). */
export function toDnsRow (record: DnsRecord): DnsRow {
  return {
    ...record,
    ttl: record.ttl === 1 ? 'Auto' : record.ttl,
    loading: false,
  }
}

/**
 * Name, ttl, type, value, [proxy (not sortable) before the actions when the provider allows the proxy],
 * actions. The texts are the `table.header.*` keys, as in the cron table.
 */
export function dnsHeaders (allowProxy: boolean): LegacySortHeader[] {
  const headers: LegacySortHeader[] = [
    { text: 'name', value: 'name', sortable: true },
    { text: 'ttl', value: 'ttl', sortable: true },
    { text: 'type', value: 'type', sortable: true },
    { text: 'value', value: 'content', sortable: true },
  ]
  if (allowProxy) {
    headers.push({ text: 'proxy', value: 'proxied', sortable: false })
  }
  headers.push({ text: 'actions', value: 'actions' })
  return headers
}

/** Each type is both the label and the value of its option. */
export function toRecordTypeOptions (types: string[]): DnsRecordTypeOption[] {
  return types.map(type => ({ label: type, value: type }))
}

/**
 * The alert shows when the records are loaded, the provider has no record types, and a zone is selected
 * (`zone.id` is set; the legacy initial zone `{}` has none).
 */
export function showCannotManageAlert (state: {
  recordsLoading: boolean
  recordTypesCount: number
  zone: Partial<DnsZone> | null | undefined
}): boolean {
  return !state.recordsLoading && state.recordTypesCount === 0 && !!state.zone?.id
}
