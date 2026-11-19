import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mountKit } from '@/test/mount-kit'
import { useBodyScrollLock } from './body-scroll-lock'

describe('useBodyScrollLock', () => {
  it('sets html.scrollLock while the flag is open and removes it on close and on unmount', async () => {
    const open = ref(false)
    const Host = defineComponent({
      setup () {
        useBodyScrollLock(open)
        return () => h('div')
      },
    })

    const wrapper = await mountKit(Host)
    expect(document.documentElement.classList.contains('scrollLock')).toBe(false)

    open.value = true
    await wrapper.vm.$nextTick()
    expect(document.documentElement.classList.contains('scrollLock')).toBe(true)

    open.value = false
    await wrapper.vm.$nextTick()
    expect(document.documentElement.classList.contains('scrollLock')).toBe(false)

    open.value = true
    await wrapper.vm.$nextTick()
    wrapper.unmount()
    expect(document.documentElement.classList.contains('scrollLock')).toBe(false)
  })

  it('keeps the class while another component still holds the lock', async () => {
    const dialogOpen = ref(true)
    const cellOpen = ref(false)
    const make = (flag: typeof dialogOpen) => defineComponent({
      setup () {
        useBodyScrollLock(flag)
        return () => h('div')
      },
    })

    const dialog = await mountKit(make(dialogOpen))
    expect(document.documentElement.classList.contains('scrollLock')).toBe(true)

    // A closed user that mounts and unmounts while the dialog is open (a row checker) does not release the dialog's lock.
    const cell = await mountKit(make(cellOpen))
    expect(document.documentElement.classList.contains('scrollLock')).toBe(true)
    cell.unmount()
    expect(document.documentElement.classList.contains('scrollLock')).toBe(true)

    dialog.unmount()
    expect(document.documentElement.classList.contains('scrollLock')).toBe(false)
  })
})
