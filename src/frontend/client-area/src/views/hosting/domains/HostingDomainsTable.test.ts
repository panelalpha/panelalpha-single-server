import { afterEach, describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import { domainRow, domainsTableHeaders, domainsTableService } from './domains-table.fixtures'
import HostingDomainsTable from './HostingDomainsTable.vue'

const items = [domainRow('bravo.test'), domainRow('alpha.test', { type: 'sub', type_text: 'sub' })]
const many = Array.from({ length: 9 }, (_, index) => domainRow(`site${index + 1}.test`))

const base = {
  headers: domainsTableHeaders,
  items,
  service: domainsTableService(),
  page: 1,
  itemsPerPage: 8,
  sortBy: domainsTableHeaders[0],
  sortDesc: false,
}

const slots = { 'no-data': '<p class="host-empty">empty</p>' }

// Behaviour of the table frame: no asserts on classes or looks, only on what the user can do.
describe('tabela (kit-data-table)', () => {
  const width = window.innerWidth
  afterEach(() => {
    window.innerWidth = width
  })

  function domains (wrapper: { findAll: (selector: string) => Array<{ text: () => string }> }): string[] {
    return wrapper.findAll('[data-testid="domains-row-link"]').map(link => link.text())
  }

  it('lists the rows sorted by sortBy with the domain link, the type and the document root', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingDomainsTable, { props: base, slots })

    expect(domains(wrapper)).toEqual(['alpha.test', 'bravo.test'])
    const rows = wrapper.findAll('[data-testid="domains-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('sub')
    expect(rows[0]!.text()).toContain('/home/example/alpha.test')
    expect(wrapper.findAll('tr.custom-sort td')).toHaveLength(5)
    wrapper.unmount()
  })

  it('emits the clicked header, and the flipped direction for the sorted one', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingDomainsTable, { props: base, slots })

    await wrapper.get('tr.custom-sort .item--type .custom-sort__item').trigger('click')
    await wrapper.get('tr.custom-sort .item--domain .custom-sort__item').trigger('click')
    expect(wrapper.emitted('update:sort-by')).toEqual([[domainsTableHeaders[2]]])
    expect(wrapper.emitted('update:sort-desc')).toEqual([[true]])
    wrapper.unmount()
  })

  it('searches the raw value of every column, so the type matches and the translated text alone does not', async () => {
    window.innerWidth = 1600
    const byType = await mountKit(HostingDomainsTable, { props: { ...base, searchTerm: 'addon' }, slots })
    expect(domains(byType)).toEqual(['bravo.test'])
    byType.unmount()

    const byRoot = await mountKit(HostingDomainsTable, { props: { ...base, searchTerm: '/home/example/alpha' }, slots })
    expect(domains(byRoot)).toEqual(['alpha.test'])
    byRoot.unmount()
  })

  it('shows no-results with a way to clear the filters for a search that matches nothing', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingDomainsTable, { props: { ...base, searchTerm: 'zzz' }, slots })

    expect(wrapper.find('.host-empty').exists()).toBe(false)
    expect(wrapper.find('[data-testid="domains-no-results"]').exists()).toBe(true)
    // No pages at the default size, so no footer.
    expect(wrapper.find('.data-iterator-footer').exists()).toBe(false)
    await wrapper.get('[data-testid="domains-no-results"] button').trigger('click')
    expect(wrapper.emitted('clear-filters')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows the no-data slot for an empty list, with no header and no footer', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingDomainsTable, { props: { ...base, items: [] }, slots })

    expect(wrapper.find('.host-empty').exists()).toBe(true)
    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
    expect(wrapper.find('.data-iterator-footer').exists()).toBe(false)
    wrapper.unmount()
  })

  it('pages by itemsPerPage (default 8) and re-emits the page and the per-page choice', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingDomainsTable, { props: { ...base, items: many }, slots })

    expect(wrapper.findAll('[data-testid="domains-row"]')).toHaveLength(8)
    await wrapper.findAll('.v-pagination__item button')[1]!.trigger('click')
    expect(wrapper.emitted('update:page')?.[0]).toEqual([2])
    await wrapper.findAll('.data-iterator-page-number button')[1]!.trigger('click')
    expect(wrapper.emitted('update:items-per-page')?.[0]).toEqual([16])
    wrapper.unmount()
  })

  it('shows the skeleton with no rows while loading, and five mobile items below the lg breakpoint', async () => {
    window.innerWidth = 1600
    const desktop = await mountKit(HostingDomainsTable, { props: { ...base, itemsLoading: true }, slots })
    expect(desktop.find('[data-testid="domains-row"]').exists()).toBe(false)
    expect(desktop.find('thead.item.sort').exists()).toBe(true)
    desktop.unmount()

    window.innerWidth = 500
    const mobile = await mountKit(HostingDomainsTable, { props: { ...base, itemsLoading: true }, slots })
    expect(mobile.findAll('.mobile-item')).toHaveLength(5)
    mobile.unmount()
  })

  it('emits the row of the clicked Delete button, on desktop and in the mobile card', async () => {
    window.innerWidth = 1600
    const desktop = await mountKit(HostingDomainsTable, { props: base, slots })
    await desktop.findAll('[data-testid="domains-row"]')[0]!.get('[data-testid="domains-row-action-delete"]').trigger('click')
    expect(desktop.emitted('action-button-delete')![0]![0]).toMatchObject({ domain: 'alpha.test' })
    desktop.unmount()

    window.innerWidth = 500
    const mobile = await mountKit(HostingDomainsTable, { props: base, slots })
    await mobile.findAll('[data-testid="domains-row"]')[1]!.get('[data-testid="domains-row-action-delete"]').trigger('click')
    expect(mobile.emitted('action-button-delete')![0]![0]).toMatchObject({ domain: 'bravo.test' })
    mobile.unmount()
  })

  it('renders each domain as a card below 976 px with its fields, no sort header, and sorts by the field label', async () => {
    window.innerWidth = 500
    const wrapper = await mountKit(HostingDomainsTable, { props: base, slots })

    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
    const cards = wrapper.findAll('[data-testid="domains-row"]')
    expect(cards).toHaveLength(2)
    const labels = cards[0]!.findAll('.mobile-table-item__header').map(label => label.text())
    expect(labels).toEqual(['table.header.domain', 'table.header.ssl', 'table.header.type', 'table.header.documentRoot', 'table.header.actions'])
    await cards[0]!.findAll('.mobile-table-item__header')[2]!.trigger('click')
    expect(wrapper.emitted('update:sort-by')).toEqual([[domainsTableHeaders[2]]])
    wrapper.unmount()
  })
})
