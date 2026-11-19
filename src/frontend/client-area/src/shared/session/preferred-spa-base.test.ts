import { describe, expect, it } from 'vitest'
import { preferredSpaBase, preferredSpaBaseLabels } from './preferred-spa-base'

describe('preferredSpaBase', () => {
  it('returns /projects when single-server mode is active', () => {
    expect(preferredSpaBase({ app: { single_server: { active: true } } })).toBe('/projects')
  })

  it('returns /instances when single-server mode is inactive or absent', () => {
    expect(preferredSpaBase({ app: { single_server: { active: false } } })).toBe('/instances')
    expect(preferredSpaBase({ app: { single_server: {} } })).toBe('/instances')
    expect(preferredSpaBase({ app: {} })).toBe('/instances')
  })

  it('returns /instances without a home payload', () => {
    expect(preferredSpaBase(null)).toBe('/instances')
    expect(preferredSpaBase(undefined)).toBe('/instances')
  })
})

describe('preferredSpaBaseLabels', () => {
  it('names the projects list under single server', () => {
    expect(preferredSpaBaseLabels({ app: { single_server: { active: true } } })).toEqual({
      name: 'heading.navbar.tab.myProjects',
      back: 'button.projects.back',
    })
  })

  it('names the instances list otherwise, also without a home payload', () => {
    const instances = { name: 'heading.navbar.tab.myInstances', back: 'button.instances.back' }
    expect(preferredSpaBaseLabels({ app: { single_server: { active: false } } })).toEqual(instances)
    expect(preferredSpaBaseLabels({ app: {} })).toEqual(instances)
    expect(preferredSpaBaseLabels(null)).toEqual(instances)
  })
})
