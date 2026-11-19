import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import DeltaIndicator from './DeltaIndicator.vue'

describe('DeltaIndicator', () => {
  it('renders increase classes for positive values', async () => {
    const wrapper = await mountKit(DeltaIndicator, { props: { value: '+12%' } })
    expectLegacyClasses(wrapper.element, ['p-4', 'text-success'])
    expect(wrapper.text()).toContain('+12%')
    wrapper.unmount()
  })

  it('renders decrease classes for negative values', async () => {
    const wrapper = await mountKit(DeltaIndicator, { props: { value: '-3%' } })
    expectLegacyClasses(wrapper.element, ['p-4', 'text-error'])
    wrapper.unmount()
  })
})
