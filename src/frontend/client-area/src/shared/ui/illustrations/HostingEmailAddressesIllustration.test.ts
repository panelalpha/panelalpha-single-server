import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import HostingEmailAddressesIllustration from './HostingEmailAddressesIllustration.vue'

describe('HostingEmailAddressesIllustration', () => {
  it('renders the 84x75 svg of 10 paths painted with the illustration theme variables', async () => {
    const wrapper = await mountKit(HostingEmailAddressesIllustration)
    expect(wrapper.element.tagName.toLowerCase()).toBe('svg')
    expect(wrapper.attributes('width')).toBe('84')
    expect(wrapper.attributes('height')).toBe('75')
    expect(wrapper.attributes('viewBox')).toBe('0 0 84 75')
    expect(wrapper.findAll('path')).toHaveLength(10)
    expect(wrapper.html()).toContain('var(--v-illustrations-lighten3)')
    expect(wrapper.html()).toContain('var(--v-illustrations-darken1)')
    wrapper.unmount()
  })
})
