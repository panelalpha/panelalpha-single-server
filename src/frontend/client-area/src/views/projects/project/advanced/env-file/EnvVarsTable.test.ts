import type { EnvVariable } from './env-vars'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import DataIteratorFooter from '@/shared/ui/data-iterator/DataIteratorFooter.vue'
import DataIteratorNoResultsContainer from '@/shared/ui/data-iterator/DataIteratorNoResultsContainer.vue'
import { iconButtonsSnapshot } from '@/test/icon-buttons'
import { mountKit } from '@/test/mount-kit'
import EnvVarsTable from './EnvVarsTable.vue'

const items: EnvVariable[] = [
  { line: 1, key: 'APP_KEY', value: 'secret', exported: false },
  { line: 2, key: 'EMPTY', value: '', exported: false },
  { line: 3, key: 'MULTI', value: 'a\nb', exported: false, readonly: true },
]

async function mountTable (width: number) {
  window.innerWidth = width
  return mountKit(EnvVarsTable, { props: { items } })
}

// Characterization of the row actions: the markup, the tooltip text and its class stay as written by hand.
describe('EnvVarsTable row actions', () => {
  const width = window.innerWidth

  beforeEach(() => {
    window.innerWidth = 1600
  })

  afterEach(() => {
    window.innerWidth = width
  })

  it('renders the Edit and Delete icons of the desktop rows with their tooltips unchanged', async () => {
    const wrapper = await mountTable(1600)

    expect(await iconButtonsSnapshot(wrapper.get('tbody'))).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.config.edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content env-vars-tooltip",
            "html": "<span>button.config.edit</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.config.delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content env-vars-tooltip",
            "html": "<span>button.config.delete</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.config.edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content env-vars-tooltip",
            "html": "<span>button.config.edit</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.config.delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content env-vars-tooltip",
            "html": "<span>button.config.delete</span>",
          },
        },
      ]
    `)
    wrapper.unmount()
  })

  it('renders the Edit and Delete icons of the mobile cards unchanged', async () => {
    const wrapper = await mountTable(500)

    expect(await iconButtonsSnapshot(wrapper.get('tbody'))).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.config.edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content env-vars-tooltip",
            "html": "<span>button.config.edit</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.config.delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content env-vars-tooltip",
            "html": "<span>button.config.delete</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.config.edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content env-vars-tooltip",
            "html": "<span>button.config.edit</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.config.delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content env-vars-tooltip",
            "html": "<span>button.config.delete</span>",
          },
        },
      ]
    `)
    wrapper.unmount()
  })

  it('emits edit-item and delete-item from the desktop icons', async () => {
    const wrapper = await mountTable(1600)
    const buttons = wrapper.findAll('tbody button.v-btn--icon')

    // Row 1: Edit, Delete.
    await buttons[0]!.trigger('click')
    await buttons[1]!.trigger('click')

    expect(wrapper.emitted('edit-item')).toEqual([[items[0]]])
    expect(wrapper.emitted('delete-item')).toEqual([[items[0]]])
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
    return mountKit(EnvVarsTable, { props: { items, ...extra } })
  }

  it('sortuje przez nagłówek', async () => {
    const wrapper = await mountWith(1600)

    await wrapper.findAll('.custom-sort__item--sortable')[0]!.trigger('click')

    expect(wrapper.emitted('update:sort-by')?.[0]?.[0]).toMatchObject({ value: 'key' })
    wrapper.unmount()
  })

  it('pokazuje no-results dla frazy bez wyników i emituje clear-filters', async () => {
    const wrapper = await mountWith(1600, { searchTerm: 'zzz-brak' })

    expect(wrapper.findComponent(DataIteratorNoResultsContainer).exists()).toBe(true)
    wrapper.findComponent(DataIteratorNoResultsContainer).vm.$emit('clear-all-filters')

    expect(wrapper.emitted('clear-filters')).toHaveLength(1)
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

  it('pokazuje szkielet w czasie ładowania', async () => {
    const wrapper = await mountWith(1600, { itemsLoading: true })

    expect(wrapper.findAll('.v-skeleton-loader').length).toBeGreaterThan(0)
    expect(wrapper.text()).not.toContain('APP_KEY')
    wrapper.unmount()
  })

  it('szuka tylko po kluczu', async () => {
    const wrapper = await mountWith(1600, { searchTerm: 'secret' })

    expect(wrapper.text()).not.toContain('APP_KEY')
    wrapper.unmount()
  })

  it('wiersz readonly nie ma przycisków Edit i Delete', async () => {
    const wrapper = await mountWith(1600)
    const row = wrapper.findAll('tbody tr').find(tr => tr.text().includes('MULTI'))

    expect(row!.findAll('.actions-row .v-btn')).toHaveLength(0)
    wrapper.unmount()
  })

  it('karta poniżej 976 px', async () => {
    const wrapper = await mountWith(500)

    expect(wrapper.findAll('.mobile-table-item')).toHaveLength(items.length)
    wrapper.unmount()
  })
})
