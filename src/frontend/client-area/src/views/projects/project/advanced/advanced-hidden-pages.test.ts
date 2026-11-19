import { describe, expect, it } from 'vitest'
import { ADVANCED_HIDDEN_PAGES, hiddenAdvancedPageOf, isAdvancedPageHidden } from './advanced-hidden-pages'

describe('advanced hidden pages', () => {
  it('hides copy-instance and users only', () => {
    expect(ADVANCED_HIDDEN_PAGES).toEqual(['copy-instance', 'users'])
    expect(isAdvancedPageHidden('users')).toBe(true)
    expect(isAdvancedPageHidden('copy-instance')).toBe(true)
    expect(isAdvancedPageHidden('wordpress-users')).toBe(false)
    expect(isAdvancedPageHidden('details')).toBe(false)
  })

  it.each([
    ['/projects/5/advanced/users', 'users'],
    ['/instances/5/advanced/users', 'users'],
    ['/projects/5/advanced/copy-instance', 'copy-instance'],
    ['/instances/5/advanced/copy-instance/', 'copy-instance'],
    ['/instances/5/advanced/wordpress-users', null],
    ['/projects/5/advanced/details', null],
    ['/projects/5/users', null],
    [undefined, null],
  ])('hiddenAdvancedPageOf(%s) is %s', (path, expected) => {
    expect(hiddenAdvancedPageOf(path)).toBe(expected)
  })
})
