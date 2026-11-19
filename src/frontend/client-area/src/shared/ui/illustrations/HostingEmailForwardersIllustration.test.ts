import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import HostingEmailForwardersIllustration from './HostingEmailForwardersIllustration.vue'

describe('HostingEmailForwardersIllustration', () => {
  it('renders the 65x64 svg of 9 paths painted with the illustration theme variables', async () => {
    const wrapper = await mountKit(HostingEmailForwardersIllustration)
    expect(wrapper.element.tagName.toLowerCase()).toBe('svg')
    expect(wrapper.attributes('width')).toBe('65')
    expect(wrapper.attributes('height')).toBe('64')
    expect(wrapper.attributes('viewBox')).toBe('0 0 65 64')
    expect(wrapper.findAll('path')).toHaveLength(9)
    expect(wrapper.html()).toContain('var(--v-illustrations-lighten3)')
    expect(wrapper.html()).toContain('var(--v-illustrations-darken1)')
    wrapper.unmount()
  })
})
