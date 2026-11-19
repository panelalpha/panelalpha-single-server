import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import AlertBox from './AlertBox.vue'

describe('AlertBox', () => {
  it('defaults to the alert variant and renders the slot', async () => {
    const wrapper = await mountKit(AlertBox, { slots: { default: 'Something failed' } })
    expect(wrapper.classes()).toEqual(['app-message', 'app-message--error'])
    expect(wrapper.text()).toBe('Something failed')
    wrapper.unmount()
  })

  it('switches to the ok variant', async () => {
    const wrapper = await mountKit(AlertBox, { props: { variant: 'ok' }, slots: { default: 'Done' } })
    expect(wrapper.classes()).toContain('app-message--success')
    expect(wrapper.classes()).not.toContain('app-message--error')
    wrapper.unmount()
  })

  it('passes attributes such as data-testid to the root element', async () => {
    const wrapper = await mountKit(AlertBox, { attrs: { 'data-testid': 'transfer-error' }, slots: { default: 'x' } })
    expect(wrapper.attributes('data-testid')).toBe('transfer-error')
    wrapper.unmount()
  })
})
