import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import SuspendChip from './SuspendChip.vue'

describe('SuspendChip', () => {
  it('renders the kit chip in sand with the suspended icon and text, attributes on the chip', async () => {
    const wrapper = await mountKit(SuspendChip, { attrs: { 'class': 'ml-2', 'data-testid': 'chip' } })
    const chip = wrapper.get('[data-testid="chip"]')
    expect(chip.classes()).toEqual(expect.arrayContaining(['v-chip', 'status-label', 'status-label--sand', 'suspend-chip', 'ml-2']))
    expect(chip.find('.status-label__icon').exists()).toBe(true)
    expect(chip.text()).toBe('message.status.suspended')
    expect(wrapper.findComponent({ name: 'VTooltip' }).exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the suspended tooltip with withTooltip', async () => {
    const wrapper = await mountKit(SuspendChip, {
      props: { withTooltip: true },
      attrs: { 'data-testid': 'chip' },
      attachTo: document.body,
    })
    expect(wrapper.get('[data-testid="chip"]').classes()).toContain('suspend-chip')
    wrapper.getComponent({ name: 'VTooltip' }).vm.$emit('update:modelValue', true)
    await flushPromises()
    expect(document.body.textContent).toContain('tooltip.hosting.service.suspended')
    wrapper.unmount()
  })
})
