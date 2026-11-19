import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { VMenu } from 'vuetify/components'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import CopyTextButton from './CopyTextButton.vue'

describe('CopyTextButton', () => {
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

  it('renders the x-small icon button with the copy icon', async () => {
    // Legacy markup: copyButton ml-2, icon, x-small, color info, size 16.
    const wrapper = await mountKit(CopyTextButton, { props: { text: 'abc' } })
    const button = wrapper.get('button')
    expectLegacyClasses(button.element, ['copyButton', 'ml-2', 'v-btn--icon', 'v-btn--size-x-small', 'text-info'])
    const icon = wrapper.get('.v-icon')
    expectLegacyClasses(icon.element, ['text-info'])
    expect(icon.attributes('style')).toContain('16px')
    expect(icon.find('svg').exists()).toBe(true)
    wrapper.unmount()
  })

  it('uses the color and size props', async () => {
    const wrapper = await mountKit(CopyTextButton, { props: { text: 'abc', color: 'error', size: '20' } })
    expectLegacyClasses(wrapper.get('button').element, ['text-error'])
    expect(wrapper.get('.v-icon').attributes('style')).toContain('20px')
    wrapper.unmount()
  })

  it('opens a v-tooltip menu-tooltip menu on hover with the copy text', async () => {
    // The tooltip has content-class, hover, open-delay 150 and min-width 110;
    // z-index 9999 from the global `.menu-tooltip` !important rule (generic/_dropdowns.scss), which beat the inline 99
    host = document.createElement('div')
    document.body.append(host)
    const wrapper = await mountKit(CopyTextButton, { props: { text: 'abc' }, attachTo: host })
    await wrapper.get('button').trigger('mouseenter')
    await new Promise(resolve => setTimeout(resolve, 250))
    await nextTick()
    const content = document.body.querySelector<HTMLElement>('.v-overlay__content')
    expect(content).not.toBeNull()
    expectLegacyClasses(content!, ['v-tooltip', 'menu-tooltip'])
    const body = content!.querySelector('div')!
    expectLegacyClasses(body, ['px-2', 'py-2', 'text-center'])
    expect(body.textContent).toContain('tooltip.copy')
    // min-width is passed to the overlay (jsdom has no layout, so the inline style is not stable)
    expect(wrapper.findComponent(VMenu).props('minWidth')).toBe(110)
    expect(content!.closest<HTMLElement>('.v-overlay')!.style.zIndex).toBe('9999')
    // The tooltip sits at the bottom, nudged left 32 and down 32 from the activator top.
    const menu = wrapper.findComponent(VMenu)
    expect(menu.props('location')).toBe('top start')
    expect(menu.props('origin')).toBe('top start')
    expect(menu.props('offset')).toEqual([-32, 32])
    expect(menu.props('openDelay')).toBe(150)
    expect(menu.props('closeDelay')).toBe(0)
    wrapper.unmount()
  })

  it('resets to tooltip.copy 150 ms after the mouse leaves the button', async () => {
    // `@mouseleave` sits next to the menu's own `on` listeners.
    host = document.createElement('div')
    document.body.append(host)
    const wrapper = await mountKit(CopyTextButton, { props: { text: 'abc' }, attachTo: host })
    const button = wrapper.get('button')
    await button.trigger('click')
    await new Promise(resolve => setTimeout(resolve, 50))
    await nextTick()
    expect(document.body.querySelector('.v-overlay__content.menu-tooltip')?.textContent).toContain('tooltip.copied')
    await button.trigger('mouseleave')
    await new Promise(resolve => setTimeout(resolve, 200))
    await button.trigger('mouseenter')
    await new Promise(resolve => setTimeout(resolve, 250))
    await nextTick()
    expect(document.body.querySelector('.v-overlay__content.menu-tooltip')?.textContent).toContain('tooltip.copy')
    expect(document.body.querySelector('.v-overlay__content.menu-tooltip')?.textContent).not.toContain('tooltip.copied')
    wrapper.unmount()
  })

  it('keeps the classes of the ReportProviderTrackingCodeModal and LoginView consumers (color primary, size 24)', async () => {
    // The `ReportProviderTrackingCodeModal` and `LoginView` consumers pass `color="primary"` and `:size="24"`.
    const wrapper = await mountKit(CopyTextButton, { props: { text: 'abc', color: 'primary', size: 24 } })
    const button = wrapper.get('button')
    expectLegacyClasses(button.element, [
      'text-primary',
      'v-btn--icon',
      'v-btn--size-x-small',
      'v-btn--variant-text',
      'copyButton',
      'ml-2',
    ])
    const icon = wrapper.get('.v-icon')
    expectLegacyClasses(icon.element, ['text-primary'])
    expect(icon.attributes('style')).toContain('24px')
    wrapper.unmount()
  })

  it('puts data-testid and the activator attributes on the button, not on the menu root', async () => {
    host = document.createElement('div')
    document.body.append(host)
    const wrapper = await mountKit(CopyTextButton, {
      props: { text: 'abc' },
      attrs: { 'data-testid': 'copy-it' },
      attachTo: host,
    })
    const button = wrapper.get('button')
    expect(button.attributes('data-testid')).toBe('copy-it')
    expect(button.attributes('aria-haspopup')).toBe('menu')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(wrapper.element.querySelectorAll('[data-testid="copy-it"]')).toHaveLength(1)
    wrapper.unmount()
  })

  it('copies on click and shows tooltip.copied', async () => {
    host = document.createElement('div')
    document.body.append(host)
    const wrapper = await mountKit(CopyTextButton, { props: { text: 'abc' }, attachTo: host })
    await wrapper.get('button').trigger('click')
    await new Promise(resolve => setTimeout(resolve, 50))
    await nextTick()
    expect(writeText).toHaveBeenCalledWith('abc')
    const content = document.body.querySelector('.v-overlay__content.menu-tooltip')
    expect(content?.textContent).toContain('tooltip.copied')
    wrapper.unmount()
  })
})
