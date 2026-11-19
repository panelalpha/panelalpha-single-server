import type { HostingDomain } from './domains.types'
import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'

// The search of the Domains table: the default filter of the V2 `v-data-table`, which tests the
// raw value of every column of the header row. So `type` matches `addon`, not the translated `type_text`, and `ssl_status` and `actions`
// (which the row has no value for) match nothing.

/** The default filter of V2: a non-null, non-boolean value whose lower-cased string contains the lower-cased term. */
export function matchesValue (value: unknown, term: string): boolean {
  if (value === null || value === undefined || typeof value === 'boolean') {
    return false
  }
  return String(value).toLocaleLowerCase().includes(term.toLocaleLowerCase())
}

/** Whether any column of `headers` holds the term. An empty term matches every row. */
export function matchesSearch (row: Pick<HostingDomain, 'domain'>, term: string, headers: readonly Pick<LegacySortHeader, 'value'>[]): boolean {
  if (term === '') {
    return true
  }
  const values = row as unknown as Record<string, unknown>
  return headers.some(header => matchesValue(values[header.value], term))
}
