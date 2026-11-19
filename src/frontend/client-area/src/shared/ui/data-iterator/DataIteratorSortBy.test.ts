import { afterEach, describe, expect, it, vi } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import DataIteratorSortBy from './DataIteratorSortBy.vue'

const keys = [
  { text: 'Name', value: 'name', sortable: true },
  { text: 'Domain', value: 'domain', sortable: false },
  { text: 'Date', value: 'createdAt', sortable: true },
]

describe('DataIteratorSortBy', () => {
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
    return mountKit(DataIteratorSortBy, { props, attachTo: host })
  }

  it('renders nothing without keys', async () => {
    // The select renders only when `keys` is set.
    const wrapper = await mountAttached({})
    expectLegacyClasses(wrapper.element, ['d-flex', 'align-center'])
    expect(wrapper.find('.v-select').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders a SelectDropdown with the bandwidth prefix icon on desktop sizes', async () => {
    const wrapper = await mountAttached({ keys, sortBy: keys[0] })
    expectLegacyClasses(wrapper.get('.v-select').element, ['custom-select', 'v-input--lg', 'p-2'])
    expect(wrapper.find('.v-field__prepend-inner .v-icon svg').exists()).toBe(true)
    expect(wrapper.get('.select-dropdown__selection').text()).toBe('form.option.Name')
    wrapper.unmount()
  })

  it('uses the md size and p-3 under smAndDown', async () => {
    const width = window.innerWidth
    window.innerWidth = 500
    const wrapper = await mountAttached({ keys, sortBy: keys[0] })
    expectLegacyClasses(wrapper.get('.v-select').element, ['v-input--md', 'p-3'])
    wrapper.unmount()
    window.innerWidth = width
  })

  it('lists only sortable keys and emits update:sortBy with the header object', async () => {
    const wrapper = await mountAttached({ keys, sortBy: keys[0] })
    await wrapper.get('.v-field').trigger('mousedown')
    const content = await vi.waitFor(() => {
      const node = document.body.querySelector<HTMLElement>('.v-overlay__content.custom-dropdown-select')
      expect(node).not.toBeNull()
      return node!
    })
    const rows = [...content.querySelectorAll('.input-dropdown-item')]
    expect(rows.map(row => row.textContent?.trim())).toEqual(['form.option.Name', 'form.option.Date'])
    ;(rows[1] as HTMLElement).click()
    await vi.waitFor(() => expect(wrapper.emitted('update:sort-by')).toBeTruthy())
    expect(wrapper.emitted('update:sort-by')?.[0]).toEqual([keys[2]])
    wrapper.unmount()
  })
})
