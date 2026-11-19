import { describe, expect, it } from 'vitest'
import { LOG_HEADERS, logPages, showLogsFooter } from './mcp-activity-log'

describe('mcp-activity-log', () => {
  it('has the four legacy columns, none sortable, status right-aligned', () => {
    expect(LOG_HEADERS.map(header => header.value)).toEqual(['created_at', 'token_name', 'tool_name', 'status'])
    expect(LOG_HEADERS.some(header => header.sortable)).toBe(false)
    expect(LOG_HEADERS.map(header => header.align)).toEqual([undefined, undefined, undefined, 'end'])
  })

  it('counts pages of 20, at least one', () => {
    expect(logPages(0)).toBe(1)
    expect(logPages(20)).toBe(1)
    expect(logPages(21)).toBe(2)
    expect(logPages(45)).toBe(3)
  })

  it('hides the footer for a single page', () => {
    expect(showLogsFooter(1)).toBe(false)
    expect(showLogsFooter(3)).toBe(true)
  })
})
