import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'

/** Only the date column sorts, as legacy (`sortable: true` on `date`). */
export const DATE_HEADER: LegacySortHeader & { text: string } = { text: 'date', value: 'date', sortable: true }

export const LOG_HEADERS: Array<LegacySortHeader & { text: string }> = [
  { text: 'user', value: 'user', sortable: false },
  { text: 'actions', value: 'action', sortable: false },
  DATE_HEADER,
]

export const LOGS_PAGE_SIZE = 10

export const LOGS_POSSIBLE_PER_PAGE: number[][] = [[2, 5, 10, 20, 100]]
