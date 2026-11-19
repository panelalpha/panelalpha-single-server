import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { useMobileScrollLock } from './mobile-scroll-lock'

const smAndDown = ref(true)
vi.mock('vuetify', () => ({ useDisplay: () => ({ smAndDown }) }))

const html = document.documentElement

function setup () {
  const open = ref(false)
  const wrapper = mount(defineComponent({
    setup () {
      useMobileScrollLock(open)
      return () => h('div')
    },
  }))
  return { open, wrapper }
}

describe('useMobileScrollLock', () => {
  it('sets html.overflow-y-hidden while open on a small screen and removes it on close', async () => {
    smAndDown.value = true
    const { open, wrapper } = setup()
    expect(html.classList.contains('overflow-y-hidden')).toBe(false)
    open.value = true
    await nextTick()
    expect(html.classList.contains('overflow-y-hidden')).toBe(true)
    open.value = false
    await nextTick()
    expect(html.classList.contains('overflow-y-hidden')).toBe(false)
    wrapper.unmount()
  })

  it('does nothing on a wide screen', async () => {
    smAndDown.value = false
    const { open, wrapper } = setup()
    open.value = true
    await nextTick()
    expect(html.classList.contains('overflow-y-hidden')).toBe(false)
    wrapper.unmount()
  })

  it('removes the class when the dialog unmounts while open', async () => {
    smAndDown.value = true
    const { open, wrapper } = setup()
    open.value = true
    await nextTick()
    wrapper.unmount()
    expect(html.classList.contains('overflow-y-hidden')).toBe(false)
  })

  it('keeps the class while another dialog is open when a closed one mounts or unmounts', async () => {
    smAndDown.value = true
    const first = setup()
    first.open.value = true
    await nextTick()
    const second = setup()
    await nextTick()
    expect(html.classList.contains('overflow-y-hidden')).toBe(true)
    second.wrapper.unmount()
    expect(html.classList.contains('overflow-y-hidden')).toBe(true)
    first.open.value = false
    await nextTick()
    expect(html.classList.contains('overflow-y-hidden')).toBe(false)
    first.wrapper.unmount()
  })
})
