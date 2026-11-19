import { afterEach, describe, expect, it } from 'vitest'
import { fromNow } from '@/shared/time/from-now'
import {
  isProtectedWordpressUser,
  registeredText,
  WORDPRESS_USERS_CUSTOM_KEY_SORT,
  WORDPRESS_USERS_SEARCH_KEYS,
  wordpressUsersHeaders,
} from './wordpress-users-table'

const t = (key: string) => key

const ORIGINAL_TZ = process.env.TZ

describe('wordpressUsersHeaders', () => {
  it('lists the columns in legacy order with their keys, labels and sortability', () => {
    const headers = wordpressUsersHeaders(t)

    expect(headers.map(header => header.value)).toEqual(['id', 'username', 'display_name', 'email', 'role', 'user_registered', 'actions'])
    expect(headers.map(header => header.label)).toEqual([
      'table.header.id',
      'table.header.login',
      'table.header.displayName',
      'table.header.email',
      'table.header.role',
      'table.header.registered',
      '',
    ])
    expect(headers.map(header => header.sortable)).toEqual([true, true, true, true, true, true, false])
  })
})

describe('WORDPRESS_USERS_SEARCH_KEYS', () => {
  it('searches the legacy searchable columns only, not the registration date', () => {
    expect(WORDPRESS_USERS_SEARCH_KEYS).toEqual(['id', 'username', 'display_name', 'email', 'role'])
    expect(WORDPRESS_USERS_SEARCH_KEYS).not.toContain('user_registered')
  })
})

describe('WORDPRESS_USERS_CUSTOM_KEY_SORT', () => {
  it('has a text comparator for each of the six sortable keys', () => {
    expect(Object.keys(WORDPRESS_USERS_CUSTOM_KEY_SORT).toSorted()).toEqual(
      ['display_name', 'email', 'id', 'role', 'user_registered', 'username'],
    )
  })

  it('compares ids as text, so "10" comes before "2"', () => {
    const compare = WORDPRESS_USERS_CUSTOM_KEY_SORT.id!
    expect(compare('10', '2')).toBeLessThan(0)
    expect(compare('2', '10')).toBeGreaterThan(0)
  })

  it('does not throw on a null registration date and sorts it as an empty string', () => {
    const compare = WORDPRESS_USERS_CUSTOM_KEY_SORT.user_registered!
    expect(() => compare(null, '2026-01-01')).not.toThrow()
    expect(compare(null, '2026-01-01')).toBeLessThan(0)
    expect(() => compare(null, null)).not.toThrow()
  })
})

describe('isProtectedWordpressUser', () => {
  it('protects the user with id 1, also when the id arrives as a string or a number', () => {
    expect(isProtectedWordpressUser({ id: '1' })).toBe(true)
    expect(isProtectedWordpressUser({ id: 1 })).toBe(true)
  })

  it('does not protect other ids that start with 1', () => {
    expect(isProtectedWordpressUser({ id: 11 })).toBe(false)
    expect(isProtectedWordpressUser({ id: '10' })).toBe(false)
  })
})

describe('registeredText', () => {
  it('shows the time since a registration date', () => {
    const now = new Date('2026-10-23T12:00:00Z')
    expect(registeredText('2026-10-23T11:00:00Z', now)).toBe(fromNow('2026-10-23T11:00:00Z', now))
  })

  it('gives the Invalid date text for a null date', () => {
    expect(registeredText(null)).toBe('Invalid date')
  })
})

describe('registeredText with the zone-less WordPress timestamp', () => {
  afterEach(() => {
    if (ORIGINAL_TZ === undefined) {
      delete process.env.TZ
    } else {
      process.env.TZ = ORIGINAL_TZ
    }
  })

  // `user_registered` is UTC without a zone (API and `wp user list` agree); reading it as local time shifts it by
  // the browser's offset, which is what these cases pin in a zone ahead of UTC and in one behind it.
  it.each(['Europe/Warsaw', 'America/New_York'])('reads it as UTC in %s', zone => {
    process.env.TZ = zone
    const now = new Date('2026-11-14T20:41:28Z')
    expect(registeredText('2026-11-14 20:40:32', now)).toBe('a minute ago')
  })

  it('keeps a timestamp that carries a zone as it is', () => {
    process.env.TZ = 'Europe/Warsaw'
    const now = new Date('2026-11-14T20:41:28Z')
    expect(registeredText('2026-11-14T20:40:32Z', now)).toBe('a minute ago')
  })
})
