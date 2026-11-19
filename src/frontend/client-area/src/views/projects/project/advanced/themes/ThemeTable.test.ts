import type { InstalledTheme } from '@/entities/project/instance-themes.api'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import DataIteratorFooter from '@/shared/ui/data-iterator/DataIteratorFooter.vue'
import DataIteratorNoResultsContainer from '@/shared/ui/data-iterator/DataIteratorNoResultsContainer.vue'
import Checkbox from '@/shared/ui/form/Checkbox.vue'
import { iconButtonsSnapshot } from '@/test/icon-buttons'
import { mountKit } from '@/test/mount-kit'
import ThemeTable from './ThemeTable.vue'

const items: InstalledTheme[] = [
  { name: 'twentytwentyfour', title: 'Twenty Twenty-Four', status: 'active', version: '1.0', update: 'none' },
  { name: 'astra', title: 'Astra', status: 'inactive', version: '4.0', update: 'available', update_version: '4.1' },
  { name: 'oceanwp', title: 'OceanWP', status: 'inactive', version: '3.0', update: 'none' },
]

async function mountTable () {
  return mountKit(ThemeTable, { props: { items, instanceId: 7 } })
}

// Characterization of the row actions: the markup, the tooltip text and its class stay as written by hand.
describe('ThemeTable row actions', () => {
  const width = window.innerWidth

  beforeEach(() => {
    window.innerWidth = 1600
  })

  afterEach(() => {
    window.innerWidth = width
  })

  it('renders Activate, Update and Delete of the rows with their tooltips unchanged', async () => {
    const wrapper = await mountTable()

    // The Update and Delete tooltips sit on the `div` around a possibly disabled button, so they are read from the wrappers.
    expect(await iconButtonsSnapshot(wrapper.get('tbody'))).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--disabled v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" disabled="" aria-label="tooltip.instance.theme.update"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": null,
        },
        {
          "html": "<button type="button" class="v-btn v-btn--disabled v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" disabled="" aria-label="tooltip.instance.theme.delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": null,
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="tooltip.instance.theme.activate"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>tooltip.instance.theme.activate</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="tooltip.instance.theme.update"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": null,
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="tooltip.instance.theme.delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": null,
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="tooltip.instance.theme.activate"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>tooltip.instance.theme.activate</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--disabled v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" disabled="" aria-label="tooltip.instance.theme.update"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": null,
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="tooltip.instance.theme.delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": null,
        },
      ]
    `)
    expect(await iconButtonsSnapshot(wrapper.get('tbody'), '.actions-row > div')).toMatchInlineSnapshot(`
      [
        {
          "html": "<div><button type="button" class="v-btn v-btn--disabled v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" disabled="" aria-label="tooltip.instance.theme.update"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button></div>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>tooltip.instance.theme.updated</span>",
          },
        },
        {
          "html": "<div><button type="button" class="v-btn v-btn--disabled v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" disabled="" aria-label="tooltip.instance.theme.delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>tooltip.instance.theme.cannotDelete</span>",
          },
        },
        {
          "html": "<div><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="tooltip.instance.theme.update"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button></div>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>tooltip.instance.theme.update</span>",
          },
        },
        {
          "html": "<div><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="tooltip.instance.theme.delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>tooltip.instance.theme.delete</span>",
          },
        },
        {
          "html": "<div><button type="button" class="v-btn v-btn--disabled v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" disabled="" aria-label="tooltip.instance.theme.update"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button></div>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>tooltip.instance.theme.updated</span>",
          },
        },
        {
          "html": "<div><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="tooltip.instance.theme.delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>tooltip.instance.theme.delete</span>",
          },
        },
      ]
    `)
    wrapper.unmount()
  })

  it('emits the row from Activate, Update and Delete', async () => {
    const wrapper = await mountTable()
    const row = wrapper.findAll('tbody tr')[1]!
    const buttons = row.findAll('button.v-btn--icon')

    await buttons[0]!.trigger('click')
    await buttons[1]!.trigger('click')
    await buttons[2]!.trigger('click')

    expect(wrapper.emitted('action-button-activate')).toEqual([[items[1]]])
    expect(wrapper.emitted('action-button-update')).toEqual([[items[1]]])
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
    return mountKit(ThemeTable, { props: { items, instanceId: 7, ...extra } })
  }

  it('sortuje przez nagłówek', async () => {
    const wrapper = await mountWith(1600)

    await wrapper.findAll('.custom-sort__item--sortable')[0]!.trigger('click')

    expect(wrapper.emitted('update:sort-by')?.[0]?.[0]).toBeDefined()
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
    const wrapper = await mountWith(1600, { items: [], searchTerm: 'x' })

    expect(wrapper.findComponent(DataIteratorNoResultsContainer).exists()).toBe(true)
    wrapper.findComponent(DataIteratorNoResultsContainer).vm.$emit('clear-all-filters')

    expect(wrapper.emitted('clear-filters')).toHaveLength(1)
    wrapper.unmount()
  })

  it('zaznaczenie wiersza emituje zaznaczony motyw', async () => {
    const wrapper = await mountWith(1600)

    wrapper.findAllComponents(Checkbox)[1]!.vm.$emit('update:model-value', true)

    expect((wrapper.emitted('update:checked-items')?.[0]?.[0] as InstalledTheme).name).toBe(items[0]!.name)
    wrapper.unmount()
  })

  it('zaznacz wszystko emituje update:check-all', async () => {
    const wrapper = await mountWith(1600)

    wrapper.findAllComponents(Checkbox)[0]!.vm.$emit('update:model-value', true)

    expect(wrapper.emitted('update:check-all')?.[0]?.[0]).toBe(true)
    wrapper.unmount()
  })

  it('pasek statusu: zielony dla aktywnego, bez niego dla nieaktywnego', async () => {
    const wrapper = await mountWith(1600)
    const rows = wrapper.findAll('tbody tr')

    expect(rows[0]!.html()).toContain('item-bordered--green')
    expect(rows[1]!.html()).not.toContain('item-bordered--green')
    wrapper.unmount()
  })
})
