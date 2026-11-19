import { describe, expect, it } from 'vitest'
import { buildInstanceKeys } from './instance-keys'
import { DEFAULT_SORT_KEY, defaultSortDesc, newestHeader, sortOptions, toSortQuery } from './instance-sort'

describe('instance-sort', () => {
  it('offers name, bandwidth, storage and newest, in table order', () => {
    expect(sortOptions(buildInstanceKeys(false)).map(key => key.text)).toEqual([
      'name', 'bandwidth', 'storage', 'newest',
    ])
  })

  it('offers no sort the list cannot apply: visitors has no per-project count', () => {
    const visitors = buildInstanceKeys(false).find(key => key.text === 'visitors')
    expect(visitors?.sortable).toBe(false)
  })

  it('maps every option to its sort_by value', () => {
    const values = sortOptions(buildInstanceKeys(true)).map(key => toSortQuery(key, true).sort_by)
    expect(values).toEqual(['name', 'bandwidth', 'storage', 'created_at'])
  })

  it('maps sortDesc to sort_dir', () => {
    expect(toSortQuery({ value: 'name' }, true)).toEqual({ sort_by: 'name', sort_dir: 'desc' })
    expect(toSortQuery({ value: 'name' }, false)).toEqual({ sort_by: 'name', sort_dir: 'asc' })
  })

  it('falls back to newest without a header', () => {
    expect(toSortQuery(false, true)).toEqual({ sort_by: DEFAULT_SORT_KEY, sort_dir: 'desc' })
  })

  it('starts Name ascending and keeps newest, bandwidth and storage descending', () => {
    expect(defaultSortDesc({ value: 'name' })).toBe(false)
    expect(defaultSortDesc({ value: 'created_at' })).toBe(true)
    expect(defaultSortDesc({ value: 'bandwidth' })).toBe(true)
    expect(defaultSortDesc({ value: 'storage' })).toBe(true)
    expect(defaultSortDesc(false)).toBe(true)
  })

  it('builds the newest header for instance-created', () => {
    // `text` is the copy key suffix the sort dropdown looks up as `form.option.newest`
    expect(newestHeader()).toEqual({ text: 'newest', value: 'created_at' })
  })
})
