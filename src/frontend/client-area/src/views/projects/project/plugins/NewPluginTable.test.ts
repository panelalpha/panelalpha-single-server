import type { RepositoryPlugin } from '@/entities/project/instance-plugins.api'
import { describe, expect, it } from 'vitest'
import DataIteratorFooter from '@/shared/ui/data-iterator/DataIteratorFooter.vue'
import DataIteratorNoResultsContainer from '@/shared/ui/data-iterator/DataIteratorNoResultsContainer.vue'
import Loader from '@/shared/ui/loader/Loader.vue'
import { mountKit } from '@/test/mount-kit'
import NewPluginTable from './NewPluginTable.vue'

function entry (overrides: Partial<RepositoryPlugin> = {}): RepositoryPlugin {
  return {
    id: 'hello-dolly',
    type: 'plugin',
    name: 'Hello Dolly',
    slug: 'hello-dolly',
    version: '1.7.2',
    short_description: 'Short description.',
    status: 'publish',
    tested: '6.5',
    rating: 80,
    active_installs: 1000,
    last_updated: '2026-01-01',
    ...overrides,
  }
}

// The featured list comes from the API without `description`.
const featuredEntry = entry({ description: undefined })

async function mountTable (items: RepositoryPlugin[], props: Record<string, unknown> = {}) {
  return mountKit(NewPluginTable, { props: { items, ...props } })
}

describe('NewPluginTable', () => {
  it('renders a featured row without a description and without Read More', async () => {
    const wrapper = await mountTable([featuredEntry], { featured: true })

    expect(wrapper.text()).toContain('Hello Dolly')
    expect(wrapper.text()).toContain('general.featured')
    expect(wrapper.text()).not.toContain('button.readMore')
  })

  it('renders a row without a description as well when it is not featured', async () => {
    const wrapper = await mountTable([featuredEntry])

    expect(wrapper.text()).toContain('Hello Dolly')
    expect(wrapper.text()).not.toContain('button.readMore')
  })

  it('offers Read More for a long description and emits the entry on click', async () => {
    const item = entry({ description: `${'word '.repeat(40)}end` })
    const wrapper = await mountTable([item])

    expect(wrapper.text()).toContain('button.readMore')

    await wrapper.find('a.truncate-text').trigger('click')

    expect(wrapper.emitted('action-button-read-more')?.[0]).toEqual([item])
  })

  it('emits install with the entry when the install button is clicked', async () => {
    const item = entry()
    const wrapper = await mountTable([item])

    await wrapper.find('.actions-row button').trigger('click')

    expect(wrapper.emitted('action-button-install')?.[0]).toEqual([item])
  })

  // The install icon has no text, so the tooltip (a description) leaves it unnamed for a screen reader.
  it('names the install button with its action and the plugin', async () => {
    const wrapper = await mountTable([entry()])

    expect(wrapper.find('.actions-row button').attributes('aria-label')).toBe('button.install Hello Dolly')
  })

  it('shows the loader instead of the install icon while the install is in progress', async () => {
    const idle = await mountTable([entry()])
    const pending = await mountTable([entry({ async_status: { install: 'pending' } })])

    expect(idle.findComponent(Loader).exists()).toBe(false)
    expect(pending.findComponent(Loader).exists()).toBe(true)
  })

  it('shows the catalogue name with its entities decoded, in a search row and a featured row', async () => {
    const item = entry({ name: 'Yoast SEO &#8211; Tools &amp; more' })

    for (const featured of [false, true]) {
      const wrapper = await mountTable([item], { featured })
      expect(wrapper.text()).toContain('Yoast SEO – Tools & more')
      expect(wrapper.text()).not.toContain('&#8211;')
    }
  })
})

describe('tabela (kit-data-table-advanced)', () => {
  it('sortuje przez nagłówek, stopka, szkielet i no-results', async () => {
    window.innerWidth = 1600
    const wrapper = await mountTable([entry()], {})

    await wrapper.findAll('.custom-sort__item--sortable')[0]?.trigger('click')
    expect(wrapper.emitted('update:sort-by')?.[0]?.[0]).toBeDefined()
    expect(wrapper.findComponent(DataIteratorFooter).exists()).toBe(true)
    wrapper.unmount()

    const loading = await mountTable([], { loading: true })
    expect(loading.findAll('.v-skeleton-loader').length).toBeGreaterThan(0)
    loading.unmount()

    const empty = await mountTable([], { searchTerm: 'x' })
    expect(empty.findComponent(DataIteratorNoResultsContainer).exists()).toBe(true)
    empty.findComponent(DataIteratorNoResultsContainer).vm.$emit('clear-all-filters')
    expect(empty.emitted('clear-filters')).toHaveLength(1)
    empty.unmount()
  })

  it('shows the page the host cut, with the page count of the whole catalogue (K-07 D4)', async () => {
    window.innerWidth = 1600
    const secondPage = Array.from({ length: 8 }, (_, index) => entry({ id: `p${index + 8}`, slug: `p${index + 8}`, name: `Plugin ${index + 8}` }))
    const wrapper = await mountTable(secondPage, { page: 2, itemsPerPage: 8, itemsTotal: 20, possibleItemsPerPage: [8, 16, 24] })

    expect(wrapper.findAll('.plugin-name').map(name => name.text())).toEqual(secondPage.map(item => item.name))
    expect(wrapper.findComponent(DataIteratorFooter).props('numberOfPages')).toBe(3)
    expect(wrapper.emitted('update:page')).toBeUndefined()
    wrapper.unmount()
  })
})
