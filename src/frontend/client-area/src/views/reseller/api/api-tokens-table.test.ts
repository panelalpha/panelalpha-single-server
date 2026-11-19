import type { ResellerApiToken } from '@/views/reseller/reseller.api'
import { describe, expect, it } from 'vitest'
import {
  API_TOKEN_HEADERS,
  API_TOKEN_SEARCH_KEYS,
  DEFAULT_ITEMS_PER_PAGE,
  DEFAULT_SORT,
  filterTokens,
  matchesTokenValue,
  numberOfPages,
  POSSIBLE_ITEMS_PER_PAGE,
  showFooterDivider,
} from './api-tokens-table'

const TOKENS: ResellerApiToken[] = [
  { id: 1, name: 'Deploy Bot', last_used_at: null, created_at: '2026-10-01T10:00:00.000000Z' },
  { id: 2, name: 'ci', last_used_at: '2026-10-20T08:30:00.000000Z', created_at: '2026-09-15T12:00:00.000000Z' },
]

describe('api-tokens-table', () => {
  it('lists the columns in legacy order and only the actions column does not sort', () => {
    expect(API_TOKEN_HEADERS.map(header => [header.text, header.value, header.sortable])).toEqual([
      ['name', 'name', true],
      ['last_used_at', 'last_used_at', true],
      ['created_at', 'created_at', true],
      ['actions', 'actions', false],
    ])
  })

  it('sorts by name ascending by default with 10 per page out of 10/25/50', () => {
    expect(DEFAULT_SORT).toEqual({ sortBy: 'name', sortDesc: false })
    expect(POSSIBLE_ITEMS_PER_PAGE).toEqual([[10, 25, 50]])
    expect(DEFAULT_ITEMS_PER_PAGE).toBe(10)
  })

  it('counts pages from the total and the page size', () => {
    expect(numberOfPages(0, 10)).toBe(0)
    expect(numberOfPages(10, 10)).toBe(1)
    expect(numberOfPages(11, 10)).toBe(2)
    expect(numberOfPages(30, 25)).toBe(2)
  })

  it('hides the footer divider only for one page of 10', () => {
    expect(showFooterDivider(1, 10)).toBe(false)
    expect(showFooterDivider(2, 10)).toBe(true)
    expect(showFooterDivider(1, 25)).toBe(true)
  })

  describe('filterTokens', () => {
    it('ignores case', () => {
      expect(filterTokens(TOKENS, 'DEPLOY').map(token => token.id)).toEqual([1])
    })

    it('trims the phrase', () => {
      expect(filterTokens(TOKENS, '  ci  ').map(token => token.id)).toEqual([2])
    })

    it('keeps everything for an empty or blank phrase', () => {
      expect(filterTokens(TOKENS, '')).toEqual(TOKENS)
      expect(filterTokens(TOKENS, ' '.repeat(3))).toEqual(TOKENS)
    })

    it('does not match a null last_used_at', () => {
      expect(filterTokens(TOKENS, 'null')).toEqual([])
    })

    it('matches the raw ISO date', () => {
      expect(filterTokens(TOKENS, '2026-10-20').map(token => token.id)).toEqual([2])
      expect(filterTokens(TOKENS, 't08:30').map(token => token.id)).toEqual([2])
    })

    it('returns a copy for an empty phrase', () => {
      expect(filterTokens(TOKENS, '')).not.toBe(TOKENS)
    })
  })

  describe('matchesTokenValue (DataTable custom filter, the same rule as filterTokens)', () => {
    it('keeps everything for an empty or blank phrase', () => {
      expect(matchesTokenValue(null, '')).toBe(true)
      expect(matchesTokenValue('Deploy', ' '.repeat(3))).toBe(true)
    })

    it('never matches null, undefined or a boolean', () => {
      expect(matchesTokenValue(null, 'null')).toBe(false)
      expect(matchesTokenValue(undefined, 'undef')).toBe(false)
      expect(matchesTokenValue(true, 'true')).toBe(false)
    })

    it('trims the phrase and ignores case', () => {
      expect(matchesTokenValue('Deploy', ' dep ')).toBe(true)
    })

    it('reads the data columns only', () => {
      expect(API_TOKEN_SEARCH_KEYS).toEqual(['name', 'last_used_at', 'created_at'])
    })
  })
})
