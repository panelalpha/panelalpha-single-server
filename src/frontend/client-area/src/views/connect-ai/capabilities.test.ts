import { describe, expect, it } from 'vitest'
import { CAPABILITY_CATEGORIES, categoryLabelKey } from './capabilities'

describe('capabilities', () => {
  it('has six categories with 5/5/3/5/4/4 commands (26 in total)', () => {
    expect(CAPABILITY_CATEGORIES.map(category => category.commands.length)).toEqual([5, 5, 3, 5, 4, 4])
    expect(CAPABILITY_CATEGORIES.flatMap(category => category.commands)).toHaveLength(26)
  })

  it('uses the legacy icons and copy keys', () => {
    expect(CAPABILITY_CATEGORIES.map(category => category.icon)).toEqual(['$grid', '$backup', '$globe', '$wrench', '$barchart', '$list'])
    expect(categoryLabelKey(CAPABILITY_CATEGORIES[0]!)).toBe('heading.connectAi.capabilities.daily')
    expect(CAPABILITY_CATEGORIES[4]!.commands[0]).toBe('heading.connectAi.commands.monitoring.502')
  })
})
