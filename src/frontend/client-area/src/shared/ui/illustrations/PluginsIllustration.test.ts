import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import PluginsIllustration from './PluginsIllustration.vue'

describe('PluginsIllustration', () => {
  it('renders the 73x65 svg painted with the illustration theme variables', async () => {
    const wrapper = await mountKit(PluginsIllustration)
    expect(wrapper.element.tagName.toLowerCase()).toBe('svg')
    expect(wrapper.attributes('width')).toBe('73')
    expect(wrapper.attributes('height')).toBe('65')
    expect(wrapper.attributes('viewBox')).toBe('0 0 73 65')
    expect(wrapper.findAll('rect')).toHaveLength(6)
    expect(wrapper.html()).toContain('var(--v-illustrations-lighten2)')
    wrapper.unmount()
  })
})
