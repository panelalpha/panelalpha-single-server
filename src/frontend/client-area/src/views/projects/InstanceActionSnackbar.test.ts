import { afterEach, describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import InstanceActionSnackbar from './InstanceActionSnackbar.vue'

const items = [{ id: 1 }, { id: 2 }, { id: 3 }]

function bar (): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[data-testid="instances-snackbar"]')
}

async function mountBar (checkedItems: number[], canShare?: boolean) {
  const host = document.createElement('div')
  document.body.append(host)
  return mountKit(InstanceActionSnackbar, { props: { checkedItems, items, canShare }, attachTo: host })
}

describe('InstanceActionSnackbar', () => {
  const width = window.innerWidth

  afterEach(() => {
    window.innerWidth = width
  })

  it('is hidden while nothing is selected and shows the count of the selection', async () => {
    const hidden = await mountBar([])
    expect(bar()).toBeNull()
    hidden.unmount()

    const wrapper = await mountBar([1, 2])
    expect(bar()).not.toBeNull()
    expect(document.body.querySelector('.snackbar__item-number')!.textContent!.trim()).toBe('2')
    expect(bar()!.textContent).toContain('table.snackbar.selected.instance')
    wrapper.unmount()
  })

  it('shows the desktop row above 966px and emits the mass actions and select all / deselect', async () => {
    window.innerWidth = 1200
    const wrapper = await mountBar([1])

    const click = (selector: string) => document.body.querySelector<HTMLElement>(selector)!.click()
    click('[data-testid="instances-snackbar-share"]')
    click('[data-testid="instances-snackbar-remove"]')
    expect(wrapper.emitted('mass-action-share')).toHaveLength(1)
    expect(wrapper.emitted('mass-action-remove')).toHaveLength(1)

    const links = [...document.body.querySelectorAll<HTMLElement>('.snackbar__row > div:last-child .btn-icon-horizontal')]
    expect(links.map(link => link.textContent!.trim())).toEqual(['table.snackbar.selectAll', 'table.snackbar.deselect'])
    links[0]!.click()
    links[1]!.click()
    expect(wrapper.emitted('update:check-all')).toEqual([[true], [false]])
    wrapper.unmount()
  })

  it('switches to the compact bar at 966px or less: close, counter, select-all checkbox and the more menu', async () => {
    window.innerWidth = 966
    const wrapper = await mountBar([1, 2, 3])

    expect(document.body.querySelector('.snackbar__row')).toBeNull()
    expect(document.body.querySelector('.snackbar-button')).not.toBeNull()
    expect(bar()!.textContent).toContain('3')

    document.body.querySelector<HTMLElement>('.snackbar-button')!.click()
    expect(wrapper.emitted('update:check-all')?.[0]).toEqual([false])

    // Everything is selected, so the checkbox row deselects.
    const row = document.body.querySelector<HTMLElement>('.checkbox')!.parentElement!.parentElement!
    row.querySelector<HTMLElement>('div[style*="cursor: pointer"]')?.click()
    expect(wrapper.emitted('update:check-all')?.[1]).toEqual([false])
    wrapper.unmount()
  })

  it('shows the counter in the kit and emits each mass action from the more menu, which then closes', async () => {
    window.innerWidth = 600
    const wrapper = await mountBar([1, 2])
    const tick = () => new Promise(resolve => setTimeout(resolve, 0))
    const menuOverlay = () => document.body.querySelector('.select-snackbar-menu')?.closest('.v-overlay')

    expect(bar()!.textContent).toContain('2 table.snackbar.selected.instance')

    const events = ['mass-action-share', 'mass-action-remove'] as const
    for (const [index, event] of events.entries()) {
      document.body.querySelector<HTMLElement>('[data-testid="select-snackbar-more"]')!.click()
      await tick()
      const items = [...document.body.querySelectorAll<HTMLElement>('.select-snackbar-menu .v-list-item')]
      expect(items.map(item => item.textContent!.trim())).toEqual(['button.share', 'button.remove'])
      items[index]!.click()
      await tick()
      expect(wrapper.emitted(event)).toHaveLength(1)
      expect(menuOverlay()?.classList.contains('v-overlay--active') ?? false).toBe(false)
    }
    wrapper.unmount()
  })

  it('selects all from the compact checkbox when only some items are selected', async () => {
    window.innerWidth = 600
    const wrapper = await mountBar([1])

    document.body.querySelector<HTMLElement>('div[style*="cursor: pointer"]')!.click()
    expect(wrapper.emitted('update:check-all')?.[0]).toEqual([true])
    wrapper.unmount()
  })

  it('hides Share in the desktop row and in the more menu without the share privilege', async () => {
    window.innerWidth = 1200
    const desktop = await mountBar([1], false)
    expect(document.body.querySelector('[data-testid="instances-snackbar-share"]')).toBeNull()
    expect(document.body.querySelector('[data-testid="instances-snackbar-remove"]')).not.toBeNull()
    desktop.unmount()

    window.innerWidth = 600
    const compact = await mountBar([1], false)
    document.body.querySelector<HTMLElement>('[data-testid="select-snackbar-more"]')!.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    const labels = [...document.body.querySelectorAll<HTMLElement>('.select-snackbar-menu .v-list-item')].map(item => item.textContent!.trim())
    expect(labels).toEqual(['button.remove'])
    compact.unmount()
  })
})
