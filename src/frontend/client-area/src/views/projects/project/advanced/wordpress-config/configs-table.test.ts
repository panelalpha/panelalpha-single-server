import type { WordpressConfigItem } from './wordpress-config.api'
import { describe, expect, it } from 'vitest'
import {
  CONFIGS_CUSTOM_KEY_SORT,
  CONFIGS_SEARCH_KEYS,
  configsHeaders,
  displayConfigName,
  displayConfigValue,
} from './configs-table'

const t = (key: string) => key

describe('configsHeaders', () => {
  it('lists the columns in legacy order with their keys, labels and sortability', () => {
    const headers = configsHeaders(t)

    expect(headers.map(header => header.value)).toEqual(['name', 'value', 'type', 'actions'])
    expect(headers.map(header => header.label)).toEqual(['table.header.name', 'table.header.value', 'table.header.type', ''])
    expect(headers.map(header => header.sortable)).toEqual([true, true, true, false])
  })
})

describe('CONFIGS_SEARCH_KEYS', () => {
  it('searches name and value only, not type', () => {
    expect(CONFIGS_SEARCH_KEYS).toEqual(['name', 'value'])
  })
})

describe('CONFIGS_CUSTOM_KEY_SORT', () => {
  it('compares name, value and type as text, so "10" comes before "2"', () => {
    for (const key of ['name', 'value', 'type']) {
      const compare = CONFIGS_CUSTOM_KEY_SORT[key]!
      expect(compare('10', '2')).toBeLessThan(0)
      expect(compare('2', '10')).toBeGreaterThan(0)
    }
  })

  it('does not throw on a null name or value', () => {
    const compare = CONFIGS_CUSTOM_KEY_SORT.name!
    expect(() => compare(null, 'a')).not.toThrow()
    expect(compare(null, 'a')).toBeLessThan(0)
    expect(() => CONFIGS_CUSTOM_KEY_SORT.value!(null, null)).not.toThrow()
  })
})

describe('displayConfigName', () => {
  it('shows the name, or --- when it is empty', () => {
    expect(displayConfigName({ name: 'WP_DEBUG' })).toBe('WP_DEBUG')
    expect(displayConfigName({ name: '' })).toBe('---')
    expect(displayConfigName({ name: null })).toBe('---')
  })
})

describe('displayConfigValue', () => {
  const item = (overrides: Partial<WordpressConfigItem>): Pick<WordpressConfigItem, 'value' | 'type'> => ({
    value: 'true',
    type: 'constant',
    ...overrides,
  })

  it('shows the raw value of a constant or variable', () => {
    expect(displayConfigValue(item({ type: 'constant' }))).toBe('true')
    expect(displayConfigValue(item({ type: 'variable', value: 'abc' }))).toBe('abc')
  })

  it('shows --- for an empty or null value', () => {
    expect(displayConfigValue(item({ value: '' }))).toBe('---')
    expect(displayConfigValue(item({ value: null }))).toBe('---')
  })

  // The Engine lists `define( 'WP_DEBUG', false )` as the JSON value `false`, not as an empty string, so only an
  // empty value is a missing one: a `false` constant and `0` are shown as they are.
  it('shows a false constant as false and a zero as 0', () => {
    expect(displayConfigValue(item({ value: false }))).toBe('false')
    expect(displayConfigValue(item({ value: true }))).toBe('true')
    expect(displayConfigValue(item({ value: 0 }))).toBe('0')
  })

  it('masks a secret value with length + 1 bullets', () => {
    expect(displayConfigValue(item({ type: 'secret', value: 'hunter2' }))).toBe('•'.repeat(8))
    expect(displayConfigValue(item({ type: 'secret', value: 'hunter2' }))).not.toContain('hunter2')
  })
})
