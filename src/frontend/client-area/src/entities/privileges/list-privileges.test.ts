import { describe, expect, it } from 'vitest'
import { listPrivileges, listPrivilegesGroup } from './list-privileges'
import { PRIVILEGES } from './privileges'

const t = (key: string) => key

describe('listPrivileges', () => {
  it('lists the app keys with their group and the privileges.list.<key> text', () => {
    const list = listPrivileges(t)

    expect(list[0]).toEqual({ key: 'general.manage_labels', group: 'general', text: 'privileges.list.general.manage_labels' })
    expect(list.find(item => item.key === 'wordpress.clear_cache')?.group).toBe('wordpress')
    expect(list.find(item => item.key === 'hosting.manage_dns')?.group).toBe('hosting')
  })

  it('keeps each source to its own keys', () => {
    const app = listPrivileges(t).map(item => item.key)
    const lite = listPrivileges(t, true).map(item => item.key)

    expect(app).toContain(PRIVILEGES.MANAGE_CDN)
    expect(app).toContain(PRIVILEGES.VIEW_INSTALLATION_DETAILS)
    expect(app).not.toContain(PRIVILEGES.REDEPLOY)
    expect(lite).toContain(PRIVILEGES.REDEPLOY)
    expect(lite).toContain(PRIVILEGES.MANAGE_CONTAINERS)
    expect(lite).not.toContain(PRIVILEGES.MANAGE_CDN)
    expect(new Set([...app, ...lite])).toEqual(new Set(Object.values(PRIVILEGES)))
  })

  it('has no duplicate key in either list', () => {
    for (const singleServer of [false, true]) {
      const keys = listPrivileges(t, singleServer).map(item => item.key)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })
})

describe('listPrivilegesGroup', () => {
  it('has the three groups and the description of hosting only', () => {
    expect(listPrivilegesGroup(t)).toEqual([
      { key: 'general', text: 'privileges.group.general' },
      { key: 'wordpress', text: 'privileges.group.wordpress' },
      { key: 'hosting', text: 'privileges.group.hosting.title', description: 'privileges.group.hosting.description' },
    ])
  })
})
