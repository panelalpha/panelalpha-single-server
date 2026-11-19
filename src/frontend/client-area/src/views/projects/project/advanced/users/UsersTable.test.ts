import type { InstanceAppUser } from './users.api'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import DataIteratorFooter from '@/shared/ui/data-iterator/DataIteratorFooter.vue'
import DataIteratorNoResultsContainer from '@/shared/ui/data-iterator/DataIteratorNoResultsContainer.vue'
import { iconButtonsSnapshot } from '@/test/icon-buttons'
import { mountKit } from '@/test/mount-kit'
import { usersHeaders } from './users-table'
import UsersTable from './UsersTable.vue'

const t = (key: string) => key

const items: InstanceAppUser[] = [
  { id: '1', username: 'admin', email: 'admin@example.com', role: 'administrator' },
  { id: '2', username: 'editor', email: 'editor@example.com', role: 'editor' },
]

async function mountTable (width: number) {
  window.innerWidth = width
  return mountKit(UsersTable, {
    props: { items, headers: usersHeaders(t), page: 1, itemsPerPage: 8, possibleItemsPerPage: [[8, 16, 24]], sortBy: false, sortDesc: false, searchTerm: '' },
  })
}

// Characterization of the row actions: the markup, the tooltip text and its class stay as written by hand.
describe('UsersTable row actions', () => {
  const width = window.innerWidth

  beforeEach(() => {
    window.innerWidth = 1600
  })

  afterEach(() => {
    window.innerWidth = width
  })

  it('renders Reset password and Delete of the desktop rows with their tooltips unchanged (Delete disabled for id 1)', async () => {
    const wrapper = await mountTable(1600)

    expect(await iconButtonsSnapshot(wrapper.get('tbody'))).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.resetPassword" data-testid="users-reset-password"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content users-row-tooltip",
            "html": "<span>button.resetPassword</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--disabled v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" disabled="" aria-label="button.user.delete" data-testid="users-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": null,
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.resetPassword" data-testid="users-reset-password"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content users-row-tooltip",
            "html": "<span>button.resetPassword</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.user.delete" data-testid="users-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content users-row-tooltip",
            "html": "<span>button.user.delete</span>",
          },
        },
      ]
    `)
    wrapper.unmount()
  })

  it('renders Reset password and Delete of the mobile cards with their tooltips unchanged', async () => {
    const wrapper = await mountTable(500)

    expect(await iconButtonsSnapshot(wrapper.get('tbody'))).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.resetPassword"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content users-row-tooltip",
            "html": "<span>button.resetPassword</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--disabled v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" disabled="" aria-label="button.user.delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": null,
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.resetPassword"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content users-row-tooltip",
            "html": "<span>button.resetPassword</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.user.delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content users-row-tooltip",
            "html": "<span>button.user.delete</span>",
          },
        },
      ]
    `)
    wrapper.unmount()
  })

  it('emits the row from Reset password and Delete', async () => {
    const wrapper = await mountTable(1600)
    const buttons = wrapper.findAll('tbody tr')[1]!.findAll('button.v-btn--icon')

    await buttons[0]!.trigger('click')
    await buttons[1]!.trigger('click')

    expect(wrapper.emitted('action-button-reset-password')).toEqual([[items[1]]])
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
    return mountKit(UsersTable, {
      props: { items, headers: usersHeaders(t), page: 1, itemsPerPage: 8, possibleItemsPerPage: [[8, 16, 24]], sortBy: false, sortDesc: false, searchTerm: '', ...extra },
    })
  }

  it('sortuje przez nagłówek', async () => {
    const wrapper = await mountWith(1600)

    await wrapper.findAll('.custom-sort__item--sortable')[0]!.trigger('click')

    expect(wrapper.emitted('update:sort-by')?.[0]?.[0]).toMatchObject({ value: 'id' })
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
    expect(wrapper.text()).not.toContain(items[0]!.username)
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
    const label = wrapper.findAll('.mobile-table-item__header').find(el => el.text() === 'table.header.email')

    await label!.trigger('click')

    expect(wrapper.emitted('update:sort-by')?.[0]?.[0]).toMatchObject({ value: 'email' })
    wrapper.unmount()
  })

  it('pokazuje slot no-data bez frazy przy pustej liście', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(UsersTable, {
      props: { items: [], headers: usersHeaders(t), page: 1, itemsPerPage: 8, possibleItemsPerPage: [[8, 16, 24]], sortBy: false, sortDesc: false, searchTerm: '' },
      slots: { 'no-data': '<div data-testid="slot-empty" />' },
    })

    expect(wrapper.find('[data-testid="slot-empty"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
