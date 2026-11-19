import { describe, expect, it } from 'vitest'
import { resourceBaseFor } from './advanced-resource-base'

describe('resourceBaseFor', () => {
  it('uses /projects only under the /projects route', () => {
    expect(resourceBaseFor('/projects/7/advanced/details')).toBe('/projects')
    expect(resourceBaseFor('/instances/7/advanced/details')).toBe('/instances')
    expect(resourceBaseFor('/')).toBe('/instances')
  })
})
