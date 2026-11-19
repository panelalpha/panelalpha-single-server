import { describe, expect, it } from 'vitest'
import { resolvePluginsEntry } from './plugins-entry'

function instance (allowed: boolean) {
  return { id: 7, hasManagePluginsPrivilege: () => allowed }
}

describe('resolvePluginsEntry', () => {
  it('lets a visitor with wordpress.manage_plugins in', () => {
    expect(resolvePluginsEntry(instance(true), '/projects')).toBeNull()
  })

  it('sends a visitor without the privilege to the general page of the project', () => {
    expect(resolvePluginsEntry(instance(false), '/projects')).toBe('/projects/7/general')
    expect(resolvePluginsEntry(instance(false), '/instances')).toBe('/instances/7/general')
  })
})
