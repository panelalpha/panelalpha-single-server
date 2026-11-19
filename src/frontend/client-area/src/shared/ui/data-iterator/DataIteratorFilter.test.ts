import { afterEach, describe, expect, it, vi } from 'vitest'
import { VMenu } from 'vuetify/components'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import DataIteratorFilter from './DataIteratorFilter.vue'

const bug = { title: 'Bug', color: 'error' }
const feature = { title: 'Feature', color: 'success' }
const labels = [bug, feature]

describe('DataIteratorFilter', () => {
  let host: HTMLDivElement | undefined

  afterEach(() => {
    host?.remove()
    host = undefined
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  async function mountAttached (props: Record<string, unknown>) {
    host = document.createElement('div')
    document.body.append(host)
    return mountKit(DataIteratorFilter, { props: { labels, ...props }, attachTo: host })
  }

  async function openMenu (wrapper: Awaited<ReturnType<typeof mountAttached>>): Promise<HTMLElement> {
    await wrapper.get('.custom-menu').trigger('click')
    return vi.waitFor(() => {
      const node = document.body.querySelector<HTMLElement>('.v-overlay__content')
      expect(node).not.toBeNull()
      expect(node!.textContent).toContain('form.label.tags')
      return node!
    })
  }

  function menuButtons (content: HTMLElement): HTMLButtonElement[] {
    return [...content.querySelectorAll<HTMLButtonElement>('.d-flex.justify-space-between button')]
  }

  it('renders the closed activator class contract', async () => {
    const wrapper = await mountAttached({})
    expectLegacyClasses(wrapper.get('.filter-menu').element, ['filter-menu'])
    expectLegacyClasses(wrapper.get('.custom-menu').element, ['custom-menu', 'p-2'])
    expect(wrapper.get('.custom-menu span').text()).toBe('button.filters')
    expect(wrapper.find('.filter-number').exists()).toBe(false)
    expect(wrapper.find('.clear-filter').exists()).toBe(false)
    expect(wrapper.get('.custom-menu').classes()).not.toContain('custom-menu--active')
    expect(wrapper.find('.custom-menu .v-field__append-inner .v-icon svg').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows the count, the info state and the clear link for applied labels', async () => {
    const wrapper = await mountAttached({ appliedLabels: [bug] })
    expect(wrapper.get('.filter-number').text()).toBe('1')
    expectLegacyClasses(wrapper.get('.custom-menu').element, ['custom-menu--active-info'])
    const clear = wrapper.get('.clear-filter')
    expect(clear.text()).toBe('button.clearFilter')
    await clear.trigger('click')
    expect(wrapper.emitted('update:applied-labels')?.[0]).toEqual([[]])
    wrapper.unmount()
  })

  it('opens a 375px menu with title, field, label list and the three buttons', async () => {
    const wrapper = await mountAttached({})
    const content = await openMenu(wrapper)
    expect(wrapper.get('.custom-menu').classes()).toContain('custom-menu--active')
    // width limits are passed to the overlay (jsdom has no layout, so the inline style is not stable)
    const menu = wrapper.findComponent(VMenu)
    expect(menu.props('minWidth')).toBe('375px')
    expect(menu.props('maxWidth')).toBe('375px')
    expect(menu.props('closeOnContentClick')).toBe(false)
    expect(menu.props('zIndex')).toBe(1000)
    expect(content.querySelector('.v-autocomplete')).not.toBeNull()
    expect(content.querySelector('label')?.textContent).toBe('form.placeholder.tags')
    const items = [...content.querySelectorAll('.label-list .v-list-item')]
    expect(items.map(item => item.textContent?.trim())).toEqual(['Bug', 'Feature'])
    expect(items[0]!.querySelector('.label-chip.label-chip--xsmall')).not.toBeNull()
    expect(menuButtons(content).map(b => b.textContent?.trim())).toEqual([
      'button.apply', 'button.cancel', 'button.clearFilter',
    ])
    wrapper.unmount()
  })

  it('adds labels from the list, hides them from it and applies the selection', async () => {
    const wrapper = await mountAttached({})
    const content = await openMenu(wrapper)
    ;(content.querySelectorAll('.label-list .v-list-item')[1] as HTMLElement).click()
    await vi.waitFor(() => {
      expect([...content.querySelectorAll('.label-list .v-list-item')].map(i => i.textContent?.trim())).toEqual(['Bug'])
    })
    menuButtons(content)[0]!.click()
    await vi.waitFor(() => expect(wrapper.emitted('update:applied-labels')).toBeTruthy())
    expect(wrapper.emitted('update:applied-labels')?.[0]).toEqual([[feature]])
    await vi.waitFor(() => expect(wrapper.get('.custom-menu').classes()).not.toContain('custom-menu--active'))
    wrapper.unmount()
  })

  it('shows a selected label in the field as a removable label chip that unassigns it', async () => {
    // Legacy renders selections with `v-slot:selection` and `label-chip removable xsmall`.
    const wrapper = await mountAttached({ appliedLabels: [bug] })
    const content = await openMenu(wrapper)
    const chip = content.querySelector<HTMLElement>('.v-autocomplete .label-chip')
    expect(chip).not.toBeNull()
    expectLegacyClasses(chip!, ['label-chip', 'label-chip--xsmall', 'label-chip--removable', 'text-white'])
    expect(chip!.textContent?.trim()).toBe('Bug')
    chip!.querySelector<HTMLButtonElement>('.v-btn')!.click()
    await vi.waitFor(() => {
      expect(content.querySelector('.v-autocomplete .label-chip')).toBeNull()
      expect([...content.querySelectorAll('.label-list .v-list-item')].map(i => i.textContent?.trim())).toEqual(['Bug', 'Feature'])
    })
    wrapper.unmount()
  })

  it('cancel closes without emitting and the selection resets to the applied labels on reopen', async () => {
    const wrapper = await mountAttached({ appliedLabels: [bug] })
    const content = await openMenu(wrapper)
    expect([...content.querySelectorAll('.label-list .v-list-item')].map(i => i.textContent?.trim())).toEqual(['Feature'])
    ;(content.querySelector('.label-list .v-list-item') as HTMLElement).click()
    menuButtons(content)[1]!.click()
    await vi.waitFor(() => expect(wrapper.get('.custom-menu').classes()).not.toContain('custom-menu--active'))
    expect(wrapper.emitted('update:applied-labels')).toBeUndefined()
    const reopened = await openMenu(wrapper)
    expect([...reopened.querySelectorAll('.label-list .v-list-item')].map(i => i.textContent?.trim())).toEqual(['Feature'])
    wrapper.unmount()
  })

  it('Cancel is the gray surface button, not the white default one (#40)', async () => {
    const wrapper = await mountAttached({})
    const content = await openMenu(wrapper)
    expect(menuButtons(content)[1]!.classList.contains('app-button--surface')).toBe(true)
    expect(menuButtons(content)[0]!.classList.contains('app-button--surface')).toBe(false)
    wrapper.unmount()
  })

  it('clear in the menu emits an empty list and keeps the menu open', async () => {
    const wrapper = await mountAttached({ appliedLabels: [bug] })
    const content = await openMenu(wrapper)
    menuButtons(content)[2]!.click()
    await vi.waitFor(() => expect(wrapper.emitted('update:applied-labels')).toBeTruthy())
    expect(wrapper.emitted('update:applied-labels')?.[0]).toEqual([[]])
    expect(wrapper.get('.custom-menu').classes()).toContain('custom-menu--active')
    wrapper.unmount()
  })

  it('filters the label list by a case-sensitive search', async () => {
    // The match is `item.title.includes(searchValue)`.
    const wrapper = await mountAttached({})
    const content = await openMenu(wrapper)
    const input = content.querySelector('input')!
    input.value = 'bug'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() => expect(content.querySelectorAll('.label-list .v-list-item')).toHaveLength(0))
    input.value = 'Bug'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() => expect(content.querySelectorAll('.label-list .v-list-item')).toHaveLength(1))
    wrapper.unmount()
  })
})
