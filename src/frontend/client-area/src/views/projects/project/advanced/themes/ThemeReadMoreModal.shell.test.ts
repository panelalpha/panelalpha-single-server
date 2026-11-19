import type { InstalledTheme } from '@/entities/project/instance-themes.api'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import ThemeReadMoreModal from './ThemeReadMoreModal.vue'

// The dialog shell of the read more card. A separate file from `ThemeReadMoreModal.test.ts`.
const THEME = { name: 'astra', title: 'Astra', status: 'inactive', update: 'none', description: 'A theme' } as unknown as InstalledTheme

describe('ThemeReadMoreModal dialog shell (kit-dialog-advanced)', () => {
  it('opens only with an item, with the legacy transition', async () => {
    const wrapper = await mountKit(ThemeReadMoreModal, { props: { item: null, instanceId: 9, modelValue: true } })
    await flushPromises()

    expect(wrapper.findComponent({ name: 'VDialog' }).props('modelValue')).toBe(false)
    expect(wrapper.findComponent({ name: 'VDialog' }).props('transition')).toBe('custom-dialog-transition')

    await wrapper.setProps({ item: THEME })
    await flushPromises()

    expect(wrapper.findComponent({ name: 'VDialog' }).props('modelValue')).toBe(true)
    expect(document.body.querySelector('.v-overlay--active .readme-card')).not.toBeNull()
    wrapper.unmount()
  })

  it('passes the close request of the dialog on as update:model-value false', async () => {
    const wrapper = await mountKit(ThemeReadMoreModal, { props: { item: THEME, instanceId: 9, modelValue: true } })
    await flushPromises()

    wrapper.findComponent({ name: 'VDialog' }).vm.$emit('update:modelValue', false)
    await flushPromises()

    expect(wrapper.emitted('update:model-value')).toContainEqual([false])
    wrapper.unmount()
  })
})
