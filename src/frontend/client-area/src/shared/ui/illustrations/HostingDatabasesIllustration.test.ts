import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import HostingDatabasesIllustration from './HostingDatabasesIllustration.vue'

describe('HostingDatabasesIllustration', () => {
  it('renders the 64x64 svg of 16 paths painted with the illustration theme variables', async () => {
    const wrapper = await mountKit(HostingDatabasesIllustration)
    expect(wrapper.element.tagName.toLowerCase()).toBe('svg')
    expect(wrapper.attributes('width')).toBe('64')
    expect(wrapper.attributes('height')).toBe('64')
    expect(wrapper.attributes('viewBox')).toBe('0 0 64 64')
    expect(wrapper.findAll('path')).toHaveLength(16)
    expect(wrapper.html()).toContain('var(--v-illustrations-lighten3)')
    expect(wrapper.html()).toContain('var(--v-illustrations-darken2)')
    wrapper.unmount()
  })
})
