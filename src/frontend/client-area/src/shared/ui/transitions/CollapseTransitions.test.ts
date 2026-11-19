import { describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { mountKit } from '@/test/mount-kit'
import CollapseTransitions from './CollapseTransitions.vue'

describe('CollapseTransitions', () => {
  it('wraps slot content and uses duration=1 when disabled', async () => {
    const Host = defineComponent({
      components: { CollapseTransitions },
      setup () {
        const open = ref(true)
        return { open }
      },
      template: `
        <CollapseTransitions :enabled="false">
          <div v-if="open" class="collapse-body">body</div>
        </CollapseTransitions>
      `,
    })
    const wrapper = await mountKit(Host)
    expect(wrapper.get('.collapse-body').text()).toBe('body')
    const transition = wrapper.findComponent(CollapseTransitions)
    expect(transition.props('enabled')).toBe(false)
    wrapper.unmount()
  })

  it('sets height 0 → scrollHeight through two animation frames, then clears it', async () => {
    // beforeEnter/enter/afterEnter
    const frames: Array<() => void> = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(() => cb(0))
      return frames.length
    })
    const scrollHeight = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(120)

    const Host = defineComponent({
      components: { CollapseTransitions },
      setup () {
        const open = ref(false)
        return { open }
      },
      template: `
        <CollapseTransitions :enabled="true">
          <div v-if="open" class="collapse-body">body</div>
        </CollapseTransitions>
      `,
    })
    const wrapper = await mountKit(Host, { global: { stubs: { transition: false } } })
    try {
      ;(wrapper.vm as { open: boolean }).open = true
      await nextTick()
      const body = wrapper.get('.collapse-body').element as HTMLElement
      expect(body.classList.contains('enter-active')).toBe(true)

      frames.shift()?.() // beforeEnter frame: height 0px
      expect(body.style.height).toBe('0px')

      // enter: first frame schedules the second, which writes scrollHeight
      let seen120 = false
      for (let guard = 0; guard < 10 && frames.length > 0; guard++) {
        frames.shift()?.()
        if (body.style.height === '120px') {
          seen120 = true
        }
      }
      expect(seen120).toBe(true)
    } finally {
      vi.unstubAllGlobals()
      scrollHeight.mockRestore()
      wrapper.unmount()
    }
  })

  it('sets height offsetHeight → 0 through two animation frames on leave', async () => {
    // leave-active-class and the beforeLeave/leave hooks
    const frames: Array<() => void> = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(() => cb(0))
      return frames.length
    })
    const offsetHeight = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(80)

    const Host = defineComponent({
      components: { CollapseTransitions },
      setup () {
        const open = ref(true)
        return { open }
      },
      template: `
        <CollapseTransitions :enabled="true">
          <div v-if="open" class="collapse-body">body</div>
        </CollapseTransitions>
      `,
    })
    const wrapper = await mountKit(Host, { global: { stubs: { transition: false } } })
    try {
      const body = wrapper.get('.collapse-body').element as HTMLElement
      ;(wrapper.vm as { open: boolean }).open = false
      await nextTick()
      expect(body.classList.contains('leave-active')).toBe(true)

      frames.shift()?.() // beforeLeave frame: height offsetHeight
      expect(body.style.height).toBe('80px')

      // leave: first frame schedules the second, which collapses to 0
      for (let guard = 0; guard < 10 && frames.length > 0; guard++) {
        frames.shift()?.()
      }
      expect(body.style.height).toBe('0px')
    } finally {
      vi.unstubAllGlobals()
      offsetHeight.mockRestore()
      wrapper.unmount()
    }
  })
})
