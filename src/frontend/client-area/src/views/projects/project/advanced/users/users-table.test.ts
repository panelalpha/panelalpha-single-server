import type { InstanceAppUser } from './users.api'
import { describe, expect, it } from 'vitest'
import { isProtectedUser, USERS_CUSTOM_KEY_SORT, USERS_SEARCH_KEYS, usersHeaders } from './users-table'

const t = (key: string) => key

describe('usersHeaders', () => {
  it('lists the columns in legacy order with their keys, labels and sortability', () => {
    const headers = usersHeaders(t)

    expect(headers.map(header => header.value)).toEqual(['id', 'username', 'email', 'role', 'actions'])
    expect(headers.map(header => header.label)).toEqual(['table.header.id', 'table.header.login', 'table.header.email', 'table.header.role', ''])
    expect(headers.map(header => header.sortable)).toEqual([true, true, true, true, false])
  })
})

describe('USERS_SEARCH_KEYS', () => {
  it('searches the legacy searchable columns only', () => {
    expect(USERS_SEARCH_KEYS).toEqual(['id', 'username', 'email', 'role'])
  })
})

describe('isProtectedUser', () => {
  it('protects the user with id 1, also when the id arrives as a number', () => {
    expect(isProtectedUser({ id: '1' })).toBe(true)
    expect(isProtectedUser({ id: 1 as unknown as InstanceAppUser['id'] })).toBe(true)
  })

  it('does not protect other ids that start with 1', () => {
    expect(isProtectedUser({ id: '10' })).toBe(false)
    expect(isProtectedUser({ id: '2' })).toBe(false)
  })
})

describe('USERS_CUSTOM_KEY_SORT.id', () => {
  const compare = USERS_CUSTOM_KEY_SORT.id!

  it('compares ids as text, so "10" comes before "2"', () => {
    expect(compare('10', '2')).toBeLessThan(0)
    expect(compare('2', '10')).toBeGreaterThan(0)
  })

  it('does not throw on a null value', () => {
    expect(() => compare(null, '1')).not.toThrow()
  })
})
