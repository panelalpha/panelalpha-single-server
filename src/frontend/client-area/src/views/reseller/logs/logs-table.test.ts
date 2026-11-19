import { describe, expect, it } from 'vitest'
import { DATE_HEADER, logInstance, RESELLER_LOG_HEADERS, RESELLER_LOGS_PER_PAGE, RESELLER_LOGS_POSSIBLE_PER_PAGE } from './logs-table'

describe('reseller logs table module', () => {
  it('lists the headers in legacy order with only the date sortable', () => {
    expect(RESELLER_LOG_HEADERS.map(header => [header.text, header.value, header.sortable])).toEqual([
      ['user', 'user', false],
      ['instance', 'instance', false],
      ['actions', 'action', false],
      ['date', 'date', true],
    ])
    expect(DATE_HEADER.align).toBe('end')
    expect(RESELLER_LOG_HEADERS[3]).toBe(DATE_HEADER)
  })

  it('pages 50 by default with 10/20/50/75/100', () => {
    expect(RESELLER_LOGS_PER_PAGE).toBe(50)
    expect(RESELLER_LOGS_POSSIBLE_PER_PAGE).toEqual([[10, 20, 50, 75, 100]])
  })

  it('takes the instance from the Application key of the payload', () => {
    const app = { name: 'Shop', url: 'https://shop.example.com' }
    expect(logInstance({ 'App\\Models\\User:1': { name: 'x' }, 'App\\Models\\Application:42': app })).toEqual(app)
  })

  it('gives null for a null payload, an empty array and a payload with other classes only', () => {
    expect(logInstance(null)).toBeNull()
    expect(logInstance([])).toBeNull()
    expect(logInstance({ 'App\\Models\\User:1': { name: 'x' } })).toBeNull()
  })
})
