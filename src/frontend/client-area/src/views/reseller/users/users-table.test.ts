import { describe, expect, it } from 'vitest'
import { DEFAULT_SORT, isNameNotSet, RESELLER_USERS_SEARCH_KEYS, resellerUsersHeaders } from './users-table'

describe('users-table', () => {
  it('lists the legacy headers in order, actions last, unsortable and without a label', () => {
    expect(resellerUsersHeaders().map(header => [header.text, header.value, header.sortable])).toEqual([
      ['user', 'name', true],
      ['email', 'email', true],
      ['instances', 'instances_count', true],
      ['actions', 'actions', false],
    ])
    expect(resellerUsersHeaders()[3]?.label).toBe('')
  })

  it('searches name, email and the instances count, and matches the keys of the searchable headers', () => {
    expect(RESELLER_USERS_SEARCH_KEYS).toEqual(['name', 'email', 'instances_count'])
    expect(resellerUsersHeaders().filter(header => header.sortable).map(header => header.value)).toEqual(RESELLER_USERS_SEARCH_KEYS)
  })

  it('sorts by name ascending by default', () => {
    expect(DEFAULT_SORT).toEqual({ sortBy: 'name', sortDesc: false })
  })

  it('treats a name equal to the email as not set', () => {
    expect(isNameNotSet({ name: 'a@b.c', email: 'a@b.c' })).toBe(true)
    expect(isNameNotSet({ name: 'Ann', email: 'a@b.c' })).toBe(false)
  })
})
