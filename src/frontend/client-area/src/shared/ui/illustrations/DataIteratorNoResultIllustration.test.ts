import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import DataIteratorNoResultIllustration from './DataIteratorNoResultIllustration.vue'

describe('DataIteratorNoResultIllustration', () => {
  it('renders the 65x65 svg painted with the illustration theme variables', async () => {
    const wrapper = await mountKit(DataIteratorNoResultIllustration)
    expect(wrapper.element.tagName.toLowerCase()).toBe('svg')
    expect(wrapper.attributes('width')).toBe('65')
    expect(wrapper.attributes('height')).toBe('65')
    expect(wrapper.attributes('viewBox')).toBe('0 0 65 65')
    expect(wrapper.findAll('path').length).toBeGreaterThan(5)
    expect(wrapper.html()).toContain('var(--v-illustrations-darken1)')
    wrapper.unmount()
  })
})
