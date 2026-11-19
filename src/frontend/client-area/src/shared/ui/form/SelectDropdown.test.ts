import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import SelectDropdown from './SelectDropdown.vue'

const items = [
  { text: 'one', value: 'a' },
  { text: 'two', value: 'b', tooltip: 'Second option' },
]

describe('SelectDropdown', () => {
  let host: HTMLDivElement | undefined

  afterEach(() => {
    host?.remove()
    host = undefined
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  async function mountAttached (props: Record<string, unknown>, slots: Record<string, string> = {}) {
    host = document.createElement('div')
    document.body.append(host)
    return mountKit(SelectDropdown, { props: { items, placeholder: 'Pick', ...props }, slots, attachTo: host })
  }

  async function openMenu (wrapper: Awaited<ReturnType<typeof mountAttached>>): Promise<HTMLElement> {
    await wrapper.get('.v-field').trigger('mousedown')
    return vi.waitFor(() => {
      const content = document.body.querySelector<HTMLElement>('.v-overlay__content.custom-dropdown-select')
      expect(content).not.toBeNull()
      return content!
    })
  }

  it('renders the closed class contract', async () => {
    // Class list; defaults bold/outlined/size lg
    const wrapper = await mountAttached({ modelValue: '' })
    expectLegacyClasses(wrapper.element, [
      'v-input', 'v-select', 'filter-select', 'custom-select',
      'v-select--select-bold', 'v-input--lg', 'input-dropdown',
    ])
    expect(wrapper.classes()).not.toContain('custom-select--block')
    expect(wrapper.classes()).not.toContain('v-select--active-menu')
    expect(wrapper.find('.v-field--variant-outlined').exists()).toBe(true)
    // empty value shows the native placeholder, as V2 showed the label when nothing matched
    expect(wrapper.find('.select-dropdown__selection').exists()).toBe(false)
    expect(wrapper.get('input').attributes('placeholder')).toBe('Pick')
    expect(wrapper.find('.v-field--dirty').exists()).toBe(false)
    expect(wrapper.find('.v-field__append-inner .v-icon svg').exists()).toBe(true)
    wrapper.unmount()
  })

  it('treats empty string and null alike: native placeholder, not dirty, even when clearable', async () => {
    // V4 wraps '' as a selected item; the kit passes null so there is one placeholder path
    for (const modelValue of ['', null]) {
      const wrapper = await mountAttached({ modelValue, clearable: true })
      expect(wrapper.find('.select-dropdown__selection').exists()).toBe(false)
      expect(wrapper.get('input').attributes('placeholder')).toBe('Pick')
      expect(wrapper.find('.v-field--dirty').exists()).toBe(false)
      wrapper.unmount()
    }
  })

  it('opens a teleported custom-dropdown-select menu with translated items', async () => {
    // contentClass and the item slot
    const wrapper = await mountAttached({ modelValue: '' })
    expect(document.body.querySelector('.custom-dropdown-select')).toBeNull()
    const content = await openMenu(wrapper)
    expect(wrapper.classes()).toContain('v-select--active-menu')
    const rows = content.querySelectorAll('.v-list-item .input-dropdown-item')
    expect([...rows].map(row => row.querySelector('span')?.textContent)).toEqual([
      'form.option.one', 'form.option.two',
    ])
    expect(rows[0]!.querySelector('.input-dropdown-item__icon')).not.toBeNull()
    wrapper.unmount()
  })

  it('adds menuClass to the menu overlay and keeps the default class without it (ui-services)', async () => {
    const withClass = await mountAttached({ modelValue: '', menuClass: 'screen-menu' })
    const content = await openMenu(withClass)
    expect(content.classList.contains('screen-menu')).toBe(true)
    withClass.unmount()
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
    const plain = await mountAttached({ modelValue: '' })
    const plainContent = await openMenu(plain)
    expect(plainContent.className).not.toContain('screen-menu')
    expect(plainContent.className.trim()).toBe(plainContent.className.replace(/\s+/g, ' ').trim())
    plain.unmount()
  })

  it('marks the selected item and shows its label', async () => {
    // aria-selected on .input-dropdown-item
    const wrapper = await mountAttached({ modelValue: items[1] })
    expect(wrapper.get('.select-dropdown__selection').text()).toBe('form.option.two')
    const content = await openMenu(wrapper)
    const rows = content.querySelectorAll('.input-dropdown-item')
    expect(rows[0]!.getAttribute('aria-selected')).toBe('false')
    expect(rows[1]!.getAttribute('aria-selected')).toBe('true')
    wrapper.unmount()
  })

  it('emits update:modelValue with the chosen item, closes the menu and blurs', async () => {
    // Blur, then emit; V2 selectItem closes the menu
    const wrapper = await mountAttached({ modelValue: '' })
    const content = await openMenu(wrapper)
    const item = content.querySelector<HTMLElement>('.v-list-item')!
    item.focus()
    item.click()
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toMatchObject({ value: 'a' })
    await vi.waitFor(() => {
      expect(wrapper.classes()).not.toContain('v-select--active-menu')
      expect(content.contains(document.activeElement)).toBe(false)
    })
    wrapper.unmount()
  })

  it('shows a right-hand tooltip for items with a tooltip', async () => {
    // content-class tooltip-left-center, open-delay 200
    const wrapper = await mountAttached({ modelValue: '' })
    const content = await openMenu(wrapper)
    const rows = content.querySelectorAll('.v-list-item')
    expect(rows[0]!.querySelector('.w-100')).toBeNull()
    const activator = rows[1]!.querySelector<HTMLElement>('.w-100')!
    activator.dispatchEvent(new MouseEvent('mouseenter'))
    await vi.waitFor(() => {
      const tip = document.body.querySelector('.v-tooltip .v-overlay__content.tooltip-left-center')
      expect(tip?.textContent).toContain('Second option')
    })
    wrapper.unmount()
  })

  it('forwards taggable as an attribute only when true, as Vue 2 did', async () => {
    // :taggable on v-select is not a V2 or V4 VSelect prop
    // V4 VSelect moves unknown attrs to the native input (filterInputAttrs)
    const off = await mountAttached({ modelValue: '' })
    expect(off.find('[taggable]').exists()).toBe(false)
    off.unmount()
    const on = await mountAttached({ modelValue: '', taggable: true })
    expect(on.get('input').attributes('taggable')).toBe('true')
    on.unmount()
  })

  it('uses the raw text with rawItemText', async () => {
    const wrapper = await mountAttached({ modelValue: items[0], rawItemText: true })
    expect(wrapper.get('.select-dropdown__selection').text()).toBe('one')
    wrapper.unmount()
  })

  it('adds custom-select--block for block and the size and custom classes', async () => {
    const wrapper = await mountAttached({ modelValue: '', block: true, size: 'sm', bold: false, customClasses: 'extra other' })
    expectLegacyClasses(wrapper.element, ['custom-select--block', 'v-input--sm', 'extra', 'other'])
    expect(wrapper.classes()).not.toContain('v-select--select-bold')
    wrapper.unmount()
  })

  it('renders the prefix in prepend-inner, unless the slot is given', async () => {
    const withPrefix = await mountAttached({ modelValue: '', prefix: 'https://' })
    expect(withPrefix.get('.v-field__prepend-inner .v-text-field__prefix').text()).toBe('https://')
    withPrefix.unmount()
    const withSlot = await mountAttached({ modelValue: '', prefix: 'https://' }, { 'prepend-inner': '<i class="slotted" />' })
    expect(withSlot.find('.v-text-field__prefix').exists()).toBe(false)
    expect(withSlot.find('.slotted').exists()).toBe(true)
    withSlot.unmount()
  })

  it('shows the Loader as no-data and passes the append-item slot', async () => {
    const wrapper = await mountAttached({ modelValue: '', items: [] }, { 'append-item': '<div class="appended">more</div>' })
    const content = await openMenu(wrapper)
    expect(content.querySelector('.loader')).not.toBeNull()
    expect(content.querySelector('.appended')?.textContent).toBe('more')
    wrapper.unmount()
  })

  it('does not open when disabled', async () => {
    const wrapper = await mountAttached({ modelValue: '', disabled: true })
    await wrapper.get('.v-field').trigger('mousedown')
    // A negative check needs a settle point: wait for the frames an enabled menu would open in
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    expect(document.body.querySelector('.custom-dropdown-select')).toBeNull()
    expect(wrapper.classes()).not.toContain('v-select--active-menu')
    wrapper.unmount()
  })
})
