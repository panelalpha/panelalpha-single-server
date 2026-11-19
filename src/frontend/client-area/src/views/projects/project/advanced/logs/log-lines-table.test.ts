import type { LogRow } from './log-lines'
import { describe, expect, it } from 'vitest'
import {
  filterLogRows,
  formatLogSize,
  httpStatusColor,
  levelColor,
  LOG_DEFAULT_PER_PAGE,
  LOG_POSSIBLE_PER_PAGE,
  logHeaders,
  logPageCount,
  sortLogRows,
} from './log-lines-table'

const rows: LogRow[] = [
  { id: '0', time: 't0', sortKey: 0, level: 'error', message: 'Disk Full' },
  { id: '1', time: 't1', sortKey: 1, level: 'info', message: 'ok', ip: '1.2.3.4' },
  { id: '2', time: 't2', sortKey: 2, level: 'info', message: 'other', detail: 'Mozilla' },
]

describe('log-lines-table', () => {
  it('maps HTTP status to a chip colour', () => {
    expect(['200', '301', '404', '503', '-', undefined].map(s => httpStatusColor(s))).toEqual(['success', 'info', 'warning', 'error', 'gray', 'gray'])
  })

  it('maps level to a chip colour', () => {
    expect(['fatal', 'error', 'warning', 'deprecated', 'ok', 'info', 'notice', 'debug', 'x'].map(l => levelColor(l)))
      .toEqual(['error', 'error', 'warning', 'warning', 'success', 'info', 'gray', 'gray', 'gray'])
  })

  it('has the columns of each kind', () => {
    expect(logHeaders('access').map(h => h.text)).toEqual(['time', 'ip', 'request', 'status', 'size'])
    expect(logHeaders('error').map(h => h.text)).toEqual(['time', 'level', 'message'])
    expect(logHeaders('php').map(h => h.text)).toEqual(['time', 'level', 'message'])
    expect(logHeaders('deploy').map(h => h.text)).toEqual(['time', 'stage', 'level', 'message'])
    expect(logHeaders('deploy')[0]!.sortable).toBe(true)
  })

  it('filters rows by any text, case-insensitively', () => {
    expect(filterLogRows(rows, '')).toHaveLength(3)
    expect(filterLogRows(rows, 'disk').map(r => r.id)).toEqual(['0'])
    expect(filterLogRows(rows, '1.2.3').map(r => r.id)).toEqual(['1'])
    expect(filterLogRows(rows, 'mozilla').map(r => r.id)).toEqual(['2'])
  })

  it('sorts by sortKey', () => {
    expect(sortLogRows(rows, 'desc').map(r => r.id)).toEqual(['2', '1', '0'])
    expect(sortLogRows(rows, 'asc').map(r => r.id)).toEqual(['0', '1', '2'])
    expect(sortLogRows(rows, null).map(r => r.id)).toEqual(['0', '1', '2'])
  })
})

describe('log columns and sizes', () => {
  it('starts every kind with Time and puts Status next to Size in the access log', () => {
    for (const kind of ['access', 'error', 'php', 'deploy'] as const) {
      expect(logHeaders(kind)[0]?.text).toBe('time')
    }
    expect(logHeaders('access').map(h => h.text)).toEqual(['time', 'ip', 'request', 'status', 'size'])
  })

  it('counts the pages of the loaded rows, at least one', () => {
    expect([logPageCount(0, 15), logPageCount(15, 15), logPageCount(16, 15), logPageCount(120, 50)]).toEqual([1, 1, 2, 3])
  })

  it('has one default page size of 15 and the footer sizes 15, 50, 100', () => {
    expect(LOG_DEFAULT_PER_PAGE).toBe(15)
    expect(LOG_POSSIBLE_PER_PAGE).toEqual([[15, 50, 100]])
  })

  it('shows a size in B, KB and MB', () => {
    expect(['0', '512', '1024', '1536', '5242880', '-', '', undefined].map(s => formatLogSize(s)))
      .toEqual(['0 B', '512 B', '1 KB', '1.5 KB', '5 MB', '-', '', ''])
  })
})
