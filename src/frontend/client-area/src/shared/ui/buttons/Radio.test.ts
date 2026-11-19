import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import Radio from './Radio.vue'

describe('Radio', () => {
  it('renders legacy classes and toggles v-model on click', async () => {
    // The `column` option is omitted (always flex-row).
    const wrapper = await mountKit(Radio, {
      props: { modelValue: false, color: 'info', customClass: 'extra' },
      slots: { default: 'Option A' },
    })
    expectLegacyClasses(wrapper.element, ['d-flex', 'radio-container', 'mb-4', 'flex-row'])
    expectLegacyClasses(wrapper.get('.radio').element, ['radio', 'extra', 'text-info'])
    await wrapper.trigger('click')
    expect(wrapper.emitted('update:model-value')?.[0]).toEqual([true])
    wrapper.unmount()
  })

  it('adds radio--enabled when modelValue is true', async () => {
    const wrapper = await mountKit(Radio, { props: { modelValue: true } })
    expectLegacyClasses(wrapper.get('.radio').element, ['radio', 'radio--enabled', 'text-primary'])
    wrapper.unmount()
  })
})
