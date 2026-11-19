import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'

/** Nothing sorts, the status column is right-aligned. */
export const LOG_HEADERS: Array<LegacySortHeader & { text: string, align?: 'end' }> = [
  { text: 'heading.connectAi.logTime', value: 'created_at', sortable: false },
  { text: 'heading.connectAi.logToken', value: 'token_name', sortable: false },
  { text: 'heading.connectAi.logTool', value: 'tool_name', sortable: false },
  { text: 'heading.connectAi.logStatus.title', value: 'status', sortable: false, align: 'end' },
]

/** The API hardcodes `paginate(20)`. */
export const LOGS_PER_PAGE = 20

/** One list style, one size. */
export const POSSIBLE_LOGS_PER_PAGE: number[][] = [[LOGS_PER_PAGE]]

export function logPages (total: number): number {
  return Math.ceil(total / LOGS_PER_PAGE) || 1
}

/** Legacy hides the footer, and the divider above it, for a single page. */
export function showLogsFooter (pages: number): boolean {
  return pages !== 1
}
