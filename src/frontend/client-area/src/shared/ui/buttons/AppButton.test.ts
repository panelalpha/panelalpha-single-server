import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { type Component, defineComponent, h } from 'vue'
import { VBtn, VBtnGroup, VBtnToggle, VTooltip } from 'vuetify/components'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import { openTooltip } from '@/test/tooltip'
import AppButton from './AppButton.vue'

// The literals the kit presets render today (`ModalCloseButton`, `CopyTextButton`, `BaseIconButton`, `QuickActionsButton`).
const slots = { default: '<span class="content">x</span>' }

describe('AppButton', () => {
  const html = async (component: Component, props: Record<string, unknown>) => normalizeHtml((await mountKit(component, { props, slots })).html())

  it('default renders a plain v-btn', async () => {
    expect(await html(AppButton, {})).toBe(await html(VBtn, {}))
  })

  it('close renders the modal close v-btn', async () => {
    expect(await html(AppButton, { kind: 'close', ariaLabel: 'button.close' })).toBe(await html(VBtn, { 'aria-label': 'button.close', 'class': 'modal-close-button', 'icon': true, 'size': 'x-small', 'variant': 'text' }))
  })

  it('icon renders the copy v-btn', async () => {
    expect(await html(AppButton, { kind: 'icon', color: 'primary' })).toBe(await html(VBtn, { color: 'primary', icon: true, size: 'x-small', variant: 'text' }))
  })

  it('icon-labeled renders the vertical text v-btn, flat when filled', async () => {
    expect(await html(AppButton, { kind: 'icon-labeled' })).toBe(await html(VBtn, { class: 'v-btn--vertical', elevation: '0', height: 'auto', variant: 'text' }))
    expect(await html(AppButton, { kind: 'icon-labeled', filled: true })).toBe(await html(VBtn, { class: 'v-btn--vertical', elevation: '0', height: 'auto', variant: 'flat' }))
  })

  it('page-add renders the primary Add v-btn, with the size and states of the caller', async () => {
    expect(await html(AppButton, { kind: 'page-add' })).toBe(await html(VBtn, { class: 'p-2 add-new-button page-title__add-button', color: 'primary', elevation: '0' }))
    expect(await html(AppButton, { kind: 'page-add', size: 'small', loading: true, disabled: true })).toBe(await html(VBtn, { class: 'p-2 add-new-button page-title__add-button', color: 'primary', disabled: true, elevation: '0', loading: true, size: 'small' }))
  })

  it('toolbar sets the class and aria-pressed from active, and none without active', async () => {
    const pressed = await mountKit(AppButton, { props: { kind: 'toolbar', active: true } })
    expect(pressed.find('button').attributes('aria-pressed')).toBe('true')
    expect(pressed.find('button').classes()).toContain('app-button--toolbar')
    const released = await mountKit(AppButton, { props: { kind: 'toolbar', active: false } })
    expect(released.find('button').attributes('aria-pressed')).toBe('false')
    const plain = await mountKit(AppButton, { props: { kind: 'toolbar' } })
    expect(plain.find('button').attributes('aria-pressed')).toBeUndefined()
    expect(plain.find('button').classes()).toContain('app-button--toolbar')
  })

  it('primary and cancel render the modal submit and the gray text v-btn', async () => {
    expect(await html(AppButton, { kind: 'primary' })).toBe(await html(VBtn, { color: 'primary', elevation: '0', variant: 'elevated' }))
    expect(await html(AppButton, { kind: 'cancel' })).toBe(await html(VBtn, { color: 'gray', elevation: '0', variant: 'text' }))
  })

  it('passes the loader slot to the v-btn', async () => {
    const wrapper = await mountKit(AppButton, { props: { kind: 'primary', loading: true }, slots: { ...slots, loader: '<span class="own-loader">wait</span>' } })
    expect(wrapper.get('.v-btn__loader').html()).toContain('own-loader')
  })

  it('size and color of the caller win over the kind', async () => {
    const wrapper = await mountKit(AppButton, { props: { kind: 'close', size: 'large', color: 'error' }, slots })
    expect(wrapper.get('button').classes()).toEqual(expect.arrayContaining(['v-btn--size-large', 'text-error']))
    expect(wrapper.get('button').classes()).not.toContain('v-btn--size-x-small')
  })

  it('passes data-testid, class, href attributes and click through to the button', async () => {
    const onClick = vi.fn()
    const wrapper = await mountKit(AppButton, {
      attrs: { 'data-testid': 'go', 'class': 'extra', 'href': '/x', 'target': '_blank', 'rel': 'noopener', onClick },
      props: { kind: 'close' },
      slots,
    })
    const button = wrapper.get('[data-testid="go"]')
    expect(button.classes()).toEqual(expect.arrayContaining(['modal-close-button', 'extra']))
    expect(button.attributes('href')).toBe('/x')
    expect(button.attributes('target')).toBe('_blank')
    expect(button.attributes('rel')).toBe('noopener')
    await button.trigger('click')
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders the slot', async () => {
    const wrapper = await mountKit(AppButton, { slots })
    expect(wrapper.get('.content').text()).toBe('x')
  })

  it('sets aria-label only when given', async () => {
    expect((await mountKit(AppButton, { slots })).get('button').attributes('aria-label')).toBeUndefined()
    expect((await mountKit(AppButton, { props: { ariaLabel: 'Close' }, slots })).get('button').attributes('aria-label')).toBe('Close')
  })

  it('loading adds the v-btn loading state', async () => {
    const wrapper = await mountKit(AppButton, { props: { loading: true }, slots })
    expect(wrapper.get('button').classes()).toContain('v-btn--loading')
  })

  it('disabled sets the attribute and swallows the click', async () => {
    const onClick = vi.fn()
    const wrapper = await mountKit(AppButton, { attrs: { onClick }, props: { disabled: true }, slots })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.get('button').trigger('click')
    expect(onClick).not.toHaveBeenCalled()
  })

  it('has one root element, the button (a v-menu activator anchor)', async () => {
    const wrapper = await mountKit(AppButton, { slots })
    expect((wrapper.vm.$el as HTMLElement).tagName).toBe('BUTTON')
  })

  it('row-action renders the small text icon v-btn', async () => {
    expect(await html(AppButton, { kind: 'row-action', ariaLabel: 'Edit' })).toBe(await html(VBtn, { 'aria-label': 'Edit', 'icon': true, 'size': 'small', 'variant': 'text' }))
  })

  it('icon-toggle renders the outlined primary v-btn when active and the text one otherwise', async () => {
    expect(await html(AppButton, { kind: 'icon-toggle', active: true })).toBe(await html(VBtn, { color: 'primary', icon: true, variant: 'outlined' }))
    expect(await html(AppButton, { kind: 'icon-toggle', active: false })).toBe(await html(VBtn, { icon: true, variant: 'text' }))
    expect(await html(AppButton, { kind: 'icon-toggle' })).toBe(await html(VBtn, { icon: true, variant: 'text' }))
  })

  it('passes active to the v-btn in the other kinds (impl-review F1)', async () => {
    expect(await html(AppButton, { kind: 'row-action', active: true })).toBe(await html(VBtn, { active: true, icon: true, size: 'small', variant: 'text' }))
    expect(await html(AppButton, { kind: 'row-action' })).toBe(await html(VBtn, { icon: true, size: 'small', variant: 'text' }))
  })
})

// The tooltip a row action wrote by hand: `v-tooltip` with an `activator` slot around a `v-btn`, then the text in a `span`.
function handWritten (tooltipProps: Record<string, unknown>, text: string, buttonProps: Record<string, unknown> = {}) {
  return defineComponent({
    render: () => h(VTooltip, { 'location': 'bottom', 'open-delay': '150', 'transition': 'custom-tooltip', 'z-index': 99, ...tooltipProps }, {
      activator: ({ props: activatorProps }: { props: Record<string, unknown> }) => h(VBtn, { ...activatorProps, icon: true, size: 'small', variant: 'text', ...buttonProps }, () => h('span', { class: 'content' }, 'x')),
      default: () => h('span', text),
    }),
  })
}

async function waitForTooltip () {
  await new Promise(resolve => setTimeout(resolve, 300))
  await flushPromises()
}

describe('AppButton tooltip', () => {
  const slots = { default: '<span class="content">x</span>' }
  const cases = [
    { name: 'without an offset', props: {}, hand: {} },
    { name: 'with offset 4', props: { tooltipOffset: 4 }, hand: { offset: 4 } },
    { name: 'with offset 14 and a content class', props: { tooltipOffset: 14, tooltipClass: 'users-row-tooltip' }, hand: { 'offset': 14, 'content-class': 'users-row-tooltip' } },
  ]

  for (const { name, props, hand } of cases) {
    it(`renders the same button and tooltip as the hand-written one ${name}`, async () => {
      const kit = await mountKit(AppButton, { props: { kind: 'row-action', ariaLabel: 'Edit', tooltip: 'Edit it', ...props }, slots })
      const raw = await mountKit(handWritten(hand, 'Edit it', { 'aria-label': 'Edit' }))
      expect(normalizeHtml(kit.html()).trim()).toBe(normalizeHtml(raw.html()).trim())

      const kitContent = await openTooltip(kit.get('button'))
      const rawContent = await openTooltip(raw.get('button'))
      expect(normalizeHtml(kitContent.innerHTML)).toBe(normalizeHtml(rawContent.innerHTML))
      expect(normalizeHtml(kitContent.innerHTML)).toBe('<span>Edit it</span>')
      expect(kitContent.closest('.v-overlay')!.className).toBe(rawContent.closest('.v-overlay')!.className)
      expect(kitContent.closest('.v-overlay')!.classList.contains('v-overlay--active')).toBe(true)
      expect(kit.get('button').attributes('aria-describedby')).toBeTruthy()
      kit.unmount()
      raw.unmount()
    })
  }

  it('opens on focus as the hand-written tooltip does', async () => {
    const kit = await mountKit(AppButton, { props: { kind: 'row-action', tooltip: 'Edit it' }, slots })
    const raw = await mountKit(handWritten({}, 'Edit it'))
    await kit.get('button').trigger('focus')
    await raw.get('button').trigger('focus')
    await waitForTooltip()
    for (const wrapper of [kit, raw]) {
      const id = wrapper.get('button').attributes('aria-describedby')
      expect(id).toBeTruthy()
      expect([...document.querySelectorAll('.v-tooltip')].find(element => element.id === id)!.textContent).toBe('Edit it')
    }
    kit.unmount()
    raw.unmount()
  })

  it('a disabled button handles a hover like the hand-written one', async () => {
    // `trigger()` skips a disabled element (the old version of this test sent no event), so the native event reaches the listeners.
    // In a browser a disabled button gets no pointer events; the kit only has to behave like the hand-written tooltip.
    const hoverOpens = async (wrapper: Awaited<ReturnType<typeof mountKit>>) => {
      wrapper.get('button').element.dispatchEvent(new MouseEvent('mouseenter'))
      await waitForTooltip()
      const id = wrapper.get('button').attributes('aria-describedby')
      const opened = document.querySelector('.v-tooltip.v-overlay--active') !== null
      wrapper.unmount()
      return { described: id !== undefined, opened }
    }
    const kit = await hoverOpens(await mountKit(AppButton, { props: { kind: 'row-action', tooltip: 'Edit it', disabled: true }, slots }))
    const raw = await hoverOpens(await mountKit(handWritten({}, 'Edit it', { disabled: true })))
    expect(kit).toEqual(raw)
  })

  it('has no tooltip without the prop', async () => {
    const wrapper = await mountKit(AppButton, { props: { kind: 'row-action' }, slots })
    await wrapper.get('button').trigger('mouseenter')
    await waitForTooltip()
    expect(wrapper.get('button').attributes('aria-describedby')).toBeUndefined()
    expect(document.querySelector('.v-tooltip')).toBeNull()
    wrapper.unmount()
  })

  it('keeps one root button with the consumer attributes when it has a tooltip', async () => {
    const onClick = vi.fn()
    const wrapper = await mountKit(AppButton, { attrs: { 'data-testid': 'row-edit', 'class': 'extra', onClick }, props: { kind: 'row-action', tooltip: 'Edit it' }, slots })
    expect((wrapper.vm.$el as HTMLElement).tagName).toBe('BUTTON')
    const button = wrapper.get('[data-testid="row-edit"]')
    expect(button.classes()).toContain('extra')
    await button.trigger('click')
    expect(onClick).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})

// The last kinds of the family, and a button without content (an `icon` name or a group item) like a raw v-btn.
describe('AppButton (kit-button-rest)', () => {
  const html = async (component: Component, props: Record<string, unknown>) => normalizeHtml((await mountKit(component, { props, slots })).html())

  it('danger, field, secondary, link and text render the v-btn of their kind', async () => {
    expect(await html(AppButton, { kind: 'danger' })).toBe(await html(VBtn, { color: 'error', elevation: '0', variant: 'elevated' }))
    expect(await html(AppButton, { kind: 'field' })).toBe(await html(VBtn, { color: 'primary', elevation: '0', variant: 'outlined' }))
    expect(await html(AppButton, { kind: 'secondary' })).toBe(await html(VBtn, { color: 'gray', elevation: '0', variant: 'outlined' }))
    expect(await html(AppButton, { kind: 'link' })).toBe(await html(VBtn, { color: 'primary', elevation: '0', variant: 'text' }))
    expect(await html(AppButton, { kind: 'text' })).toBe(await html(VBtn, { elevation: '0', variant: 'text' }))
  })

  it('the color of the caller wins over the kind (secondary error, link info, primary success)', async () => {
    expect(await html(AppButton, { kind: 'secondary', color: 'error' })).toBe(await html(VBtn, { color: 'error', elevation: '0', variant: 'outlined' }))
    expect(await html(AppButton, { kind: 'link', color: 'info' })).toBe(await html(VBtn, { color: 'info', elevation: '0', variant: 'text' }))
    expect(await html(AppButton, { kind: 'primary', color: 'success' })).toBe(await html(VBtn, { color: 'success', elevation: '0', variant: 'elevated' }))
  })

  it('renders the icon of the icon prop when it has no content, as a raw v-btn', async () => {
    const kit = await mountKit(AppButton, { attrs: { 'icon': 'mdi-home', 'aria-label': 'Home' } })
    const raw = await mountKit(VBtn, { props: { 'icon': 'mdi-home', 'aria-label': 'Home' } })
    expect(normalizeHtml(kit.html())).toBe(normalizeHtml(raw.html()))
    expect(kit.find('.v-icon.mdi-home').exists()).toBe(true)
  })

  it('is a raw v-btn inside a v-btn-group and a v-btn-toggle', async () => {
    const group = (button: Component) => defineComponent({
      render: () => h(VBtnGroup, { variant: 'outlined', divided: true }, () => [h(button, { 'icon': 'mdi-home', 'disabled': true, 'aria-label': 'Home' })]),
    })
    const toggle = (button: Component) => defineComponent({
      render: () => h(VBtnToggle, { modelValue: true, color: 'primary', variant: 'outlined', divided: true }, () => [
        h(button, { value: false, size: 'small' }, () => 'No'),
        h(button, { value: true, size: 'small' }, () => 'Yes'),
      ]),
    })
    expect(normalizeHtml((await mountKit(group(AppButton))).html())).toBe(normalizeHtml((await mountKit(group(VBtn))).html()))
    expect(normalizeHtml((await mountKit(toggle(AppButton))).html())).toBe(normalizeHtml((await mountKit(toggle(VBtn))).html()))
  })
})
