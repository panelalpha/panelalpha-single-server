import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import HostingDomainsNoTextIllustration from './HostingDomainsNoTextIllustration.vue'

describe('HostingDomainsNoTextIllustration', () => {
  it('renders the 73x64 svg painted with the illustration theme variables', async () => {
    const wrapper = await mountKit(HostingDomainsNoTextIllustration)
    expect(wrapper.element.tagName.toLowerCase()).toBe('svg')
    expect(wrapper.attributes('width')).toBe('73')
    expect(wrapper.attributes('height')).toBe('64')
    expect(wrapper.attributes('viewBox')).toBe('0 0 73 64')
    expect(wrapper.findAll('path')).toHaveLength(14)
    expect(wrapper.html()).toContain('var(--v-illustrations-lighten2)')
    wrapper.unmount()
  })
})
