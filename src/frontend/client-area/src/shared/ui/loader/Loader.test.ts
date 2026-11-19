import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import Loader from './Loader.vue'

describe('Loader', () => {
  it('renders the legacy root class contract', async () => {
    // Root div.d-flex.justify-center.loader
    const wrapper = await mountKit(Loader)
    expectLegacyClasses(wrapper.element, ['d-flex', 'justify-center', 'loader'])
    expect(wrapper.find('.v-progress-circular').exists()).toBe(true)
    expect(wrapper.find('.my-4').exists()).toBe(true)
    wrapper.unmount()
  })

  it('is determinate when completed and skips margins when noMargins', async () => {
    const wrapper = await mountKit(Loader, {
      props: { completed: true, noMargins: true, size: 24 },
    })
    expect(wrapper.find('.my-4').exists()).toBe(false)
    const circular = wrapper.find('.v-progress-circular')
    expect(circular.exists()).toBe(true)
    wrapper.unmount()
  })
})
