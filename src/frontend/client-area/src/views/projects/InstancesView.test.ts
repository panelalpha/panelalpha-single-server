import type * as InstancesApi from './instances.api'
import type { VueWrapper } from '@vue/test-utils'
import type * as LabelsApi from '@/entities/label/labels.api'
import type * as ShareApi from '@/entities/project/share-instance.api'
import { flushPromises } from '@vue/test-utils'
import i18next from 'i18next'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import InstanceItem from '@/views/projects/InstanceItem.vue'
import * as labelsApi from '@/entities/label/labels.api'
import { type RawInstance, toInstanceResource } from '@/entities/project/instance-resource'
import * as shareApi from '@/entities/project/share-instance.api'
import CreateStagingModal from '@/entities/project/ui/CreateStagingModal.vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { emit, on, resetAppEvents } from '@/shared/events/app-events'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import * as instancesApi from './instances.api'
import { useInstancesStore } from './instances.store'
import InstancesView from './InstancesView.vue'

vi.mock('./instances.api', async importOriginal => {
  const actual: typeof InstancesApi = await importOriginal()
  return {
    ...actual,
    listInstances: vi.fn(),
    clearInstanceCache: vi.fn(),
    deleteInstance: vi.fn(),
  }
})
vi.mock('@/entities/label/labels.api', async importOriginal => {
  const actual: typeof LabelsApi = await importOriginal()
  return {
    ...actual,
    getLabels: vi.fn(),
  }
})
vi.mock('@/entities/project/share-instance.api', async importOriginal => {
  const actual: typeof ShareApi = await importOriginal()
  return {
    ...actual,
    fetchWordpressUsers: vi.fn(),
    fetchInvitationSuggestions: vi.fn(),
  }
})

function raw (id: number, overrides: Partial<RawInstance> = {}): RawInstance {
  return {
    id,
    type: 'wordpress',
    name: `Site ${id}`,
    url: `https://site-${id}.example.com`,
    domain: `site-${id}.example.com`,
    service_status: 'active',
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    service_created_at: '2026-01-01T00:00:00.000Z',
    version: '6.5.0',
    has_automatic_backup: true,
    backup_details: [{ id: 1, type: 'automatic' }],
    async_status: { installation: 'finished' },
    labels: [],
    privileges: [],
    shared_access: [],
    staging_apps: [],
    details: {},
    server_settings: {},
    ...overrides,
  }
}

function listOf (ids: number[], total = ids.length, overrides: (id: number) => Partial<RawInstance> = () => ({})) {
  return { data: ids.map(id => toInstanceResource(raw(id, overrides(id)))), meta: { total } }
}

async function mountView (singleServer = false) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().hydrateHome({ app: { integrations: {}, single_server: { active: singleServer } }, user: { name: 'Jane' } })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })
  const wrapper = await mountKit(InstancesView, { global: { plugins: [pinia, router] } })
  return wrapper
}

describe('InstancesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(labelsApi.getLabels).mockResolvedValue([])
    localStorage.clear()
    sessionStorage.clear()
    resetAppEvents()
  })

  it('shows 8 skeleton cards while the list loads', async () => {
    vi.mocked(instancesApi.listInstances).mockReturnValue(new Promise(() => undefined))
    const wrapper = await mountView()
    await flushPromises()

    expect(wrapper.find('h1').text()).toBe('heading.instance.title')
    expect(wrapper.findAll('[data-testid="instance-card-skeleton"]')).toHaveLength(8)
    expect(wrapper.find('[data-testid="instance-card"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders one card per instance with its title and url', async () => {
    vi.mocked(instancesApi.listInstances).mockResolvedValue(listOf([1, 2, 3]))
    const wrapper = await mountView()
    await flushPromises()

    const cards = wrapper.findAll('.data-iterator-card')
    expect(cards).toHaveLength(3)
    expect(cards.map(card => card.get('.data-iterator-card__title').text())).toEqual(['Site 1', 'Site 2', 'Site 3'])
    expect(wrapper.find('.responsive-card').exists()).toBe(true)
    expect(instancesApi.listInstances).toHaveBeenCalledWith(expect.objectContaining({ page: 1, perPage: 8, sortBy: 'created_at', sortDir: 'desc' }))
    wrapper.unmount()
  })

  it('shows the onboarding card for an empty, unfiltered list', async () => {
    vi.mocked(instancesApi.listInstances).mockResolvedValue(listOf([]))
    const wrapper = await mountView()
    await flushPromises()

    expect(wrapper.find('.no-data--instances').exists()).toBe(true)
    expect(wrapper.find('h1.nodata-container__title').exists()).toBe(true)
    expect(wrapper.classes()).toContain('instances-no-data-container')
    expect(wrapper.find('.data-iterator-filter-controls').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the API error with Retry, not the onboarding card or an empty frame, when the load fails', async () => {
    vi.mocked(instancesApi.listInstances).mockRejectedValue({ response: { status: 500, data: { message: 'Engine #1 is unreachable' } } })
    const wrapper = await mountView()
    await flushPromises()

    expect(wrapper.find('.no-data--instances').exists()).toBe(false)
    expect(wrapper.find('h1').text()).toBe('heading.instance.title')
    expect(wrapper.find('.no-results-container').exists()).toBe(false)
    expect(wrapper.get('[data-testid="instances-load-error"]').text()).toContain('Engine #1 is unreachable')
    expect(wrapper.get('[data-testid="instances-load-retry"]').text()).toBe('button.retry')
    wrapper.unmount()
  })

  it('Retry reloads the list and an empty answer shows the onboarding card', async () => {
    vi.mocked(instancesApi.listInstances).mockRejectedValueOnce(new Error('500'))
    const wrapper = await mountView()
    await flushPromises()
    vi.mocked(instancesApi.listInstances).mockResolvedValueOnce(listOf([]))

    await wrapper.get('[data-testid="instances-load-retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="instances-load-error"]').exists()).toBe(false)
    expect(wrapper.find('.no-data--instances').exists()).toBe(true)
    wrapper.unmount()
  })

  it('selects a card through its checkbox and keeps the selection across a reload event', async () => {
    vi.mocked(instancesApi.listInstances).mockResolvedValue(listOf([1, 2]))
    const wrapper = await mountView()
    await flushPromises()

    await wrapper.findAll('.data-iterator-card__checkbox-container input')[1]!.setValue(true)
    expect(wrapper.findAll('.data-iterator-card')[1]!.classes()).toContain('data-iterator-card--selected')

    emit('instances-list-reload')
    await flushPromises()
    expect(wrapper.findAll('.data-iterator-card')[1]!.classes()).toContain('data-iterator-card--selected')
    wrapper.unmount()
  })

  it('replaces a card in place on instance-item-changed', async () => {
    vi.mocked(instancesApi.listInstances).mockResolvedValue(listOf([1, 2]))
    const wrapper = await mountView()
    await flushPromises()
    vi.mocked(instancesApi.listInstances).mockClear()

    emit('instance-item-changed', raw(2, { name: 'Renamed' }) as unknown as Record<string, unknown>)
    await flushPromises()

    expect(wrapper.findAll('.data-iterator-card__title').map(title => title.text())).toEqual(['Site 1', 'Renamed'])
    expect(instancesApi.listInstances).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('loads the labels once on mount', async () => {
    vi.mocked(instancesApi.listInstances).mockResolvedValue(listOf([1]))
    const wrapper = await mountView()
    await flushPromises()
    expect(labelsApi.getLabels).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})

describe('InstancesView table and footer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(labelsApi.getLabels).mockResolvedValue([])
    localStorage.clear()
    sessionStorage.clear()
    resetAppEvents()
  })

  async function mountList (list = listOf([1, 2, 3])) {
    localStorage.setItem('instancesListStyle', '1')
    vi.mocked(instancesApi.listInstances).mockResolvedValue(list)
    const wrapper = await mountView()
    await flushPromises()
    return wrapper
  }

  async function mountCards (list = listOf([1, 2, 3])) {
    localStorage.setItem('instancesListStyle', '0')
    vi.mocked(instancesApi.listInstances).mockResolvedValue(list)
    const wrapper = await mountView()
    await flushPromises()
    return wrapper
  }

  /** The card view's sort select (`DataIteratorSortBy`): open it and pick the option with this copy key. */
  async function pickCardSort (wrapper: VueWrapper, value: string): Promise<void> {
    await wrapper.get('.data-iterator-filter-controls__item--sort-instances .v-field').trigger('mousedown')
    const option = await vi.waitFor(() => {
      const contents = [...document.body.querySelectorAll<HTMLElement>('.v-overlay--active .v-overlay__content.custom-dropdown-select')]
      for (const content of contents.toReversed()) {
        const found = [...content.querySelectorAll<HTMLElement>('.input-dropdown-item')]
          .find(row => row.textContent?.trim() === `form.option.${value}`)
        if (found) {
          return found
        }
      }
      throw new Error(`no sort option ${value}`)
    })
    option.click()
    await flushPromises()
    await vi.waitFor(() => expect(document.body.querySelector('.v-overlay--active .custom-dropdown-select')).toBeNull())
  }

  it('renders the table with its sort header and one row per instance when the list style is 1', async () => {
    const wrapper = await mountList()

    expect(wrapper.find('.data-iterator-card').exists()).toBe(false)
    expect(wrapper.find('.custom-sort').exists()).toBe(true)
    expect(wrapper.findAll('.table-row')).toHaveLength(3)
    expect(wrapper.findAll('.table-row .item__title').map(title => title.text())).toEqual(['Site 1', 'Site 2', 'Site 3'])
    wrapper.unmount()
  })

  it('shows 10 skeleton rows while the table loads', async () => {
    vi.mocked(instancesApi.listInstances).mockReturnValue(new Promise(() => undefined))
    localStorage.setItem('instancesListStyle', '1')
    const wrapper = await mountView()
    await flushPromises()

    expect(wrapper.findAll('.skeleton-row')).toHaveLength(10)
    expect(wrapper.find('.table-row').exists()).toBe(false)
    wrapper.unmount()
  })

  it('persists the list style through the switch (localStorage)', async () => {
    vi.mocked(instancesApi.listInstances).mockResolvedValue(listOf([1]))
    const wrapper = await mountView()
    await flushPromises()
    expect(wrapper.find('.data-iterator-card').exists()).toBe(true)

    await wrapper.get('[data-testid="instances-style-switch"]').findAll('button')[1]!.trigger('click')
    await flushPromises()

    expect(localStorage.getItem('instancesListStyle')).toBe('1')
    expect(wrapper.find('.table-row').exists()).toBe(true)
    expect(wrapper.find('.data-iterator-card').exists()).toBe(false)
    wrapper.unmount()
  })

  it('reverses the direction on a second click on the sorted header and reloads', async () => {
    const wrapper = await mountList()
    vi.mocked(instancesApi.listInstances).mockClear()

    const newest = wrapper.findAll('.custom-sort__item').find(item => item.text() === 'table.header.newest')!
    await newest.trigger('click')
    await flushPromises()
    expect(instancesApi.listInstances).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: 'created_at', sortDir: 'asc' }))

    await newest.trigger('click')
    await flushPromises()
    expect(instancesApi.listInstances).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: 'created_at', sortDir: 'desc' }))
    wrapper.unmount()
  })

  it('sorts by another column on the first click, starting that column in its own direction', async () => {
    const wrapper = await mountList()
    vi.mocked(instancesApi.listInstances).mockClear()

    const name = wrapper.findAll('.custom-sort__item').find(item => item.text() === 'table.header.name')!
    await name.trigger('click')
    await flushPromises()
    expect(instancesApi.listInstances).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: 'name', sortDir: 'asc', page: 1 }))

    const bandwidth = wrapper.findAll('.custom-sort__item').find(item => item.text() === 'table.header.bandwidth')!
    await bandwidth.trigger('click')
    await flushPromises()
    expect(instancesApi.listInstances).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: 'bandwidth', sortDir: 'desc', page: 1 }))
    wrapper.unmount()
  })

  it('offers the sort directions the table header uses: Name A to Z first, the measures and Newest first', async () => {
    const wrapper = await mountCards()
    vi.mocked(instancesApi.listInstances).mockClear()

    await pickCardSort(wrapper, 'name')
    expect(instancesApi.listInstances).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: 'name', sortDir: 'asc', page: 1 }))
    expect(wrapper.findAll('.data-iterator-card__title').map(title => title.text())).toEqual(['Site 1', 'Site 2', 'Site 3'])

    for (const [option, sortBy] of [['bandwidth', 'bandwidth'], ['storage', 'storage'], ['newest', 'created_at']]) {
      await pickCardSort(wrapper, option!)
      expect(instancesApi.listInstances).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy, sortDir: 'desc', page: 1 }))
    }
    wrapper.unmount()
  })

  it('keeps one direction per sort name for both views: the table header reverses the card pick', async () => {
    const wrapper = await mountCards()
    await pickCardSort(wrapper, 'name')
    expect(useInstancesStore().sortDesc).toBe(false)

    await wrapper.get('[data-testid="instances-style-switch"]').findAll('button')[1]!.trigger('click')
    await flushPromises()

    vi.mocked(instancesApi.listInstances).mockClear()
    const name = wrapper.findAll('.custom-sort__item').find(item => item.text() === 'table.header.name')!
    await name.trigger('click')
    await flushPromises()
    expect(instancesApi.listInstances).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: 'name', sortDir: 'desc', page: 1 }))
    wrapper.unmount()
  })

  it('selects a row and all rows through the checkboxes', async () => {
    const wrapper = await mountList()

    await wrapper.findAll('.table-row .item--select input')[0]!.setValue(true)
    expect([...useInstancesStore().checkedItems]).toEqual([1])

    await wrapper.get('.custom-sort__checkbox input').setValue(true)
    expect([...useInstancesStore().checkedItems]).toEqual([1, 2, 3])
    wrapper.unmount()
  })

  it('renders a staging app as a sub-row below its parent', async () => {
    const parent = toInstanceResource(raw(1, { staging_apps: [raw(11, { name: 'Staging', staging: true })] }))
    const wrapper = await mountList({ data: [parent], meta: { total: 1 } })

    expect(wrapper.findAll('.table-row')).toHaveLength(1)
    expect(wrapper.findAll('.table-subrow')).toHaveLength(1)
    expect(wrapper.get('.table-subrow').text()).toContain('Staging')
    wrapper.unmount()
  })

  it('reloads the list after a staging is created (E3: legacy never did)', async () => {
    const wrapper = await mountList()
    vi.mocked(instancesApi.listInstances).mockClear()

    wrapper.findComponent(CreateStagingModal).vm.$emit('created', { id: 99 })
    await flushPromises()

    expect(instancesApi.listInstances).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('hides the footer on a single page of 8 and shows it with more pages (grid and table)', async () => {
    for (const style of ['0', '1']) {
      localStorage.setItem('instancesListStyle', style)
      vi.mocked(instancesApi.listInstances).mockResolvedValue(listOf([1, 2, 3], 3))
      let wrapper = await mountView()
      await flushPromises()
      expect(wrapper.find('.data-iterator-footer').exists()).toBe(false)
      wrapper.unmount()

      vi.mocked(instancesApi.listInstances).mockResolvedValue(listOf([1, 2, 3], 20))
      wrapper = await mountView()
      await flushPromises()
      expect(wrapper.find('.data-iterator-footer').exists()).toBe(true)
      expect(wrapper.findAll('.v-pagination__item')).toHaveLength(3)
      wrapper.unmount()
    }
  })

  it('labels the per-page row with table.footer.record in the grid and table.footer.instance in the table', async () => {
    vi.mocked(instancesApi.listInstances).mockResolvedValue(listOf([1, 2, 3], 20))

    localStorage.setItem('instancesListStyle', '0')
    let wrapper = await mountView()
    await flushPromises()
    expect(wrapper.get('.data-iterator-page-number span').text()).toBe('table.footer.record')
    wrapper.unmount()

    localStorage.setItem('instancesListStyle', '1')
    wrapper = await mountView()
    await flushPromises()
    expect(wrapper.get('.data-iterator-page-number span').text()).toBe('table.footer.instance')
    wrapper.unmount()
  })

  it('compares the "all" option with the translated general.all, as legacy does', async () => {
    // Legacy `DataIteratorFooter` maps only the literal "all" to 99: it works because the English copy of `general.all` is "all".
    i18next.addResource('en', 'translation', 'general.all', 'all')
    try {
      const wrapper = await mountList(listOf([1, 2, 3], 20))
      vi.mocked(instancesApi.listInstances).mockClear()

      const all = wrapper.findAll('.data-iterator-page-number button').find(button => button.text() === 'all')!
      await all.trigger('click')
      await flushPromises()

      expect(instancesApi.listInstances).toHaveBeenLastCalledWith(expect.objectContaining({ perPage: 99, page: 1 }))
      expect(sessionStorage.getItem('paginationSet')).toBe('99')
      expect(wrapper.findAll('.data-iterator-page-number button').find(button => button.text() === 'all')!.classes()).toContain('active')
      wrapper.unmount()
    } finally {
      i18next.removeResourceBundle('en', 'translation')
      i18next.addResourceBundle('en', 'translation', {})
    }
  })

  it('restores "all" from sessionStorage as 99 per page after a reload', async () => {
    sessionStorage.setItem('paginationSet', 'all')
    const wrapper = await mountList(listOf([1, 2, 3], 20))
    expect(instancesApi.listInstances).toHaveBeenCalledWith(expect.objectContaining({ perPage: 99 }))
    wrapper.unmount()
  })

  it('hides the per-page buttons on a mobile viewport', async () => {
    const width = window.innerWidth
    window.innerWidth = 500
    try {
      const wrapper = await mountList(listOf([1, 2, 3], 20))
      expect(wrapper.find('.data-iterator-footer').exists()).toBe(true)
      expect(wrapper.find('.data-iterator-page-number').exists()).toBe(false)
      wrapper.unmount()
    } finally {
      window.innerWidth = width
    }
  })
})

describe('InstancesView selection and mass actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(labelsApi.getLabels).mockResolvedValue([])
    vi.mocked(instancesApi.clearInstanceCache).mockResolvedValue(undefined)
    vi.mocked(instancesApi.deleteInstance).mockResolvedValue(undefined)
    vi.mocked(shareApi.fetchWordpressUsers).mockResolvedValue([])
    vi.mocked(shareApi.fetchInvitationSuggestions).mockResolvedValue([])
    localStorage.clear()
    sessionStorage.clear()
    resetAppEvents()
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  async function mountSelected (ids = [1, 2, 3], selected = [0, 1], overrides?: (id: number) => Partial<RawInstance>) {
    vi.mocked(instancesApi.listInstances).mockResolvedValue(listOf(ids, ids.length, overrides))
    const host = document.createElement('div')
    document.body.append(host)
    const pinia = createPinia()
    setActivePinia(pinia)
    const session = useSessionStore()
    session.hydrateHome({ app: { integrations: {}, single_server: { active: false } }, user: { name: 'Jane' } })
    const ensureHome = vi.spyOn(session, 'ensureHome').mockResolvedValue(session.home!)
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })
    const wrapper = await mountKit(InstancesView, { global: { plugins: [pinia, router] }, attachTo: host })
    await flushPromises()
    for (const index of selected) {
      await wrapper.findAll('.data-iterator-card__checkbox-container input')[index]!.setValue(true)
    }
    await flushPromises()
    return { wrapper, ensureHome, store: useInstancesStore() }
  }

  const bodyQuery = (selector: string) => document.body.querySelector<HTMLElement>(selector)
  const bodyQueryAll = (selector: string) => [...document.body.querySelectorAll<HTMLElement>(selector)]

  async function clickBar (testId: string) {
    bodyQuery(`[data-testid="${testId}"]`)!.click()
    await flushPromises()
  }

  it('shows the selection bar with the count and clears the selection from Deselect', async () => {
    const { wrapper, store } = await mountSelected()

    expect(bodyQuery('.snackbar__item-number')!.textContent!.trim()).toBe('2')
    expect([...store.checkedItems]).toEqual([1, 2])

    const deselect = bodyQueryAll('.snackbar__row .btn-icon-horizontal').find(link => link.textContent!.includes('deselect'))!
    deselect.click()
    await flushPromises()
    expect(store.checkedItems).toHaveLength(0)
    // The bar leaves with its transition; it is no longer active.
    expect(bodyQuery('[data-testid="instances-snackbar"]')?.classList.contains('v-overlay--active')).toBeFalsy()
    wrapper.unmount()
  })

  it('selects every card of the page from Select all', async () => {
    const { wrapper, store } = await mountSelected()

    const selectAll = bodyQueryAll('.snackbar__row .btn-icon-horizontal').find(link => link.textContent!.includes('selectAll'))!
    selectAll.click()
    await flushPromises()
    expect([...store.checkedItems]).toEqual([1, 2, 3])
    wrapper.unmount()
  })

  it('keeps Delete disabled until every acknowledgement is ticked, then deletes with them', async () => {
    const { wrapper, ensureHome, store } = await mountSelected()
    const deleted: unknown[] = []
    on('instance-deleted', payload => deleted.push(payload))
    vi.mocked(instancesApi.listInstances).mockClear()

    await clickBar('instances-snackbar-remove')
    const modal = bodyQuery('[data-testid="instances-modal"]')!
    expect(modal.textContent).toContain('heading.instance.delete.title')
    const checkboxes = bodyQueryAll('[data-testid="instances-modal"] .v-card-text .checkbox input')
    expect(checkboxes).toHaveLength(3)

    const submit = () => bodyQueryAll('[data-testid="instances-modal"] .v-card-actions .v-btn')[0]!
    expect(submit().hasAttribute('disabled')).toBe(true)

    checkboxes[0]!.click()
    checkboxes[2]!.click()
    await flushPromises()
    expect(submit().hasAttribute('disabled')).toBe(true)

    checkboxes[1]!.click()
    await flushPromises()
    expect(submit().hasAttribute('disabled')).toBe(false)

    submit().click()
    await flushPromises()

    expect(vi.mocked(instancesApi.deleteInstance).mock.calls).toEqual([
      [1, { remove_data: true, remove_database: true, confirm: true }],
      [2, { remove_data: true, remove_database: true, confirm: true }],
    ])
    expect(ensureHome).toHaveBeenCalledWith(true)
    expect(useAlertsStore().activeAlerts.map(alert => alert.successMessage)).toEqual(['notification.instance.modal.delete.success'])
    expect(deleted).toHaveLength(1)
    expect(store.checkedItems).toHaveLength(0)
    // `instance-deleted` goes back to page 1 and reloads the list.
    expect(instancesApi.listInstances).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('turns a 404 on delete into success', async () => {
    vi.mocked(instancesApi.deleteInstance).mockRejectedValue(Object.assign(new Error('gone'), { response: { status: 404 } }))
    const { wrapper, store } = await mountSelected()
    await clickBar('instances-snackbar-remove')

    for (const checkbox of bodyQueryAll('[data-testid="instances-modal"] .v-card-text .checkbox input')) {
      checkbox.click()
    }
    await flushPromises()
    bodyQueryAll('[data-testid="instances-modal"] .v-card-actions .v-btn')[0]!.click()
    await flushPromises()

    expect(useAlertsStore().activeAlerts.map(alert => alert.success)).toEqual([true])
    expect(store.checkedItems).toHaveLength(0)
    wrapper.unmount()
  })

  it('keeps the dialog open and the selection when a delete fails', async () => {
    vi.mocked(instancesApi.deleteInstance).mockRejectedValue(Object.assign(new Error('nope'), { response: { status: 403, data: { message: 'Forbidden.' } } }))
    const { wrapper, store } = await mountSelected()
    await clickBar('instances-snackbar-remove')

    for (const checkbox of bodyQueryAll('[data-testid="instances-modal"] .v-card-text .checkbox input')) {
      checkbox.click()
    }
    await flushPromises()
    bodyQueryAll('[data-testid="instances-modal"] .v-card-actions .v-btn')[0]!.click()
    await flushPromises()

    expect(useAlertsStore().activeAlerts.map(alert => alert.errorMessage)).toEqual(['Forbidden.'])
    expect([...store.checkedItems]).toEqual([1, 2])
    expect(bodyQuery('[data-testid="instances-modal"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('opens the unsuspend prompt from a suspended card and opens the link in a new tab', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    vi.mocked(instancesApi.listInstances).mockResolvedValue({
      data: [toInstanceResource(raw(1, { service_status: 'suspended' }))],
      meta: { total: 1 },
    })
    const pinia = createPinia()
    setActivePinia(pinia)
    useSessionStore().hydrateHome({ app: { integrations: {}, single_server: { active: false } }, user: { service_unsuspend_link: 'https://pay.example.com' } })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })
    const host = document.createElement('div')
    document.body.append(host)
    const wrapper = await mountKit(InstancesView, { global: { plugins: [pinia, router] }, attachTo: host })
    await flushPromises()

    await wrapper.get('.instance-actions--suspended').trigger('click')
    await flushPromises()
    const modal = bodyQuery('[data-testid="instances-modal"]')!
    expect(modal.textContent).toContain('heading.instance.unsuspend.title')
    expect(modal.getAttribute('style')).toContain('width: 360px')

    bodyQueryAll('[data-testid="instances-modal"] .v-card-actions .v-btn')[0]!.click()
    expect(open).toHaveBeenCalledWith('https://pay.example.com', '_blank')
    // The prompt stays open, as in legacy.
    expect(bodyQuery('[data-testid="instances-modal"]')).not.toBeNull()
    open.mockRestore()
    wrapper.unmount()
  })

  it('opens the share dialog for the selection with its count', async () => {
    const { wrapper } = await mountSelected([1, 2, 3], [0, 1], () => ({ privileges: ['general.manage_shared_access'] }))
    await clickBar('instances-snackbar-share')

    const modal = bodyQuery('[data-testid="share-modal"]')!
    expect(modal.textContent).toContain('heading.instance.modal.sharedAccess.title.other')
    expect(shareApi.fetchWordpressUsers).toHaveBeenCalledWith(1)
    expect(document.documentElement.classList.contains('scrollLock')).toBe(true)
    wrapper.unmount()
    expect(document.documentElement.classList.contains('scrollLock')).toBe(false)
  })

  it('hides the mass Share when a selected project lacks the share privilege', async () => {
    const { wrapper } = await mountSelected([1, 2, 3], [0, 1], id => ({ privileges: id === 1 ? ['general.manage_shared_access'] : [] }))

    expect(bodyQuery('[data-testid="instances-snackbar"]')).not.toBeNull()
    expect(bodyQuery('[data-testid="instances-snackbar-share"]')).toBeNull()
    expect(bodyQuery('[data-testid="instances-snackbar-remove"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('opens the share dialog of one instance from its share chip', async () => {
    vi.mocked(instancesApi.listInstances).mockResolvedValue({
      data: [toInstanceResource(raw(5, { privileges: ['general.manage_shared_access'], shared_access: [{ email: 'a@example.com', name: 'Ann', role: 'view_only', accepted_at: '2026-01-01' }] }))],
      meta: { total: 1 },
    })
    const host = document.createElement('div')
    document.body.append(host)
    const pinia = createPinia()
    setActivePinia(pinia)
    useSessionStore().hydrateHome({ app: { integrations: {}, single_server: { active: false } }, user: { name: 'Jane' } })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })
    const wrapper = await mountKit(InstancesView, { global: { plugins: [pinia, router] }, attachTo: host })
    await flushPromises()

    await wrapper.get('.shares-label').trigger('click')
    await flushPromises()

    const modal = bodyQuery('[data-testid="share-modal"]')!
    expect(modal.textContent).toContain('heading.instance.modal.sharedAccess.title.one')
    expect(modal.textContent).toContain('Ann')
    expect(shareApi.fetchWordpressUsers).toHaveBeenCalledWith(5)
    wrapper.unmount()
  })

  describe('app-lite single server', () => {
    function dropOn (element: Element, files: File[]) {
      const event = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer?: unknown }
      event.dataTransfer = { types: ['Files'], files, items: [] }
      element.dispatchEvent(event)
      return event
    }

    it('uses the project heading under single server and the instance one otherwise', async () => {
      vi.mocked(instancesApi.listInstances).mockResolvedValue(listOf([1]))
      const lite = await mountView(true)
      await flushPromises()
      expect(lite.find('h1').text()).toBe('heading.instance.titleProjects')
      lite.unmount()

      const app = await mountView(false)
      await flushPromises()
      expect(app.find('h1').text()).toBe('heading.instance.title')
      app.unmount()
    })

    it('wraps the list in the drop zone, and not on multi server', async () => {
      vi.mocked(instancesApi.listInstances).mockResolvedValue(listOf([1]))
      const lite = await mountView(true)
      await flushPromises()
      expect(lite.find('[data-testid="instances-drop-zone"] [data-testid="instances-content"]').exists()).toBe(true)
      lite.unmount()

      const app = await mountView(false)
      await flushPromises()
      expect(app.find('[data-testid="instances-drop-zone"]').exists()).toBe(false)
      expect(app.find('[data-testid="instances-content"]').exists()).toBe(true)
      app.unmount()
    })

    it('wraps the onboarding card of an empty list in the drop zone too', async () => {
      vi.mocked(instancesApi.listInstances).mockResolvedValue(listOf([]))
      const wrapper = await mountView(true)
      await flushPromises()
      expect(wrapper.find('[data-testid="instances-drop-zone"] .no-data--instances').exists()).toBe(true)
      wrapper.unmount()
    })

    it('a valid drop loads /home and emits start-files-drop-install with the files', async () => {
      vi.mocked(instancesApi.listInstances).mockResolvedValue(listOf([1]))
      const wrapper = await mountView(true)
      await flushPromises()
      const refreshServices = vi.spyOn(useSessionStore(), 'refreshServices').mockResolvedValue(undefined)
      const seen = vi.fn()
      on('start-files-drop-install', seen)

      const zip = new File(['x'], 'site.zip')
      dropOn(wrapper.get('[data-testid="instances-drop-zone"]').element, [zip])
      await vi.waitFor(() => expect(seen).toHaveBeenCalledWith({ uploadItems: [zip] }))
      expect(refreshServices).toHaveBeenCalled()
      expect(useAlertsStore().activeAlerts).toEqual([])
      wrapper.unmount()
    })

    it('shows the error when /home cannot be loaded, and emits nothing', async () => {
      vi.mocked(instancesApi.listInstances).mockResolvedValue(listOf([1]))
      const wrapper = await mountView(true)
      await flushPromises()
      vi.spyOn(useSessionStore(), 'refreshServices').mockRejectedValue({ response: { status: 500, data: { message: 'Down.' } } })
      const seen = vi.fn()
      on('start-files-drop-install', seen)

      dropOn(wrapper.get('[data-testid="instances-drop-zone"]').element, [new File(['x'], 'site.zip')])
      await vi.waitFor(() => expect(useAlertsStore().activeAlerts).toHaveLength(1))
      expect(useAlertsStore().activeAlerts[0]).toMatchObject({ success: false, errorMessage: 'Down.' })
      expect(seen).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('an invalid drop adds the legacy alert and emits nothing', async () => {
      vi.mocked(instancesApi.listInstances).mockResolvedValue(listOf([1]))
      const wrapper = await mountView(true)
      await flushPromises()
      const seen = vi.fn()
      on('start-files-drop-install', seen)

      dropOn(wrapper.get('[data-testid="instances-drop-zone"]').element, [new File(['x'], 'notes.txt')])
      await vi.waitFor(() => expect(useAlertsStore().activeAlerts).toHaveLength(1))
      expect(useAlertsStore().activeAlerts[0]).toMatchObject({ success: false, errorMessage: 'heading.onboarding.zipDeploy.file.invalidType' })
      expect(seen).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('stops the browser from opening a file dropped beside the zone, only while mounted and only on single server', async () => {
      vi.mocked(instancesApi.listInstances).mockResolvedValue(listOf([1]))
      const lite = await mountView(true)
      await flushPromises()
      const beside = new Event('drop', { cancelable: true })
      document.body.dispatchEvent(beside)
      window.dispatchEvent(beside)
      expect(beside.defaultPrevented).toBe(true)
      lite.unmount()
      const after = new Event('dragover', { cancelable: true })
      window.dispatchEvent(after)
      expect(after.defaultPrevented).toBe(false)

      const app = await mountView(false)
      await flushPromises()
      const appEvent = new Event('dragover', { cancelable: true })
      window.dispatchEvent(appEvent)
      expect(appEvent.defaultPrevented).toBe(false)
      app.unmount()
    })
  })
})

describe('InstancesView installation flows (S-09b Phase 6)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(labelsApi.getLabels).mockResolvedValue([])
    vi.mocked(instancesApi.deleteInstance).mockResolvedValue(undefined)
    localStorage.clear()
    sessionStorage.clear()
    resetAppEvents()
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  const failedInstall = raw(1, { async_status: { installation: 'failed' }, import_details: null, install_details: { install_method: 'zip' } })
  const failedImport = raw(2, { async_status: { installation: 'failed' }, import_details: { steps: { installNewInstance: 'failed' }, current_step: null, message: 'No space' } })
  const importing = raw(3, { async_status: { installation: 'in_progress' }, import_details: { steps: { installNewInstance: 'in-progress' }, current_step: { name: 'installNewInstance', percent: 40 } } })

  async function mountPending (style: 'grid' | 'table' = 'grid') {
    if (style === 'table') {
      localStorage.setItem('instancesListStyle', '1')
    }
    const items = [failedInstall, failedImport, importing].map(item => toInstanceResource(item))
    vi.mocked(instancesApi.listInstances).mockResolvedValue({ data: items, meta: { total: items.length } })
    const host = document.createElement('div')
    document.body.append(host)
    const pinia = createPinia()
    setActivePinia(pinia)
    const session = useSessionStore()
    session.hydrateHome({ app: { integrations: {}, single_server: { active: false } }, user: { name: 'Jane' } })
    vi.spyOn(session, 'ensureHome').mockResolvedValue(session.home!)
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })
    const wrapper = await mountKit(InstancesView, { global: { plugins: [pinia, router] }, attachTo: host })
    await flushPromises()
    return wrapper
  }

  const bodyQuery = (selector: string) => document.body.querySelector<HTMLElement>(selector)

  it('asks before cancelling from the card overlay, then deletes with the acknowledgement and reloads the list', async () => {
    const wrapper = await mountPending()
    const deleted = vi.fn()
    on('instance-deleted', deleted)
    vi.mocked(instancesApi.listInstances).mockClear()

    await wrapper.findAll('[data-testid="instance-cancel-install"]')[0]!.trigger('click')
    await flushPromises()
    expect(instancesApi.deleteInstance).not.toHaveBeenCalled()
    const submit = bodyQuery('[data-testid="cancel-install-submit"]') as HTMLButtonElement
    expect(submit.disabled).toBe(true)

    bodyQuery('[data-testid="cancel-install-confirm"] input')!.click()
    await flushPromises()
    submit.click()
    await flushPromises()

    expect(instancesApi.deleteInstance).toHaveBeenCalledExactlyOnceWith(1, { remove_data: true, remove_database: true, confirm: true })
    expect(useAlertsStore().activeAlerts.map(alert => alert.successMessage)).toEqual(['notification.instance.installation.cancelled'])
    expect(deleted).toHaveBeenCalledOnce()
    expect(instancesApi.listInstances).toHaveBeenCalledTimes(1)
    expect(bodyQuery('[data-testid="cancel-install-dialog"]')?.closest('.v-overlay--active')).toBeFalsy()
    wrapper.unmount()
  })

  it('keeps the dialog open and shows the error when the cancel fails', async () => {
    vi.mocked(instancesApi.deleteInstance).mockRejectedValue({ response: { status: 500, data: { message: 'Busy.' } } })
    const wrapper = await mountPending()
    const deleted = vi.fn()
    on('instance-deleted', deleted)

    await wrapper.findAll('[data-testid="instance-cancel-install"]')[0]!.trigger('click')
    await flushPromises()
    bodyQuery('[data-testid="cancel-install-confirm"] input')!.click()
    await flushPromises()
    ;(bodyQuery('[data-testid="cancel-install-submit"]') as HTMLButtonElement).click()
    await flushPromises()

    expect(useAlertsStore().activeAlerts[0]).toMatchObject({ success: false })
    expect(deleted).not.toHaveBeenCalled()
    expect(bodyQuery('[data-testid="cancel-install-dialog"]')?.closest('.v-overlay--active')).toBeTruthy()
    wrapper.unmount()
  })

  it('asks before cancelling from the table kebab, then deletes with the acknowledgement', async () => {
    const wrapper = await mountPending('table')
    vi.mocked(instancesApi.listInstances).mockClear()

    await wrapper.findAll('[data-testid="instance-table-menu"]')[0]!.trigger('click')
    await flushPromises()
    bodyQuery('[data-testid="instance-menu-cancel-install"]')!.click()
    await flushPromises()

    expect(bodyQuery('[data-testid="cancel-install-dialog"]')).not.toBeNull()
    expect(instancesApi.deleteInstance).not.toHaveBeenCalled()

    bodyQuery('[data-testid="cancel-install-confirm"] input')!.click()
    await flushPromises()
    ;(bodyQuery('[data-testid="cancel-install-submit"]') as HTMLButtonElement).click()
    await flushPromises()

    expect(instancesApi.deleteInstance).toHaveBeenCalledExactlyOnceWith(1, { remove_data: true, remove_database: true, confirm: true })
    expect(instancesApi.listInstances).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('asks before cancelling from the card installation indicator, then deletes with the acknowledgement', async () => {
    const wrapper = await mountPending()
    vi.mocked(instancesApi.listInstances).mockClear()

    wrapper.findComponent(InstanceItem).vm.$emit('cancel-installation', toInstanceResource(failedInstall))
    await flushPromises()

    expect(bodyQuery('[data-testid="cancel-install-dialog"]')).not.toBeNull()
    expect(instancesApi.deleteInstance).not.toHaveBeenCalled()

    bodyQuery('[data-testid="cancel-install-confirm"] input')!.click()
    await flushPromises()
    ;(bodyQuery('[data-testid="cancel-install-submit"]') as HTMLButtonElement).click()
    await flushPromises()

    expect(instancesApi.deleteInstance).toHaveBeenCalledExactlyOnceWith(1, { remove_data: true, remove_database: true, confirm: true })
    expect(instancesApi.listInstances).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('raises instance-retry-install exactly once from the overlay and from the kebab (E5)', async () => {
    const grid = await mountPending()
    const seen = vi.fn()
    on('instance-retry-install', seen)

    await grid.findAll('[data-testid="instance-retry-install"]')[0]!.trigger('click')
    expect(seen).toHaveBeenCalledOnce()
    expect(seen.mock.calls[0]![0]).toMatchObject({ id: 1 })
    grid.unmount()

    seen.mockClear()
    const table = await mountPending('table')
    await table.findAll('[data-testid="instance-table-menu"]')[0]!.trigger('click')
    await flushPromises()
    bodyQuery('[data-testid="instance-menu-retry"]')!.click()
    await flushPromises()
    expect(seen).toHaveBeenCalledOnce()
    table.unmount()
  })

  it('opens the import details from the card overlay', async () => {
    const wrapper = await mountPending()

    await wrapper.findAll('[data-testid="instance-import-details"]')[0]!.trigger('click')
    await flushPromises()

    expect(bodyQuery('[data-testid="import-details-modal"]')).not.toBeNull()
    expect(bodyQuery('[data-testid="import-details-modal"]')!.textContent).toContain('message.importing.modal.title')
    wrapper.unmount()
  })
})
