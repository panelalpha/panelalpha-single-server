import type { BackupItem } from './backups-list'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import BackupsSelectSnackbar from './BackupsSelectSnackbar.vue'

const WIDE = 1400
const NARROW = 900

function setWidth (width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
}

function item (id: number): Pick<BackupItem, 'id'> {
  return { id }
}

function query (testId: string): HTMLElement | null {
  return Array.from(document.body.querySelectorAll<HTMLElement>('[data-testid]'))
    .find(element => element.dataset.testid === testId) ?? null
}

// The kit lays out the bar: the count has its own test id, the wide links and the compact controls are reached by their kit classes.
function countText (): string | undefined {
  return document.body.querySelector<HTMLElement>('[data-testid="select-snackbar-count"]')?.textContent?.trim()
}

function wideRow (): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('.snackbar__row')
}

// Wide row links, in order: select all, then deselect.
function wideLink (index: number): HTMLElement | null {
  return wideRow()?.querySelectorAll<HTMLElement>('.btn-icon-horizontal')[index] ?? null
}

function compactClear (): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('.snackbar-button')
}

function compactSelectAll (): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('div[style*="cursor: pointer"]')
}

function moreButton (): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[data-testid="select-snackbar-more"]')
}

async function mountBar (props: { items: Array<Pick<BackupItem, 'id'>>, checkedItems: number[] }, width: number) {
  setWidth(width)
  const host = document.createElement('div')
  document.body.append(host)
  const wrapper = await mountKit(BackupsSelectSnackbar, { props, attachTo: host })
  await flushPromises()
  return wrapper
}

describe('BackupsSelectSnackbar', () => {
  afterEach(() => {
    setWidth(1024)
  })

  it('shows nothing when no row is selected', async () => {
    const wrapper = await mountBar({ items: [item(1)], checkedItems: [] }, WIDE)

    expect(document.body.querySelector('[data-testid="select-snackbar"]')).toBeNull()
    wrapper.unmount()
  })

  it('shows the full bar above 966 px: the count, the remove button and the select all and deselect links', async () => {
    const wrapper = await mountBar({ items: [item(1), item(2)], checkedItems: [1] }, WIDE)

    expect(countText()).toBe('1')
    expect(query('backups-snackbar-remove')).not.toBeNull()
    expect(wideLink(0)?.textContent?.trim()).toBe('table.snackbar.selectAll')
    expect(wideLink(1)?.textContent?.trim()).toBe('table.snackbar.deselect')
    expect(compactClear()).toBeNull()
    wrapper.unmount()
  })

  it('shows the compact bar at 966 px and below, with the close button and the menu', async () => {
    const wrapper = await mountBar({ items: [item(1), item(2)], checkedItems: [1] }, NARROW)

    expect(wideRow()).toBeNull()
    expect(compactClear()).not.toBeNull()
    expect(compactSelectAll()).not.toBeNull()
    expect(moreButton()).not.toBeNull()
    wrapper.unmount()
  })

  it('emits update:check-all with true from select all and false from deselect on the full bar', async () => {
    const wrapper = await mountBar({ items: [item(1)], checkedItems: [1] }, WIDE)

    wideLink(0)?.click()
    wideLink(1)?.click()
    await flushPromises()

    expect(wrapper.emitted('update:check-all')).toEqual([[true], [false]])
    wrapper.unmount()
  })

  it('emits mass-action-remove from the remove button', async () => {
    const wrapper = await mountBar({ items: [item(1)], checkedItems: [1] }, WIDE)

    query('backups-snackbar-remove')?.click()
    await flushPromises()

    expect(wrapper.emitted('mass-action-remove')).toHaveLength(1)
    wrapper.unmount()
  })

  it('emits mass-action-remove from the menu item and closes the menu first', async () => {
    const wrapper = await mountBar({ items: [item(1)], checkedItems: [1] }, NARROW)

    moreButton()?.click()
    await flushPromises()
    query('backups-snackbar-menu-remove')?.click()
    await flushPromises()

    expect(wrapper.emitted('mass-action-remove')).toHaveLength(1)
    const menuOverlay = document.body.querySelector('.select-snackbar-menu')?.closest('.v-overlay')
    expect(menuOverlay?.classList.contains('v-overlay--active') ?? false).toBe(false)
    wrapper.unmount()
  })

  it('toggles select all from the compact checkbox: selects the page when not all of it is checked', async () => {
    const wrapper = await mountBar({ items: [item(1), item(2)], checkedItems: [1] }, NARROW)

    compactSelectAll()?.click()
    await flushPromises()

    expect(wrapper.emitted('update:check-all')).toEqual([[true]])
    wrapper.unmount()
  })

  it('compact select all counts as checked only when every row of the page is selected, not by the count of other pages', async () => {
    const wrapper = await mountBar({ items: [item(1), item(2)], checkedItems: [1, 9, 8] }, NARROW)

    compactSelectAll()?.click()
    await flushPromises()

    expect(wrapper.emitted('update:check-all')).toEqual([[true]])
    wrapper.unmount()
  })

  it('compact select all unchecks when every row of the page is selected', async () => {
    const wrapper = await mountBar({ items: [item(1), item(2)], checkedItems: [1, 2] }, NARROW)

    compactSelectAll()?.click()
    await flushPromises()

    expect(wrapper.emitted('update:check-all')).toEqual([[false]])
    wrapper.unmount()
  })

  it('compact close button deselects the page', async () => {
    const wrapper = await mountBar({ items: [item(1)], checkedItems: [1] }, NARROW)

    compactClear()?.click()
    await flushPromises()

    expect(wrapper.emitted('update:check-all')).toEqual([[false]])
    wrapper.unmount()
  })
})
