import type { HostingDomain } from './domains.types'
import { describe, expect, it } from 'vitest'
import { matchesSearch, matchesValue } from './domains-filter'
import { domainHeaders } from './domains-list'

const row = {
  domain: 'Shop.Example.net',
  type: 'addon',
  type_text: 'Addon domain',
  document_root: '/home/example/public_html/shop',
  ssl_status: undefined,
  redirect_enabled: true,
} as unknown as HostingDomain

const headers = domainHeaders({ hosting_server_type: 'cpanel' })

describe('matchesValue', () => {
  it('skips null, undefined and booleans like the V2 default filter', () => {
    expect(matchesValue(null, 'a')).toBe(false)
    expect(matchesValue(undefined, 'a')).toBe(false)
    expect(matchesValue(true, 'true')).toBe(false)
  })

  it('compares the lower-cased string of numbers too', () => {
    expect(matchesValue(1234, '23')).toBe(true)
  })
})

describe('matchesSearch', () => {
  it('matches every row for an empty term', () => {
    expect(matchesSearch(row, '', headers)).toBe(true)
  })

  it('ignores the letter case of both sides', () => {
    expect(matchesSearch(row, 'SHOP.example', headers)).toBe(true)
  })

  it('tests the raw type, not the translated type text', () => {
    expect(matchesSearch(row, 'addon', headers)).toBe(true)
    expect(matchesSearch(row, 'shop.example', headers)).toBe(true) // the domain column
    expect(matchesSearch({ ...row, domain: 'x.org' }, 'Addon domain', headers)).toBe(false)
  })

  it('searches the document root of a cPanel service only', () => {
    const noDomain = { ...row, domain: 'x.org' }
    expect(matchesSearch(noDomain, 'public_html', headers)).toBe(true)
    expect(matchesSearch(noDomain, 'public_html', domainHeaders({ hosting_server_type: 'wp-cloud' }))).toBe(false)
  })

  it('does not search fields that are not columns', () => {
    expect(matchesSearch({ ...row, domain: 'x.org' }, 'true', headers)).toBe(false)
  })
})
