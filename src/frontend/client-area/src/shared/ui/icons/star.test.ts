import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Star from './star.vue'

describe('star icon', () => {
  it('stays empty without percent (the $starIcon alias)', () => {
    // With no percent the grey rect covers the whole star.
    const wrapper = mount(Star)
    const rect = wrapper.get('rect')

    expect(rect.attributes('x')).toBe('0')
    expect(rect.attributes('width')).toBe('100%')
  })

  it('moves the grey part to the right of percent (x = 20 * percent, width = (1 - percent) * 100%)', () => {
    const wrapper = mount(Star, { props: { percent: 0.5 } })
    const rect = wrapper.get('rect')

    expect(rect.attributes('x')).toBe('10')
    expect(rect.attributes('width')).toBe('50%')
  })

  it('clamps percent to the range 0 to 1', () => {
    const wrapper = mount(Star, { props: { percent: 1.7 } })

    expect(wrapper.get('rect').attributes('x')).toBe('20')
    expect(wrapper.get('rect').attributes('width')).toBe('0%')
  })
})
