import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as resellerApi from '@/views/reseller/reseller.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import LogsTable from './LogsTable.vue'

vi.mock('@/views/reseller/reseller.api', () => ({
  listResellerInstancesLogs: vi.fn(),
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

const EMPTY = { items: [], total: 0 }

async function mountTable () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(LogsTable, { global: { plugins: [pinia] } })
  return { wrapper, alerts: useAlertsStore() }
}

async function search (wrapper: Awaited<ReturnType<typeof mountTable>>['wrapper'], value: string) {
  wrapper.getComponent({ name: 'DataIteratorFilterControls' }).vm.$emit('update:searchTerm', value)
  await flushPromises()
}

describe('reseller LogsTable (frame)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('loads once on mount with page 1, 50 per page and date desc', async () => {
    vi.mocked(resellerApi.listResellerInstancesLogs).mockResolvedValue(EMPTY)
    const { wrapper } = await mountTable()
    await flushPromises()

    expect(resellerApi.listResellerInstancesLogs).toHaveBeenCalledTimes(1)
    expect(resellerApi.listResellerInstancesLogs).toHaveBeenCalledWith({
      page: 1,
      perPage: 50,
      sortBy: 'date',
      sortDir: 'desc',
      searchTerm: '',
    })
    expect(wrapper.get('[data-testid="reseller-logs-title"]').text()).toBe('heading.reseller.page.logs')
  })

  it('shows the skeleton while the logs load', async () => {
    const pending = deferred<typeof EMPTY>()
    vi.mocked(resellerApi.listResellerInstancesLogs).mockReturnValue(pending.promise)
    const { wrapper } = await mountTable()

    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(true)

    pending.resolve(EMPTY)
    await flushPromises()

    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(false)
  })

  it('does not show the empty state next to the skeleton while the logs load', async () => {
    const pending = deferred<typeof EMPTY>()
    vi.mocked(resellerApi.listResellerInstancesLogs).mockReturnValue(pending.promise)
    const { wrapper } = await mountTable()

    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(true)
    expect(wrapper.find('[data-testid="reseller-logs-empty"]').exists()).toBe(false)

    pending.resolve(EMPTY)
    await flushPromises()

    expect(wrapper.find('[data-testid="reseller-logs-empty"]').exists()).toBe(true)
  })

  it('shows the empty state with the reseller.logs keys for an empty answer without a term', async () => {
    vi.mocked(resellerApi.listResellerInstancesLogs).mockResolvedValue(EMPTY)
    const { wrapper } = await mountTable()
    await flushPromises()

    const empty = wrapper.get('[data-testid="reseller-logs-empty"]')
    expect(empty.text()).toContain('reseller.logs.noLogs')
    expect(empty.text()).toContain('reseller.logs.noLogsDesc')
  })

  it('shows no results for a term and reloads from page 1 without the term on clear filters', async () => {
    vi.mocked(resellerApi.listResellerInstancesLogs).mockResolvedValue(EMPTY)
    const { wrapper } = await mountTable()
    await flushPromises()

    await search(wrapper, 'zzz')

    expect(resellerApi.listResellerInstancesLogs).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, searchTerm: 'zzz' }))
    expect(wrapper.find('[data-testid="reseller-logs-empty"]').exists()).toBe(false)

    wrapper.getComponent({ name: 'DataIteratorNoResultsContainer' }).vm.$emit('clearAllFilters')
    await flushPromises()

    expect(resellerApi.listResellerInstancesLogs).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, searchTerm: '' }))
    expect(wrapper.find('[data-testid="reseller-logs-empty"]').exists()).toBe(true)
  })

  it('alerts on an error', async () => {
    vi.mocked(resellerApi.listResellerInstancesLogs).mockRejectedValue(new Error('boom'))
    const { alerts } = await mountTable()
    await flushPromises()

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(alerts.activeAlerts[0]).toMatchObject({ success: false })
  })

  it('ignores an older response that arrives after a newer one', async () => {
    const first = deferred<Awaited<ReturnType<typeof resellerApi.listResellerInstancesLogs>>>()
    const second = deferred<typeof EMPTY>()
    vi.mocked(resellerApi.listResellerInstancesLogs).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { wrapper } = await mountTable()

    await search(wrapper, 'abc')
    second.resolve(EMPTY)
    await flushPromises()
    expect(wrapper.findComponent({ name: 'DataIteratorNoResultsContainer' }).exists()).toBe(true)

    first.resolve({ items: [{ id: 1 } as resellerApi.ResellerLogRow], total: 1 })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'DataIteratorNoResultsContainer' }).exists()).toBe(true)
  })

  it('ignores an older error that arrives after a newer response', async () => {
    const first = deferred<typeof EMPTY>()
    const second = deferred<typeof EMPTY>()
    vi.mocked(resellerApi.listResellerInstancesLogs).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { wrapper, alerts } = await mountTable()

    await search(wrapper, 'abc')
    expect(resellerApi.listResellerInstancesLogs).toHaveBeenCalledTimes(2)

    second.resolve(EMPTY)
    await flushPromises()
    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(false)

    first.reject(new Error('stale'))
    await flushPromises()
    expect(alerts.activeAlerts).toHaveLength(0)
    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(false)
  })
})

const DESKTOP_WIDTH = window.innerWidth
const MOBILE_WIDTH = 900

function setWidth (width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
}

const LOGS = [
  {
    id: 1,
    user: { email: 'jan@example.com', first_name: 'Jan', last_name: 'Kowalski', role: null },
    action: 'user.instance.plugin.install',
    request_method: 'POST',
    payload: { 'App\\Models\\Application:12': { name: 'My blog', url: 'https://blog.example.com' } },
    date: '2026-03-05 14:07:00',
  },
  {
    id: 2,
    user: { email: 'ewa@example.com', first_name: 'Ewa', last_name: 'Nowak', role: null },
    action: 'user.instance.plugin.install',
    request_method: 'POST',
    payload: { 'App\\Models\\Application:13': { name: 'Shop', url: 'https://shop.example.com' } },
    date: '2026-03-04 10:00:00',
  },
] as resellerApi.ResellerLogRow[]

const HEADER_KEYS = ['table.header.user', 'table.header.instance', 'table.header.actions', 'table.header.date']

describe('reseller LogsTable (rows)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setWidth(DESKTOP_WIDTH)
  })

  afterEach(() => {
    setWidth(DESKTOP_WIDTH)
  })

  it('renders a row per log with user, instance link, action and date cells on desktop', async () => {
    vi.mocked(resellerApi.listResellerInstancesLogs).mockResolvedValue({ items: LOGS, total: 2 })
    const { wrapper } = await mountTable()
    await flushPromises()

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.findAll('td')).toHaveLength(4)
    expect(rows[0]!.findAll('td').every(cell => cell.classes('v-data-table-column--align-start'))).toBe(true)
    expect(rows[0]!.text()).toContain('Jan Kowalski')
    expect(rows[0]!.get('a.logs-table__instance').attributes('href')).toBe('https://blog.example.com')
    expect(rows[1]!.get('a.logs-table__instance').text()).toBe('Shop')
    expect(rows[0]!.find('.actions-row').exists()).toBe(true)
  })

  it('shows the four header keys on desktop only when rows are loaded', async () => {
    const pending = deferred<{ items: resellerApi.ResellerLogRow[], total: number }>()
    vi.mocked(resellerApi.listResellerInstancesLogs).mockReturnValue(pending.promise)
    const { wrapper } = await mountTable()

    expect(wrapper.find('.custom-sort').exists()).toBe(false)

    pending.resolve({ items: LOGS, total: 2 })
    await flushPromises()

    const header = wrapper.get('.custom-sort')
    for (const key of HEADER_KEYS) {
      expect(header.text()).toContain(key)
    }
  })

  it('shows no header row for an empty answer', async () => {
    vi.mocked(resellerApi.listResellerInstancesLogs).mockResolvedValue(EMPTY)
    const { wrapper } = await mountTable()
    await flushPromises()

    expect(wrapper.find('.custom-sort').exists()).toBe(false)
  })

  it('reloads page 1 ascending when the date header is clicked', async () => {
    vi.mocked(resellerApi.listResellerInstancesLogs).mockResolvedValue({ items: LOGS, total: 2 })
    const { wrapper } = await mountTable()
    await flushPromises()

    await wrapper.get('.item--date .custom-sort__item').trigger('click')
    await flushPromises()

    expect(resellerApi.listResellerInstancesLogs).toHaveBeenCalledTimes(2)
    expect(resellerApi.listResellerInstancesLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, sortBy: 'date', sortDir: 'asc' }),
    )
  })

  it('does not sort by a column other than the date', async () => {
    vi.mocked(resellerApi.listResellerInstancesLogs).mockResolvedValue({ items: LOGS, total: 2 })
    const { wrapper } = await mountTable()
    await flushPromises()

    await wrapper.get('.item--user .custom-sort__item').trigger('click')
    await flushPromises()

    expect(resellerApi.listResellerInstancesLogs).toHaveBeenCalledTimes(1)
  })

  it('renders header: value pairs instead of the header row on mobile', async () => {
    setWidth(MOBILE_WIDTH)
    vi.mocked(resellerApi.listResellerInstancesLogs).mockResolvedValue({ items: LOGS, total: 2 })
    const { wrapper } = await mountTable()
    await flushPromises()

    expect(wrapper.find('.custom-sort').exists()).toBe(false)

    const first = wrapper.findAll('tbody tr')[0]!
    expect(first.get('td').classes()).toContain('w-100')
    const pairs = first.findAll('.mobile-table-item__row')
    expect(pairs.map(pair => pair.get('.mobile-table-item__header').text())).toEqual(HEADER_KEYS)
    expect(pairs[0]!.get('.mobile-table-item__value').text()).toContain('Jan Kowalski')
    expect(pairs[1]!.get('.mobile-table-item__value a').text()).toBe('My blog')
    expect(first.find('.actions-row').exists()).toBe(false)
  })

  // Characterization of the card markup: the DOM of a row stays as it was written by hand.
  it('renders the mobile card of a log with the legacy markup', async () => {
    setWidth(MOBILE_WIDTH)
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-03-05T15:00:00') })
    try {
      vi.mocked(resellerApi.listResellerInstancesLogs).mockResolvedValue({ items: LOGS, total: 2 })
      const { wrapper } = await mountTable()
      await flushPromises()

      expect(normalizeHtml(wrapper.findAll('tbody tr')[0]!.html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.user</div><div class="mobile-table-item__value"><div><div class="d-flex align-center user-item"><div class="mr-2"><div class="v-avatar v-theme--light v-avatar--density-default v-avatar--variant-flat user-avatar" style="width: 28px; height: 28px;" min-width="28"><div class="v-responsive v-img v-img--booting" style="height: 28px; width: 28px;"><div class="v-responsive__sizer"></div><transition-stub name="fade-transition" appear="true" persisted="false" css="true"><img class="v-img__img v-img__img--cover" src="//www.gravatar.com/avatar/91f404578a2d58d0d4a9065d16c5a051.jpg?d=robohash&amp;s=28" style="display: none;"></transition-stub><transition-stub name="fade-transition" appear="false" persisted="false" css="true"></transition-stub></div><span class="v-avatar__underlay"></span></div><div class="v-badge v-badge--bordered v-badge--dot user-dot-badge"><div class="v-badge__wrapper"><transition-stub name="scale-rotate-transition" appear="false" persisted="false" css="true"><span class="v-badge__badge v-theme--light" style="top: calc(100% - 8px); left: 50%; transform: translateX(-50%); display: none;" aria-atomic="true" aria-label="Badge" aria-live="polite" role="status"></span></transition-stub></div></div></div><span class="font-weight-bold user-item__name">Jan Kowalski</span><span class="v-chip v-theme--light v-chip--density-default v-chip--size-small v-chip--variant-flat ml-2 font-weight-bold user-item__role" draggable="false"><span class="v-chip__underlay"></span><div class="v-chip__content" data-no-activator="">general.owner</div></span></div></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.instance</div><div class="mobile-table-item__value"><div><a class="logs-table__instance text-truncate" href="https://blog.example.com" target="_blank">My blog</a></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"><div><div class="logs-table__log-item d-flex flex-wrap"><span class="v-chip v-chip--label v-theme--light v-chip--density-default v-chip--size-small v-chip--variant-flat action-name action-name--post mr-2 mb-1" draggable="false"><span class="v-chip__underlay"></span><div class="v-chip__content" data-no-activator="">User Instance Plugin Install</div></span><span class="p-4 information log-item__information d-flex flex-wrap align-start"></span></div></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.date</div><div class="mobile-table-item__value"><div class=""><span class="mb-0 text-right text--gray-darken1">an hour ago</span></div></div></div></div></div></td></tr>"`)
    } finally {
      vi.useRealTimers()
    }
  })

  it('hides the header row while loading', async () => {
    const pending = deferred<typeof EMPTY>()
    vi.mocked(resellerApi.listResellerInstancesLogs)
      .mockResolvedValueOnce({ items: LOGS, total: 2 })
      .mockReturnValueOnce(pending.promise)
    const { wrapper } = await mountTable()
    await flushPromises()
    expect(wrapper.find('.custom-sort').exists()).toBe(true)

    await search(wrapper, 'abc')

    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(true)
    expect(wrapper.find('.custom-sort').exists()).toBe(false)
  })
})

describe('reseller LogsTable (footer)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setWidth(DESKTOP_WIDTH)
  })

  it('shows the footer with the log label even for one page at 10 per page', async () => {
    vi.mocked(resellerApi.listResellerInstancesLogs).mockResolvedValue({ items: LOGS, total: 2 })
    const { wrapper } = await mountTable()
    await flushPromises()

    const footer = wrapper.getComponent({ name: 'DataIteratorFooter' })
    await footer.vm.$emit('update:itemsPerPage', 10)
    await flushPromises()

    expect(wrapper.find('.data-iterator-footer').exists()).toBe(true)
    expect(wrapper.get('.data-iterator-page-number span').text()).toBe('table.footer.log')
  })

  it('shows no footer without rows', async () => {
    vi.mocked(resellerApi.listResellerInstancesLogs).mockResolvedValue(EMPTY)
    const { wrapper } = await mountTable()
    await flushPromises()

    expect(wrapper.find('.data-iterator-footer').exists()).toBe(false)
  })

  it('loads once with the new page when the page changes', async () => {
    vi.mocked(resellerApi.listResellerInstancesLogs).mockResolvedValue({ items: LOGS, total: 120 })
    const { wrapper } = await mountTable()
    await flushPromises()

    await wrapper.findAll('.v-pagination__item button')[1]!.trigger('click')
    await flushPromises()

    expect(resellerApi.listResellerInstancesLogs).toHaveBeenCalledTimes(2)
    expect(resellerApi.listResellerInstancesLogs).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, perPage: 50 }))
  })

  it('loads once from page 1 with the new size and marks it active when the per-page changes', async () => {
    vi.mocked(resellerApi.listResellerInstancesLogs).mockResolvedValue({ items: LOGS, total: 120 })
    const { wrapper } = await mountTable()
    await flushPromises()

    await wrapper.findAll('.v-pagination__item button')[1]!.trigger('click')
    await flushPromises()
    const buttons = wrapper.findAll('.data-iterator-page-number button')
    expect(buttons.map(b => b.text())).toEqual(['10', '20', '50', '75', '100'])
    await buttons[0]!.trigger('click')
    await flushPromises()

    expect(resellerApi.listResellerInstancesLogs).toHaveBeenCalledTimes(3)
    expect(resellerApi.listResellerInstancesLogs).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, perPage: 10 }))
    expect(wrapper.findAll('.data-iterator-page-number button')[0]!.classes()).toContain('active')
  })
})
