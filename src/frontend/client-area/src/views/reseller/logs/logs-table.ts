import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
import type { LogPayload } from '@/entities/project/ui/logs/instance-log'
import { payloadValue } from '@/entities/project/ui/logs/instance-log'

/** Only the date column sorts, as legacy. */
export const DATE_HEADER: LegacySortHeader & { text: string } = { text: 'date', value: 'date', align: 'end', sortable: true }

/** Columns in legacy order. `text` is the header name (`table.header.<text>`); the actions column reads the `action` field. */
export const RESELLER_LOG_HEADERS: LegacySortHeader[] = [
  { text: 'user', value: 'user', sortable: false },
  { text: 'instance', value: 'instance', sortable: false },
  { text: 'actions', value: 'action', sortable: false },
  DATE_HEADER,
]

export const RESELLER_LOGS_PER_PAGE = 50

export const RESELLER_LOGS_POSSIBLE_PER_PAGE: number[][] = [[10, 20, 50, 75, 100]]

/**
 * The value of the first `App\Models\Application:<id>` key. Goes through the kit
 * `payloadValue`, so a `null` or empty payload gives `null` where legacy threw.
 */
export function logInstance (payload: LogPayload): { name: string, url: string } | null {
  return (payloadValue(payload, 'Application') as { name: string, url: string } | null) ?? null
}
