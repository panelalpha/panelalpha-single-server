import type { ContainerGroup, ProxyRule } from './containers.api'
import { describe, expect, it } from 'vitest'
import { scopeGroups, scopeRules } from './containers-scope'

const group = (id: number | string, username: string) => ({ account: { id, username, domain: null }, containers: [] }) as unknown as ContainerGroup
const rule = (id: number, username: string | undefined, upstreamPort = 8080) => ({ id, username, upstream_port: upstreamPort }) as ProxyRule

describe('scopeGroups', () => {
  const groups = [group(1, 'alpha'), group(2, 'beta'), group(3, 'gamma')]

  it('reduces several projects to the one matching hostingId', () => {
    const result = scopeGroups(groups, 2)
    expect(result).toHaveLength(1)
    expect(result[0]?.account.username).toBe('beta')
  })

  it('matches number and string ids in both directions', () => {
    expect(scopeGroups(groups, '1')).toHaveLength(1)
    expect(scopeGroups([group('7', 'x')], 7)).toHaveLength(1)
  })

  it('returns an empty array when nothing matches', () => {
    expect(scopeGroups(groups, 99)).toEqual([])
    expect(scopeGroups([], 1)).toEqual([])
  })

  it('returns an empty array for null and undefined', () => {
    expect(scopeGroups(null, 1)).toEqual([])
    expect(scopeGroups(undefined, 1)).toEqual([])
  })
})

describe('scopeRules', () => {
  it('reduces rules sharing an upstream_port to the owner rules', () => {
    const rules = [rule(1, 'alpha'), rule(2, 'beta'), rule(3, 'beta', 9000)]
    expect(scopeRules(rules, 'beta').map(item => item.id)).toEqual([2, 3])
    expect(scopeRules(rules, 'alpha').map(item => item.id)).toEqual([1])
  })

  it('returns an empty array when the username is unknown or undefined', () => {
    expect(scopeRules([rule(1, 'alpha')], 'nobody')).toEqual([])
    expect(scopeRules([rule(1, 'alpha')], undefined)).toEqual([])
  })

  it('returns an empty array for null and undefined', () => {
    expect(scopeRules(null, 'alpha')).toEqual([])
    expect(scopeRules(undefined, 'alpha')).toEqual([])
  })
})
