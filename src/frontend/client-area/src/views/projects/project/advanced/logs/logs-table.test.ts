import { describe, expect, it } from 'vitest'
import { DATE_HEADER, LOG_HEADERS, LOGS_PAGE_SIZE, LOGS_POSSIBLE_PER_PAGE } from './logs-table'

describe('logs-table', () => {
  it('lists the legacy columns in order, with only the date sortable', () => {
    expect(LOG_HEADERS.map(header => header.text)).toEqual(['user', 'actions', 'date'])
    expect(LOG_HEADERS.filter(header => header.sortable).map(header => header.value)).toEqual(['date'])
    expect(DATE_HEADER.value).toBe('date')
  })

  it('defaults to 10 rows and offers the legacy page sizes', () => {
    expect(LOGS_PAGE_SIZE).toBe(10)
    expect(LOGS_POSSIBLE_PER_PAGE).toEqual([[2, 5, 10, 20, 100]])
  })
})
