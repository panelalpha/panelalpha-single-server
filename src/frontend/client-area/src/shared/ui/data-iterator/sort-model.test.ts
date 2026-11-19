import { describe, expect, it } from 'vitest'
import { fromV4SortBy, toV4SortBy } from './sort-model'

const keys = [
  { text: 'Name', value: 'name', sortable: true },
  { text: 'Date', value: 'createdAt', sortable: true },
]

describe('sort-model', () => {
  it('maps a header object and sortDesc to the V4 shape', () => {
    // Legacy read `sortBy.value` and `sortDesc`.
    expect(toV4SortBy(keys[0], true)).toEqual([{ key: 'name', order: 'desc' }])
    expect(toV4SortBy(keys[1], false)).toEqual([{ key: 'createdAt', order: 'asc' }])
  })

  it('returns an empty array for a false, missing or keyless sortBy', () => {
    expect(toV4SortBy(false, true)).toEqual([])
    expect(toV4SortBy(undefined, true)).toEqual([])
    expect(toV4SortBy({ value: '' }, true)).toEqual([])
  })

  it('accepts a bare key string (DataIteratorMixin allowed String)', () => {
    expect(toV4SortBy('name', undefined)).toEqual([{ key: 'name', order: 'asc' }])
  })

  it('parses the V4 shape back to the legacy header and sortDesc', () => {
    expect(fromV4SortBy([{ key: 'createdAt', order: 'desc' }], keys)).toEqual({ sortBy: keys[1], sortDesc: true })
    expect(fromV4SortBy([{ key: 'name', order: 'asc' }], keys)).toEqual({ sortBy: keys[0], sortDesc: false })
  })

  it('round-trips every header in both directions', () => {
    for (const header of keys) {
      for (const sortDesc of [true, false]) {
        expect(fromV4SortBy(toV4SortBy(header, sortDesc), keys)).toEqual({ sortBy: header, sortDesc })
      }
    }
  })

  it('maps an empty V4 array or an unknown key to sortBy false', () => {
    expect(fromV4SortBy([], keys)).toEqual({ sortBy: false, sortDesc: false })
    expect(fromV4SortBy(undefined, keys)).toEqual({ sortBy: false, sortDesc: false })
    expect(fromV4SortBy([{ key: 'nope', order: 'desc' }], keys)).toEqual({ sortBy: false, sortDesc: true })
    expect(fromV4SortBy([{ key: 'name', order: 'asc' }], false)).toEqual({ sortBy: false, sortDesc: false })
  })

  it('round-trips a false sortBy to an empty V4 array', () => {
    expect(fromV4SortBy(toV4SortBy(false, true), keys).sortBy).toBe(false)
  })
})
