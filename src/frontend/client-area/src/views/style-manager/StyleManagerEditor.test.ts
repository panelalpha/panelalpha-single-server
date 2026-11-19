import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VColorPicker } from 'vuetify/components'
import { mountKit } from '@/test/mount-kit'
import StyleManagerEditor from './StyleManagerEditor.vue'

describe('StyleManagerEditor', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  async function mountEditor () {
    setActivePinia(createPinia())
    const wrapper = await mountKit(StyleManagerEditor, { props: { colorKey: 'base', currentColor: '#07C07E' }, attachTo: document.body })
    await wrapper.find('.v-btn').trigger('click')
    await flushPromises()
    return wrapper
  }

  it('sends the last color of a drag once per frame (audit C9)', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    const wrapper = await mountEditor()
    const picker = wrapper.findComponent(VColorPicker)

    picker.vm.$emit('update:modelValue', '#111111')
    picker.vm.$emit('update:modelValue', '#222222')
    picker.vm.$emit('update:modelValue', '#333333')
    expect(wrapper.emitted('update:current-color')).toBeUndefined()

    vi.advanceTimersToNextFrame()
    expect(wrapper.emitted('update:current-color')).toEqual([[{ index: 'base', item: '#333333' }]])
    wrapper.unmount()
  })

  it('sends a pending color when it unmounts before the frame', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    const wrapper = await mountEditor()
    wrapper.findComponent(VColorPicker).vm.$emit('update:modelValue', '#444444')
    wrapper.unmount()
    expect(wrapper.emitted('update:current-color')).toEqual([[{ index: 'base', item: '#444444' }]])
  })
})
