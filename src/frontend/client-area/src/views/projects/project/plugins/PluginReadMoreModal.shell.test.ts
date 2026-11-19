import type { InstalledPlugin } from '@/entities/project/instance-plugins.api'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import PluginReadMoreModal from './PluginReadMoreModal.vue'

// The dialog shell of the read more card. Separate file from `PluginReadMoreModal.test.ts`.
const PLUGIN = { name: 'akismet', title: 'Akismet', status: 'inactive', description: 'A plugin' } as unknown as InstalledPlugin

describe('PluginReadMoreModal dialog shell (kit-dialog-advanced)', () => {
  it('opens only with an item, with the legacy transition', async () => {
    const wrapper = await mountKit(PluginReadMoreModal, { props: { item: null, modelValue: true } })
    await flushPromises()

    expect(wrapper.findComponent({ name: 'VDialog' }).props('modelValue')).toBe(false)
    expect(wrapper.findComponent({ name: 'VDialog' }).props('transition')).toBe('custom-dialog-transition')

    await wrapper.setProps({ item: PLUGIN })
    await flushPromises()

    expect(wrapper.findComponent({ name: 'VDialog' }).props('modelValue')).toBe(true)
    expect(document.body.querySelector('.v-overlay--active .readme-card')).not.toBeNull()
    wrapper.unmount()
  })

  it('passes the close request of the dialog on as update:model-value false', async () => {
    const wrapper = await mountKit(PluginReadMoreModal, { props: { item: PLUGIN, modelValue: true } })
    await flushPromises()

    wrapper.findComponent({ name: 'VDialog' }).vm.$emit('update:modelValue', false)
    await flushPromises()

    expect(wrapper.emitted('update:model-value')).toContainEqual([false])
    wrapper.unmount()
  })
})
