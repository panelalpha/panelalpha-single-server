import type { InstalledTheme, RepositoryTheme } from '@/entities/project/instance-themes.api'
import { describe, expect, it } from 'vitest'
import { readMoreRating } from './theme-read-more'

function catalogue (rating: number | null | undefined): RepositoryTheme {
  return { id: 1, slug: 'astra', name: 'Astra', version: '4.0', rating }
}

describe('readMoreRating', () => {
  it('returns null for an installed theme, which has no rating', () => {
    const installed: InstalledTheme = { name: 'astra', title: 'Astra', version: '4.0', status: 'active' }

    expect(readMoreRating(installed)).toBeNull()
  })

  it('returns null when the catalogue rating is missing', () => {
    expect(readMoreRating(catalogue(null))).toBeNull()
    expect(readMoreRating(catalogue(undefined))).toBeNull()
  })

  it('shows a full rating as five full stars and the number five', () => {
    expect(readMoreRating(catalogue(100))).toEqual({ value: 5, filled: 5, empty: 0 })
  })

  it('shows a zero rating as five empty stars and zero', () => {
    expect(readMoreRating(catalogue(0))).toEqual({ value: 0, filled: 0, empty: 5 })
  })

  it('rounds the number up to a tenth, as legacy does (Math.ceil(rating / 2) / 10)', () => {
    expect(readMoreRating(catalogue(87))).toEqual({ value: 4.4, filled: 5, empty: 0 })
    expect(readMoreRating(catalogue(80))).toEqual({ value: 4, filled: 4, empty: 1 })
    expect(readMoreRating(catalogue(81))).toEqual({ value: 4.1, filled: 5, empty: 0 })
  })
})
