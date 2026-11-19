import type { RepositoryTheme } from '@/entities/project/instance-themes.api'
import { describe, expect, it } from 'vitest'
import DataIteratorFooter from '@/shared/ui/data-iterator/DataIteratorFooter.vue'
import Loader from '@/shared/ui/loader/Loader.vue'
import { mountKit } from '@/test/mount-kit'
import NewThemeTable from './NewThemeTable.vue'

function theme (overrides: Partial<RepositoryTheme> = {}): RepositoryTheme {
  return {
    id: 101,
    slug: 'twentytwentyfive',
    name: 'Twenty Twenty-Five',
    version: '1.0.0',
    rating: 80,
    description: 'Short description.',
    ...overrides,
  }
}

async function mountTable (items: RepositoryTheme[], props: Record<string, unknown> = {}) {
  return mountKit(NewThemeTable, { props: { items, ...props } })
}

describe('NewThemeTable', () => {
  it('shows the yellow band and the Featured chip on a featured row', async () => {
    const wrapper = await mountTable([theme()], { featured: true })

    expect(wrapper.find('.item-bordered').classes()).toContain('item-bordered--yellow')
    expect(wrapper.text()).toContain('general.featured')
  })

  it('shows neither the band nor the chip on a search row', async () => {
    const wrapper = await mountTable([theme()])

    expect(wrapper.find('.item-bordered').classes()).not.toContain('item-bordered--yellow')
    expect(wrapper.text()).not.toContain('general.featured')
  })

  it('shows the no-description text and no Read More for a row without a description', async () => {
    const wrapper = await mountTable([theme({ description: undefined })], { featured: true })

    expect(wrapper.text()).toContain('message.theme.noDescription')
    expect(wrapper.text()).not.toContain('button.readMore')
  })

  it('offers Read More for a long description and emits the theme on click', async () => {
    const item = theme({ description: `${'word '.repeat(40)}end` })
    const wrapper = await mountTable([item])

    expect(wrapper.text()).toContain('button.readMore')

    await wrapper.find('a.truncate-text').trigger('click')

    expect(wrapper.emitted('read-more')?.[0]).toEqual([item])
  })

  it('shows the loader instead of the install icon while the install is in progress', async () => {
    const idle = await mountTable([theme()])
    const installing = await mountTable([theme({ async_status: { install: 'pending' } })])

    expect(idle.findComponent(Loader).exists()).toBe(false)
    expect(installing.findComponent(Loader).exists()).toBe(true)
  })

  it('emits the theme when the install button is clicked', async () => {
    const item = theme()
    const wrapper = await mountTable([item])

    await wrapper.find('.actions-row button').trigger('click')
    expect(wrapper.emitted('action-button-install')?.[0]).toEqual([item])
  })

  // The eye link and the install icon have no text, so their tooltips (descriptions) leave them unnamed for a screen reader.
  it('names the preview link and the install button with their action and the theme', async () => {
    const wrapper = await mountTable([theme({ preview_url: 'https://demo.example/twenty' })])

    expect(wrapper.find('.actions-row a.v-btn').attributes('aria-label')).toBe('button.preview Twenty Twenty-Five')
    expect(wrapper.find('.actions-row button').attributes('aria-label')).toBe('button.install Twenty Twenty-Five')
  })
})

describe('tabela (kit-data-table-advanced)', () => {
  it('sortuje przez nagłówek, stopka i szkielet w czasie ładowania', async () => {
    window.innerWidth = 1600
    const wrapper = await mountTable([theme()], {})

    await wrapper.findAll('.custom-sort__item--sortable')[0]?.trigger('click')
    expect(wrapper.emitted('update:sort-by')?.[0]?.[0]).toBeDefined()
    expect(wrapper.findComponent(DataIteratorFooter).exists()).toBe(true)
    wrapper.unmount()

    const loading = await mountTable([], { loading: true })
    expect(loading.findAll('.v-skeleton-loader').length).toBeGreaterThan(0)
    loading.unmount()
  })
})
