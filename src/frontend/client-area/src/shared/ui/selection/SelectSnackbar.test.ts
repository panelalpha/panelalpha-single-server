import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import { mountKit } from '@/test/mount-kit'
import SelectSnackbar from './SelectSnackbar.vue'

function bar (): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[data-testid="select-snackbar"]')
}

function mountBar (props: { count: number, allSelected?: boolean, shortLabel?: string, dark?: boolean }, slots: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  return mountKit(SelectSnackbar, {
    props: { allSelected: false, selectedLabel: 'wide-label', ...props },
    slots,
    attachTo: host,
  })
}

describe('SelectSnackbar', () => {
  const width = window.innerWidth

  afterEach(() => {
    window.innerWidth = width
  })

  it('is hidden while nothing is selected and shows the count when something is', async () => {
    window.innerWidth = 1200
    const hidden = await mountBar({ count: 0 })
    expect(bar()).toBeNull()
    hidden.unmount()

    const wrapper = await mountBar({ count: 2 })
    expect(bar()!.querySelector('[data-testid="select-snackbar-count"]')!.textContent!.trim()).toBe('2')
    expect(bar()!.textContent).toContain('wide-label')
    wrapper.unmount()
  })

  it('shows the wide row above 966px with the actions slot and emits select all / deselect', async () => {
    window.innerWidth = 1200
    const wrapper = await mountBar({ count: 1 }, {
      actions: () => h('button', { class: 'probe-action' }, 'probe'),
    })

    expect(document.body.querySelector('.snackbar__row')).not.toBeNull()
    expect(document.body.querySelector('.snackbar-button')).toBeNull()
    expect(document.body.querySelector('.probe-action')).not.toBeNull()

    const links = [...document.body.querySelectorAll<HTMLElement>('.snackbar__row > div:last-child .btn-icon-horizontal')]
    expect(links.map(link => link.textContent!.trim())).toEqual(['table.snackbar.selectAll', 'table.snackbar.deselect'])
    links[0]!.click()
    links[1]!.click()
    expect(wrapper.emitted('update:check-all')).toEqual([[true], [false]])
    wrapper.unmount()
  })

  it('switches to the compact bar at 966px or less with the short label, the select-all checkbox and the more button', async () => {
    window.innerWidth = 966
    const wrapper = await mountBar({ count: 3, allSelected: true, shortLabel: 'short-label' })

    expect(document.body.querySelector('.snackbar__row')).toBeNull()
    expect(bar()!.textContent).toContain('short-label')
    expect(document.body.querySelector('[data-testid="select-snackbar-more"]')).not.toBeNull()

    document.body.querySelector<HTMLElement>('.snackbar-button')!.click()
    expect(wrapper.emitted('update:check-all')?.[0]).toEqual([false])
    wrapper.unmount()
  })

  it('selects all from the compact checkbox when only some items are selected', async () => {
    window.innerWidth = 600
    const wrapper = await mountBar({ count: 1, allSelected: false })

    document.body.querySelector<HTMLElement>('div[style*="cursor: pointer"]')!.click()
    expect(wrapper.emitted('update:check-all')?.[0]).toEqual([true])
    wrapper.unmount()
  })

  it('deselects from the compact checkbox when everything is selected', async () => {
    window.innerWidth = 600
    const wrapper = await mountBar({ count: 2, allSelected: true })

    document.body.querySelector<HTMLElement>('div[style*="cursor: pointer"]')!.click()
    expect(wrapper.emitted('update:check-all')?.[0]).toEqual([false])
    wrapper.unmount()
  })

  it('closes the more menu after a click on one of its items', async () => {
    window.innerWidth = 600
    const clicks: string[] = []
    const wrapper = await mountBar({ count: 1 }, {
      'menu-items': () => h('div', { class: 'probe-item', onClick: () => clicks.push('item') }, 'item'),
    })

    document.body.querySelector<HTMLElement>('[data-testid="select-snackbar-more"]')!.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.body.querySelector('.select-snackbar-menu')).not.toBeNull()

    document.body.querySelector<HTMLElement>('.probe-item')!.click()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(clicks).toEqual(['item'])
    // The snackbar is an overlay too, so the check reads the overlay that holds the menu.
    const menuOverlay = document.body.querySelector('.select-snackbar-menu')?.closest('.v-overlay')
    expect(menuOverlay?.classList.contains('v-overlay--active') ?? false).toBe(false)
    wrapper.unmount()
  })

  it('keeps the app theme on the bar, also with `dark` (legacy `:dark` only dressed the unchecked box; the bar followed the theme)', async () => {
    window.innerWidth = 1200
    const light = await mountBar({ count: 1 })
    expect(bar()!.classList.contains('v-theme--dark')).toBe(false)
    light.unmount()

    const dark = await mountBar({ count: 1, dark: true })
    expect(bar()!.classList.contains('v-theme--dark')).toBe(false)
    dark.unmount()
  })
})
