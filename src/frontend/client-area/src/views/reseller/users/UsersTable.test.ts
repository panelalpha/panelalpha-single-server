import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as resellerApi from '@/views/reseller/reseller.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import UsersTable from './UsersTable.vue'

vi.mock('@/views/reseller/reseller.api', () => ({
  listResellerUsers: vi.fn(),
  listResellerUserInstances: vi.fn(),
  deleteResellerUser: vi.fn(),
}))

function deferred<T> () {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const USERS = [
  { id: 1, name: 'Bob', email: 'zed@example.com', instances_count: 3 },
  { id: 2, name: 'carol@example.com', email: 'carol@example.com', instances_count: 12 },
  { id: 3, name: 'Alice', email: 'alice@work.io', instances_count: 0 },
]

async function mountTable () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(UsersTable, { global: { plugins: [pinia] } })
  return { wrapper, alerts: useAlertsStore() }
}

function rowNames (wrapper: Awaited<ReturnType<typeof mountTable>>['wrapper']): string[] {
  return wrapper.findAll('tbody tr').map(row => row.findAll('td')[0]?.text() ?? '')
}

describe('UsersTable', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(resellerApi.listResellerUserInstances).mockResolvedValue([])
  })

  it('shows the skeleton while the users load and the rows after', async () => {
    const pending = deferred<typeof USERS>()
    vi.mocked(resellerApi.listResellerUsers).mockReturnValue(pending.promise)
    const { wrapper } = await mountTable()

    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(true)
    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)

    pending.resolve(USERS)
    await flushPromises()

    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(false)
    expect(rowNames(wrapper)).toHaveLength(3)
    expect(wrapper.text()).toContain('zed@example.com')
  })

  // Characterization of the card markup: the DOM of a row stays as it was written by hand.
  it('renders the mobile card of a user with the legacy markup', async () => {
    const width = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 900 })
    try {
      vi.mocked(resellerApi.listResellerUsers).mockResolvedValue(USERS)
      const { wrapper } = await mountTable()
      await flushPromises()

      expect(normalizeHtml(wrapper.findAll('tbody tr')[0]!.html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.user</div><div class="mobile-table-item__value"><div><div class="d-flex align-center"><div class="mr-2"><div class="v-avatar v-theme--light v-avatar--density-default v-avatar--variant-flat user-avatar" style="width: 28px; height: 28px;" min-width="28"><div class="v-responsive v-img v-img--booting" style="height: 28px; width: 28px;"><div class="v-responsive__sizer"></div><transition-stub name="fade-transition" appear="true" persisted="false" css="true"><img class="v-img__img v-img__img--cover" src="//www.gravatar.com/avatar/cb6affc08c7166d6bbdc60cd424d4aa1.jpg?d=robohash&amp;s=28" style="display: none;"></transition-stub><transition-stub name="fade-transition" appear="false" persisted="false" css="true"></transition-stub></div><span class="v-avatar__underlay"></span></div><div class="v-badge v-badge--bordered v-badge--dot user-dot-badge"><div class="v-badge__wrapper"><transition-stub name="scale-rotate-transition" appear="false" persisted="false" css="true"><span class="v-badge__badge v-theme--light" style="top: calc(100% - 8px); left: 50%; transform: translateX(-50%); display: none;" aria-atomic="true" aria-label="Badge" aria-live="polite" role="status"></span></transition-stub></div></div></div><span>Alice</span></div></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.email</div><div class="mobile-table-item__value"><div>alice@work.io</div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.instances</div><div class="mobile-table-item__value"><div><div><div aria-haspopup="menu" aria-expanded="false" aria-owns="v-menu-v-3"><span class="v-chip v-chip--label v-theme--light v-chip--density-default v-chip--size-default v-chip--variant-flat label-purple" draggable="false"><span class="v-chip__underlay"></span><div class="v-chip__content" data-no-activator="">0</div></span></div></div></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"><div class=""><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text reseller-user-delete" aria-label="button.deleteUser" data-testid="reseller-user-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div></div></div></div></div></td></tr>"`)
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
    }
  })

  it('sorts by name ascending by default and shows "not set" when the name equals the email', async () => {
    vi.mocked(resellerApi.listResellerUsers).mockResolvedValue(USERS)
    const { wrapper } = await mountTable()
    await flushPromises()

    expect(rowNames(wrapper)).toEqual(['Alice', 'Bob', 'general.notSet'])
    expect(wrapper.get('.not-set.font-italic').text()).toBe('general.notSet')
  })

  it('flips the direction on the same column and keeps it when another column is chosen', async () => {
    vi.mocked(resellerApi.listResellerUsers).mockResolvedValue(USERS)
    const { wrapper } = await mountTable()
    await flushPromises()

    const items = wrapper.findAll('.custom-sort__item')
    await items[0]!.trigger('click')
    expect(rowNames(wrapper)).toEqual(['general.notSet', 'Bob', 'Alice'])

    await items[1]!.trigger('click')
    await flushPromises()
    // Descending kept, now by email: zed (Bob), carol, alice.
    expect(rowNames(wrapper)).toEqual(['Bob', 'general.notSet', 'Alice'])

    await items[1]!.trigger('click')
    await flushPromises()
    expect(rowNames(wrapper)).toEqual(['Alice', 'general.notSet', 'Bob'])
  })

  it('filters by email and by the instances count', async () => {
    vi.mocked(resellerApi.listResellerUsers).mockResolvedValue(USERS)
    const { wrapper } = await mountTable()
    await flushPromises()

    const controls = wrapper.getComponent({ name: 'DataIteratorFilterControls' })
    controls.vm.$emit('update:searchTerm', 'work.io')
    await flushPromises()
    expect(rowNames(wrapper)).toEqual(['Alice'])

    controls.vm.$emit('update:searchTerm', '12')
    await flushPromises()
    expect(rowNames(wrapper)).toEqual(['general.notSet'])
  })

  it('shows the empty state without a search and the no-results container with one, which clears the search', async () => {
    vi.mocked(resellerApi.listResellerUsers).mockResolvedValue([])
    const { wrapper } = await mountTable()
    await flushPromises()

    expect(wrapper.get('[data-testid="reseller-users-empty"]').text()).toContain('reseller.logs.noLogs')
    expect(wrapper.text()).toContain('reseller.logs.noLogsDesc')

    const controls = wrapper.getComponent({ name: 'DataIteratorFilterControls' })
    controls.vm.$emit('update:searchTerm', 'zzz')
    await flushPromises()
    expect(wrapper.find('[data-testid="reseller-users-empty"]').exists()).toBe(false)
    const noResults = wrapper.getComponent({ name: 'DataIteratorNoResultsContainer' })

    noResults.vm.$emit('clearAllFilters')
    await flushPromises()
    expect(wrapper.find('[data-testid="reseller-users-empty"]').exists()).toBe(true)
  })

  it('alerts when the GET fails and leaves the empty state', async () => {
    vi.mocked(resellerApi.listResellerUsers).mockRejectedValue(new Error('boom'))
    const { wrapper, alerts } = await mountTable()
    await flushPromises()

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(wrapper.find('[data-testid="reseller-users-empty"]').exists()).toBe(true)
  })

  it('shows the delete button with a tooltip text, opens the modal for that user and drops the row after the DELETE', async () => {
    vi.mocked(resellerApi.listResellerUsers).mockResolvedValue(USERS)
    vi.mocked(resellerApi.deleteResellerUser).mockResolvedValue({ id: 1 })
    const { wrapper } = await mountTable()
    await flushPromises()

    const buttons = wrapper.findAll('[data-testid="reseller-user-delete"]')
    expect(buttons).toHaveLength(3)
    expect(buttons[0]!.attributes('aria-label')).toBe('button.deleteUser')
    expect(wrapper.find('.actions-row').exists()).toBe(true)

    // Sorted by name: Alice, Bob, carol. Bob is the second row.
    await buttons[1]!.trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('heading.instance.advanced.users.modal.delete.message')

    document.querySelector<HTMLInputElement>('.basic-modal input[type="checkbox"]')!.click()
    await flushPromises()
    document.querySelector<HTMLButtonElement>('[data-testid="reseller-user-delete-submit"]')!.click()
    await flushPromises()

    expect(resellerApi.deleteResellerUser).toHaveBeenCalledWith(1)
    expect(rowNames(wrapper)).toEqual(['Alice', 'general.notSet'])
    wrapper.unmount()
  })
})

// Characterization before the move to the kit data table: behavior only.
describe('UsersTable paging (kit-data-table-account-reseller)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(resellerApi.listResellerUserInstances).mockResolvedValue([])
  })

  it('has no footer', async () => {
    vi.mocked(resellerApi.listResellerUsers).mockResolvedValue(USERS)
    const { wrapper } = await mountTable()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'DataIteratorFooter' }).exists()).toBe(false)
  })

  it('shows every user on one page', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `User ${i + 1}`, email: `user${i + 1}@example.com`, instances_count: 0 }))
    vi.mocked(resellerApi.listResellerUsers).mockResolvedValue(many)
    const { wrapper } = await mountTable()
    await flushPromises()

    expect(wrapper.findAll('tbody tr')).toHaveLength(25)
  })
})
