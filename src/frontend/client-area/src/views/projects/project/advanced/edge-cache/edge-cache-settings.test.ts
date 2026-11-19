import { describe, expect, it } from 'vitest'
import { DEFAULT_EDGE_CACHE_TTL, EDGE_CACHE_TTL_OPTIONS, shouldWarnCloudflare } from './edge-cache-settings'

describe('EDGE_CACHE_TTL_OPTIONS', () => {
  it('lists the five legacy options in legacy order with their keys, counts and seconds', () => {
    expect(EDGE_CACHE_TTL_OPTIONS).toEqual([
      { labelKey: 'general.time.minute', count: 30, value: 1800 },
      { labelKey: 'general.time.hour', count: 1, value: 3600 },
      { labelKey: 'general.time.hour', count: 8, value: 28_800 },
      { labelKey: 'general.time.hour', count: 24, value: 86_400 },
      { labelKey: 'general.time.day', count: 7, value: 604_800 },
    ])
  })

  it('keeps the values in ascending order', () => {
    const values = EDGE_CACHE_TTL_OPTIONS.map(option => option.value)

    expect(values.toSorted((a, b) => a - b)).toEqual(values)
  })
})

describe('DEFAULT_EDGE_CACHE_TTL', () => {
  it('is 1800 seconds and one of the options', () => {
    expect(DEFAULT_EDGE_CACHE_TTL).toBe(1800)
    expect(EDGE_CACHE_TTL_OPTIONS.map(option => option.value)).toContain(DEFAULT_EDGE_CACHE_TTL)
  })
})

describe('shouldWarnCloudflare', () => {
  it.each([
    { name: 'turning on with Cloudflare DNS', isActive: false, confirmed: false, hasCloudflareDns: true, expected: true },
    { name: 'turning on without Cloudflare DNS', isActive: false, confirmed: false, hasCloudflareDns: false, expected: false },
    { name: 'turning on with Cloudflare DNS after confirmation', isActive: false, confirmed: true, hasCloudflareDns: true, expected: false },
    { name: 'turning off with Cloudflare DNS', isActive: true, confirmed: false, hasCloudflareDns: true, expected: false },
    { name: 'turning off without Cloudflare DNS', isActive: true, confirmed: false, hasCloudflareDns: false, expected: false },
  ])('$name -> $expected', ({ isActive, confirmed, hasCloudflareDns, expected }) => {
    expect(shouldWarnCloudflare(isActive, confirmed, hasCloudflareDns)).toBe(expected)
  })
})
