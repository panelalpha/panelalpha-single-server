import type { WordpressConfigItem } from './wordpress-config.api'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import DataIteratorFooter from '@/shared/ui/data-iterator/DataIteratorFooter.vue'
import DataIteratorNoResultsContainer from '@/shared/ui/data-iterator/DataIteratorNoResultsContainer.vue'
import { iconButtonsSnapshot } from '@/test/icon-buttons'
import { mountKit } from '@/test/mount-kit'
import { configsHeaders } from './configs-table'
import ConfigsTable from './ConfigsTable.vue'

const t = (key: string) => key

const items: WordpressConfigItem[] = [
  { name: 'WP_DEBUG', value: 'true', type: 'constant' },
  { name: 'table_prefix', value: 'wp_', type: 'variable' },
]

async function mountTable (width: number) {
  window.innerWidth = width
  return mountKit(ConfigsTable, {
    props: { instanceId: 7, items, headers: configsHeaders(t), page: 1, itemsPerPage: 8, possibleItemsPerPage: [[8, 16, 24]], sortBy: false, sortDesc: false, searchTerm: '' },
  })
}

// Characterization of the row actions: the markup, the tooltip text and its class stay as written by hand.
describe('ConfigsTable row actions', () => {
  const width = window.innerWidth

  beforeEach(() => {
    window.innerWidth = 1600
  })

  afterEach(() => {
    window.innerWidth = width
  })

  it('renders Edit and Delete of the desktop rows with their tooltips unchanged', async () => {
    const wrapper = await mountTable(1600)

    expect(await iconButtonsSnapshot(wrapper.get('tbody'))).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.config.edit" data-testid="wordpress-config-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.config.edit</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.config.delete" data-testid="wordpress-config-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.config.delete</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.config.edit" data-testid="wordpress-config-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.config.edit</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.config.delete" data-testid="wordpress-config-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.config.delete</span>",
          },
        },
      ]
    `)
    wrapper.unmount()
  })

  it('renders Edit and Delete of the mobile cards with their tooltips unchanged', async () => {
    const wrapper = await mountTable(500)

    expect(await iconButtonsSnapshot(wrapper.get('tbody'))).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.config.edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.config.edit</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.config.delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.config.delete</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.config.edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.config.edit</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.config.delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.config.delete</span>",
          },
        },
      ]
    `)
    wrapper.unmount()
  })

  it('emits the row from Edit and Delete', async () => {
    const wrapper = await mountTable(1600)
    const buttons = wrapper.findAll('tbody tr')[1]!.findAll('button.v-btn--icon')

    await buttons[0]!.trigger('click')
    await buttons[1]!.trigger('click')

    expect(wrapper.emitted('action-button-edit')).toEqual([[items[1]]])
    expect(wrapper.emitted('action-button-delete')).toEqual([[items[1]]])
    wrapper.unmount()
  })
})

describe('tabela (kit-data-table-advanced)', () => {
  const width = window.innerWidth

  afterEach(() => {
    window.innerWidth = width
  })

  async function mountWith (w: number, extra: Record<string, unknown> = {}) {
    window.innerWidth = w
    return mountKit(ConfigsTable, {
      props: { instanceId: 7, items, headers: configsHeaders(t), page: 1, itemsPerPage: 8, possibleItemsPerPage: [[8, 16, 24]], sortBy: false, sortDesc: false, searchTerm: '', ...extra },
    })
  }

  it('pokazuje zasłoniętą wartość sekretu z akcją ujawnienia, nie surową wartość', async () => {
    setActivePinia(createPinia())
    const wrapper = await mountWith(1600, {
      items: [
        { name: 'DB_PASSWORD', value: '********', type: 'constant', secret: true },
        { name: 'WP_DEBUG', value: 'true', type: 'constant' },
      ],
    })

    const secretCell = wrapper.findAll('tbody tr').find(row => row.findAll('td').length === 4)!
    expect(secretCell.get('[data-testid="secret-DB_PASSWORD"]').text()).toContain('********')
    expect(secretCell.get('[data-testid="secret-DB_PASSWORD-toggle"]').text()).toBe('button.secret.show')
    expect(secretCell.text()).not.toContain('db-secret-1')

    const openCell = wrapper.findAll('tbody tr').filter(row => row.findAll('td').length === 4)[1]!
    expect(openCell.find('[data-testid^="secret-"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('sortuje przez nagłówek', async () => {
    const wrapper = await mountWith(1600)

    await wrapper.findAll('.custom-sort__item--sortable')[0]!.trigger('click')

    expect(wrapper.emitted('update:sort-by')?.[0]?.[0]).toMatchObject({ value: 'name' })
    wrapper.unmount()
  })

  it('przekazuje zmianę strony i rozmiaru ze stopki', async () => {
    const wrapper = await mountWith(1600)

    wrapper.findComponent(DataIteratorFooter).vm.$emit('update:page', 2)
    wrapper.findComponent(DataIteratorFooter).vm.$emit('update:items-per-page', 16)

    expect(wrapper.emitted('update:page')).toEqual([[2]])
    expect(wrapper.emitted('update:items-per-page')).toEqual([[16]])
    wrapper.unmount()
  })

  it('pokazuje no-results dla frazy bez wyników i emituje clear-filters', async () => {
    const wrapper = await mountWith(1600, { searchTerm: 'zzz-brak' })

    expect(wrapper.findComponent(DataIteratorNoResultsContainer).exists()).toBe(true)
    wrapper.findComponent(DataIteratorNoResultsContainer).vm.$emit('clear-all-filters')

    expect(wrapper.emitted('clear-filters')).toHaveLength(1)
    wrapper.unmount()
  })

  it('pokazuje szkielet w czasie ładowania', async () => {
    const wrapper = await mountWith(1600, { itemsLoading: true })

    expect(wrapper.findAll('.v-skeleton-loader').length).toBeGreaterThan(0)
    expect(wrapper.text()).not.toContain(items[0]!.name)
    wrapper.unmount()
  })

  it('pokazuje kartę poniżej 1400 px i tabelę od 1400 px', async () => {
    let wrapper = await mountWith(1300)

    expect(wrapper.findAll('.mobile-table-item')).toHaveLength(items.length)
    wrapper.unmount()

    wrapper = await mountWith(1500)

    expect(wrapper.findAll('.mobile-table-item')).toHaveLength(0)
    wrapper.unmount()
  })

  it('etykieta pola karty sortuje po swoim kluczu', async () => {
    const wrapper = await mountWith(1300)
    const label = wrapper.findAll('.mobile-table-item__header').find(el => el.text() === 'table.header.value')

    await label!.trigger('click')

    expect(wrapper.emitted('update:sort-by')?.[0]?.[0]).toMatchObject({ value: 'value' })
    wrapper.unmount()
  })

  // The card field "Actions" (new with the kit) does not sort; before the kit the card had no such field.
  it('etykieta pola Actions karty nie sortuje', async () => {
    const wrapper = await mountWith(1300)
    const label = wrapper.findAll('.mobile-table-item__header').find(el => el.text() === 'table.header.actions')

    await label!.trigger('click')

    expect(wrapper.emitted('update:sort-by')).toBeUndefined()
    wrapper.unmount()
  })

  it('pokazuje wartość false stałej, a --- tylko dla pustej wartości', async () => {
    const wrapper = await mountWith(1600, {
      items: [
        { name: 'WP_DEBUG', value: false, type: 'constant' },
        { name: 'NO_VALUE', value: '', type: 'constant' },
      ],
    })

    const rows = wrapper.findAll('tbody tr').filter(row => row.findAll('td').length === 4)
    expect(rows[0]!.findAll('td')[1]!.text()).toBe('false')
    expect(rows[1]!.findAll('td')[1]!.text()).toBe('---')
    wrapper.unmount()
  })

  it('szuka tylko po kluczach z listy', async () => {
    const wrapper = await mountWith(1600, { searchTerm: 'constant' })

    expect(wrapper.text()).not.toContain(items[0]!.name)
    wrapper.unmount()
  })

  it('pokazuje "No data available" bez frazy przy pustej liście', async () => {
    const wrapper = await mountWith(1600, { items: [] })

    expect(wrapper.text()).toContain('No data available')
    wrapper.unmount()
  })

  // A read the Engine refused is not an empty list: its message sits where the no-data row would, and Retry asks again.
  it('pokazuje przyczynę odmowy zamiast "No data available", a Retry ponawia odczyt', async () => {
    const wrapper = await mountWith(1600, {
      items: [],
      loadError: 'Error: No matching entries found in \'wp-config.php\'.',
    })

    expect(wrapper.text()).not.toContain('No data available')
    expect(wrapper.get('[data-testid="wordpress-config-load-error"]').text()).toContain('Error: No matching entries found in \'wp-config.php\'.')

    await wrapper.get('[data-testid="error-card-retry"]').trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(1)
    wrapper.unmount()
  })
})
