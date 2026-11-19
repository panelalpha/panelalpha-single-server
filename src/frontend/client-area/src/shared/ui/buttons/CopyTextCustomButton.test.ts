import { DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { VMenu } from 'vuetify/components'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import CopyTextCustomButton from './CopyTextCustomButton.vue'

describe('CopyTextCustomButton', () => {
  let host: HTMLDivElement | undefined
  const writeText = vi.fn<(text: string) => Promise<void>>()

  beforeEach(() => {
    writeText.mockReset()
    writeText.mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  })

  afterEach(() => {
    host?.remove()
    host = undefined
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  // Activator div wrapping the slot (mouseenter/mouseleave do not bubble from the span)
  const activator = (wrapper: VueWrapper) => new DOMWrapper(wrapper.get('.slot-activator').element.parentElement!)

  async function mountCustom () {
    host = document.createElement('div')
    document.body.append(host)
    return mountKit(CopyTextCustomButton, {
      props: { text: 'abc' },
      slots: { default: '<span class="slot-activator">Copy me</span>' },
      attachTo: host,
    })
  }

  it('renders the default slot as the activator', async () => {
    const wrapper = await mountCustom()
    expect(wrapper.get('.slot-activator').text()).toBe('Copy me')
    wrapper.unmount()
  })

  it('opens a menu-tooltip (without v-tooltip) on hover', async () => {
    // The tooltip has content-class menu-tooltip and min-width 110;
    // z-index 9999 from the global `.menu-tooltip` !important rule (generic/_dropdowns.scss), which beat the inline 204
    const wrapper = await mountCustom()
    await activator(wrapper).trigger('mouseenter')
    await new Promise(resolve => setTimeout(resolve, 250))
    await nextTick()
    const content = document.body.querySelector<HTMLElement>('.v-overlay__content')
    expect(content).not.toBeNull()
    expectLegacyClasses(content!, ['menu-tooltip'])
    expect(content!.classList.contains('v-tooltip')).toBe(false)
    expectLegacyClasses(content!.querySelector('div')!, ['px-2', 'py-2', 'text-center'])
    expect(content!.textContent).toContain('tooltip.copy')
    // min-width is passed to the overlay (jsdom has no layout, so the inline style is not stable)
    expect(wrapper.findComponent(VMenu).props('minWidth')).toBe(110)
    expect(content!.closest<HTMLElement>('.v-overlay')!.style.zIndex).toBe('9999')
    // The tooltip sits at the bottom, nudged left 32 and down 32 from the activator top.
    const menu = wrapper.findComponent(VMenu)
    expect(menu.props('location')).toBe('top start')
    expect(menu.props('origin')).toBe('top start')
    expect(menu.props('offset')).toEqual([-32, 32])
    wrapper.unmount()
  })

  it('copies on click and closes on mouseleave', async () => {
    // The open state is two-way.
    const wrapper = await mountCustom()
    await wrapper.get('.slot-activator').trigger('click')
    await new Promise(resolve => setTimeout(resolve, 50))
    await nextTick()
    expect(writeText).toHaveBeenCalledWith('abc')
    expect(document.body.querySelector('.v-overlay__content.menu-tooltip')?.textContent).toContain('tooltip.copied')
    expect(wrapper.findComponent(VMenu).props('modelValue')).toBe(true)
    await activator(wrapper).trigger('mouseleave')
    await nextTick()
    expect(wrapper.findComponent(VMenu).props('modelValue')).toBe(false)
    wrapper.unmount()
  })
})
