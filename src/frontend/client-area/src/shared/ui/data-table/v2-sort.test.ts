import { describe, expect, it } from 'vitest'
import { compareV2SortValues, sortByV2 } from './v2-sort'

interface Row { id: number, name?: string | null, size?: number | string | null }

describe('compareV2SortValues', () => {
  it('treats null on both sides as a tie', () => {
    expect(compareV2SortValues(null, null)).toBe(0)
  })

  it('ignores case', () => {
    expect(compareV2SortValues('Alpha', 'alpha')).toBe(0)
    expect(compareV2SortValues('Alpha', 'beta')).toBeLessThan(0)
  })

  it('sorts null first (as an empty string)', () => {
    expect(compareV2SortValues(null, 'a')).toBeLessThan(0)
    expect(compareV2SortValues('a', null)).toBeGreaterThan(0)
  })

  it('compares numeric values as numbers', () => {
    expect(compareV2SortValues(9, 10)).toBeLessThan(0)
    expect(compareV2SortValues('9', '10')).toBeLessThan(0)
  })
})

describe('sortByV2', () => {
  it('sorts by name ignoring case, ascending and descending', () => {
    const rows: Row[] = [{ id: 1, name: 'beta' }, { id: 2, name: 'Alpha' }, { id: 3, name: 'gamma' }]
    expect(sortByV2(rows, 'name', false).map(item => item.id)).toEqual([2, 1, 3])
    expect(sortByV2(rows, 'name', true).map(item => item.id)).toEqual([3, 1, 2])
  })

  it('puts null first ascending and last descending', () => {
    const rows: Row[] = [{ id: 1, name: 'b' }, { id: 2, name: null }, { id: 3, name: 'c' }]
    expect(sortByV2(rows, 'name', false).map(item => item.id)).toEqual([2, 1, 3])
    expect(sortByV2(rows, 'name', true).map(item => item.id)).toEqual([3, 1, 2])
  })

  it('sorts numbers numerically, not as text', () => {
    const rows: Row[] = [{ id: 1, size: 10 }, { id: 2, size: 9 }, { id: 3, size: 100 }]
    expect(sortByV2(rows, 'size', false).map(item => item.id)).toEqual([2, 1, 3])
  })

  it('does not mutate its input', () => {
    const rows: Row[] = [{ id: 1, name: 'b' }, { id: 2, name: 'a' }]
    const sorted = sortByV2(rows, 'name', false)
    expect(sorted).not.toBe(rows)
    expect(rows.map(item => item.id)).toEqual([1, 2])
  })
})
