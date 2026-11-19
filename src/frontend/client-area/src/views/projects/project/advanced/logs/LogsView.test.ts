import type { DeployLogEntry } from '@/entities/project/instance-deploy-logs.api'
import type { InstanceLogRow, LogPage, WebserverLogFile } from '@/entities/project/instance-logs.api'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createInstancePrivilegeMethods } from '@/entities/privileges/instance-privilege-methods'
import { PRIVILEGES as P } from '@/entities/privileges/privileges'
import { downloadDeployLog, getDeployLog, getDeployLogsLive, listDeployLogs } from '@/entities/project/instance-deploy-logs.api'
import {
  getInstanceLogs,
  getPhpLogPage,
  getWebserverLogPage,
  getWebserverLogs,
  getWordPressLogs,
  isLogPageConflict,
  phpLogsDownloadUrl,
  webserverLogDownloadUrl,
  wordPressLogsDownloadUrl,
} from '@/entities/project/instance-logs.api'
import LogItem from '@/entities/project/ui/logs/LogItem.vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'
import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
import DataIteratorNoResultsContainer from '@/shared/ui/data-iterator/DataIteratorNoResultsContainer.vue'
import Loader from '@/shared/ui/loader/Loader.vue'
import LogsTableItemSkeletonMobile from '@/shared/ui/skeletons/LogsTableItemSkeletonMobile.vue'
import LogsTableSkeletonItem from '@/shared/ui/skeletons/LogsTableSkeletonItem.vue'
import LogsTableSortSkeleton from '@/shared/ui/skeletons/LogsTableSortSkeleton.vue'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import DeployLogsTab from './DeployLogsTab.vue'
import LogLinesTable from './LogLinesTable.vue'
import LogsNoData from './LogsNoData.vue'
import LogsTable from './LogsTable.vue'
import LogsView from './LogsView.vue'

vi.mock('@/entities/project/instance-logs.api', () => ({
  getInstanceLogs: vi.fn(),
  getWordPressLogs: vi.fn(),
  getPhpLogPage: vi.fn(),
  getWebserverLogs: vi.fn(),
  getWebserverLogPage: vi.fn(),
  isLogPageConflict: vi.fn(),
  wordPressLogsDownloadUrl: vi.fn(),
  phpLogsDownloadUrl: vi.fn(),
  webserverLogDownloadUrl: vi.fn(),
}))
vi.mock('@/entities/project/instance-deploy-logs.api', () => ({
  listDeployLogs: vi.fn(),
  getDeployLog: vi.fn(),
  getDeployLogsLive: vi.fn(),
  cancelDeploy: vi.fn(),
  downloadDeployLog: vi.fn(),
}))
vi.mock('@/shared/realtime/echo-client', () => ({ echoClient: { connection: null } }))

const DESKTOP_WIDTH = 1400
const MOBILE_WIDTH = 900

function setWidth (width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
}

function logRow (overrides: Partial<InstanceLogRow> = {}): InstanceLogRow {
  return {
    user: { email: 'jan@example.com', first_name: 'Jan', last_name: 'Kowalski', role: null },
    action: 'label',
    request_method: 'POST',
    payload: null,
    date: 1_700_000_000_000,
    ...overrides,
  }
}

// The privilege methods are the real ones, read through `this.privileges` as on the resource.
function makeInstance (type: string | null, privileges: string[], isContainer = true): InstanceResource {
  return {
    id: 9,
    type,
    isContainer,
    ...createInstancePrivilegeMethods(type),
    privileges,
  } as unknown as InstanceResource
}

async function mountView (instance: InstanceResource) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(LogsView, { props: { instance }, global: { plugins: [pinia] } })
  await flushPromises()
  return wrapper
}

// A page of the webserver error log: one line in the PHP-style format the parser reads as a message.
function pageOf (text: string, page: number, pages: number, size: number): LogPage {
  return { lines: [text], page, pages, size }
}

function deferred<T> () {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function tabLabels (wrapper: Awaited<ReturnType<typeof mountView>>): string[] {
  return wrapper.findAll('.v-tab').map(tab => tab.text())
}

describe('LogsView frame', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getInstanceLogs).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(getWebserverLogs).mockResolvedValue([])
    setWidth(DESKTOP_WIDTH)
  })

  it('shows every tab in legacy order when all privileges are granted', async () => {
    const wrapper = await mountView(makeInstance('custom', [
      P.VIEW_LOGS,
      P.WORDPRESS_VIEW_LOGS,
      P.VIEW_PHP_LOGS,
      P.VIEW_WEBSERVER_LOGS,
    ]))

    const labels = tabLabels(wrapper)
    expect(labels).toHaveLength(5)
    expect(labels[0]).toContain('heading.instance.advanced.logs.instanceLogs.title')
    expect(labels[1]).toContain('deployLogs.title')
    expect(labels[2]).toContain('heading.instance.advanced.logs.wordpressLogs.title')
    expect(labels[3]).toContain('heading.instance.advanced.logs.phpLogs.title')
    expect(labels[4]).toContain('heading.instance.advanced.logs.webserverLogs.title')
    expect(wrapper.findAll('.v-window-item')).toHaveLength(5)
  })

  it('shows the Logs heading with the tab strip in the second row, as the other Advanced pages', async () => {
    const wrapper = await mountView(makeInstance('custom', [P.VIEW_LOGS]))

    expect(wrapper.get('[data-testid="logs-title"]').text()).toBe('heading.instance.advanced.logs.title')
    expect(wrapper.find('.page-title__title-box .v-tabs').exists()).toBe(false)
    expect(wrapper.find('.page-title__tabs .v-tabs').exists()).toBe(true)
  })

  it('shows no tabs and no window without log privileges', async () => {
    const wrapper = await mountView(makeInstance('wordpress', []))

    expect(wrapper.find('.v-tabs').exists()).toBe(false)
    expect(wrapper.find('.v-window').exists()).toBe(false)
    expect(wrapper.findAll('.v-tab')).toHaveLength(0)
  })

  it('shows only the wordpress tab for the wordpress privilege alone', async () => {
    const wrapper = await mountView(makeInstance('wordpress', [P.WORDPRESS_VIEW_LOGS]))

    const labels = tabLabels(wrapper)
    expect(labels).toHaveLength(1)
    expect(labels[0]).toContain('heading.instance.advanced.logs.wordpressLogs.title')
  })

  it('shows the deploy tab for a custom instance with view_logs', async () => {
    const wrapper = await mountView(makeInstance('custom', [P.VIEW_LOGS]))

    const labels = tabLabels(wrapper)
    expect(labels).toHaveLength(2)
    expect(labels[1]).toContain('deployLogs.title')
  })

  it('hides the deploy tab for a wordpress instance with view_logs', async () => {
    const wrapper = await mountView(makeInstance('wordpress', [P.VIEW_LOGS]))

    const labels = tabLabels(wrapper)
    expect(labels).toHaveLength(1)
    expect(labels[0]).toContain('heading.instance.advanced.logs.instanceLogs.title')
  })

  it('hides the deploy tab and loads no deploy logs for a classic PHP hosting project', async () => {
    // A PHP hosting project is `custom` too, but the panel has no deploy log for it (422).
    const wrapper = await mountView(makeInstance('custom', [P.VIEW_LOGS, P.VIEW_PHP_LOGS], false))

    const labels = tabLabels(wrapper)
    expect(labels).toHaveLength(2)
    expect(labels[1]).toContain('heading.instance.advanced.logs.phpLogs.title')
    expect(listDeployLogs).not.toHaveBeenCalled()
  })

  it('puts the php info tooltip on the php tab only', async () => {
    const wrapper = await mountView(makeInstance('wordpress', [P.VIEW_PHP_LOGS, P.VIEW_WEBSERVER_LOGS]))

    const labels = tabLabels(wrapper)
    expect(labels).toHaveLength(2)
    const [phpTab, webserverTab] = wrapper.findAll('.v-tab')
    expect(phpTab!.find('.v-icon').exists()).toBe(true)
    expect(webserverTab!.find('.v-icon').exists()).toBe(false)
    expect(labels[0]).toContain('heading.instance.advanced.logs.phpLogs.title')
    expect(labels[1]).toContain('heading.instance.advanced.logs.webserverLogs.title')
    expect(labels[1]).not.toContain('phpLogs.tooltip')
  })
})

describe('LogsView instance tab', () => {
  const ALL_LOGS = [P.VIEW_LOGS]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getInstanceLogs).mockResolvedValue({ items: [], total: 0 })
    setWidth(DESKTOP_WIDTH)
  })

  function lastRequest () {
    return vi.mocked(getInstanceLogs).mock.calls.at(-1)
  }

  it('requests the first page with the legacy defaults on mount', async () => {
    await mountView(makeInstance('wordpress', ALL_LOGS))

    expect(getInstanceLogs).toHaveBeenCalledTimes(1)
    expect(getInstanceLogs).toHaveBeenCalledWith(9, { page: 1, perPage: 10, sortBy: 'date', sortDir: 'desc', searchTerm: '' })
  })

  it('does not request logs when the instance tab is not available', async () => {
    await mountView(makeInstance('wordpress', [P.WORDPRESS_VIEW_LOGS]))

    expect(getInstanceLogs).not.toHaveBeenCalled()
  })

  it('reloads the chosen page', async () => {
    const wrapper = await mountView(makeInstance('wordpress', ALL_LOGS))

    wrapper.findComponent(LogsTable).vm.$emit('update:page', 2)
    await flushPromises()

    expect(getInstanceLogs).toHaveBeenLastCalledWith(9, { page: 2, perPage: 10, sortBy: 'date', sortDir: 'desc', searchTerm: '' })
  })

  it('keeps the newest page when an earlier request answers last', async () => {
    const wrapper = await mountView(makeInstance('wordpress', ALL_LOGS))
    const slow = deferred<{ items: InstanceLogRow[], total: number }>()
    vi.mocked(getInstanceLogs)
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce({ items: [logRow({ action: 'newest' })], total: 30 })

    wrapper.findComponent(LogsTable).vm.$emit('update:page', 2)
    await flushPromises()
    wrapper.findComponent(LogsTable).vm.$emit('update:page', 3)
    await flushPromises()
    slow.resolve({ items: [logRow({ action: 'stale' })], total: 20 })
    await flushPromises()

    const table = wrapper.findComponent(LogsTable)
    expect(table.props('items')).toEqual([logRow({ action: 'newest' })])
    expect(table.props('itemsTotal')).toBe(30)
    expect(table.props('itemsLoading')).toBe(false)
  })

  it('goes back to page 1 when the page size changes', async () => {
    const wrapper = await mountView(makeInstance('wordpress', ALL_LOGS))
    wrapper.findComponent(LogsTable).vm.$emit('update:page', 3)
    await flushPromises()

    wrapper.findComponent(LogsTable).vm.$emit('update:items-per-page', 20)
    await flushPromises()

    expect(lastRequest()?.[1]).toEqual({ page: 1, perPage: 20, sortBy: 'date', sortDir: 'desc', searchTerm: '' })
  })

  it('goes back to page 1 and sends the term when the search changes', async () => {
    const wrapper = await mountView(makeInstance('wordpress', ALL_LOGS))
    wrapper.findComponent(LogsTable).vm.$emit('update:page', 3)
    await flushPromises()

    wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:search-term', 'cron')
    await flushPromises()

    expect(lastRequest()?.[1]).toEqual({ page: 1, perPage: 10, sortBy: 'date', sortDir: 'desc', searchTerm: 'cron' })
  })

  it('clears the search from the no-results state and reloads without a term', async () => {
    const wrapper = await mountView(makeInstance('wordpress', ALL_LOGS))
    wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:search-term', 'nothing')
    await flushPromises()

    wrapper.findComponent(DataIteratorNoResultsContainer).vm.$emit('clear-all-filters')
    await flushPromises()

    expect(lastRequest()?.[1]).toEqual({ page: 1, perPage: 10, sortBy: 'date', sortDir: 'desc', searchTerm: '' })
    expect(wrapper.findComponent(DataIteratorFilterControls).props('searchTerm')).toBe('')
    expect(wrapper.findComponent(DataIteratorNoResultsContainer).exists()).toBe(false)
  })

  it('renders the desktop header and rows from 1400 px', async () => {
    vi.mocked(getInstanceLogs).mockResolvedValue({ items: [logRow(), logRow({ action: 'other' })], total: 2 })

    const wrapper = await mountView(makeInstance('wordpress', ALL_LOGS))

    expect(wrapper.find('.custom-sort').exists()).toBe(true)
    expect(wrapper.find('.mobile-table-item').exists()).toBe(false)
    expect(wrapper.findAllComponents(LogItem)).toHaveLength(2)
  })

  it('renders the mobile item rows below 1400 px', async () => {
    setWidth(MOBILE_WIDTH)
    vi.mocked(getInstanceLogs).mockResolvedValue({ items: [logRow(), logRow({ action: 'other' })], total: 2 })

    const wrapper = await mountView(makeInstance('wordpress', ALL_LOGS))

    expect(wrapper.find('.custom-sort').exists()).toBe(false)
    expect(wrapper.findAll('.mobile-table-item')).toHaveLength(2)
  })

  // Characterization of the card markup: the DOM of a row stays as it was written by hand.
  it('renders the mobile card of a log with the legacy markup', async () => {
    setWidth(MOBILE_WIDTH)
    vi.mocked(getInstanceLogs).mockResolvedValue({ items: [logRow()], total: 1 })

    const wrapper = await mountView(makeInstance('wordpress', ALL_LOGS))

    expect(normalizeHtml(wrapper.get('tbody tr').html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__value"><div class="d-flex align-center justify-space-between"><div class="d-flex align-center user-item"><div class="mr-2"><div class="v-avatar v-theme--light v-avatar--density-default v-avatar--variant-flat user-avatar" style="width: 28px; height: 28px;" min-width="28"><div class="v-responsive v-img v-img--booting" style="height: 28px; width: 28px;"><div class="v-responsive__sizer"></div><transition-stub name="fade-transition" appear="true" persisted="false" css="true"><img class="v-img__img v-img__img--cover" src="//www.gravatar.com/avatar/91f404578a2d58d0d4a9065d16c5a051.jpg?d=robohash&amp;s=28" style="display: none;"></transition-stub><transition-stub name="fade-transition" appear="false" persisted="false" css="true"></transition-stub></div><span class="v-avatar__underlay"></span></div><div class="v-badge v-badge--bordered v-badge--dot user-dot-badge"><div class="v-badge__wrapper"><transition-stub name="scale-rotate-transition" appear="false" persisted="false" css="true"><span class="v-badge__badge v-theme--light" style="top: calc(100% - 8px); left: 50%; transform: translateX(-50%); display: none;" aria-atomic="true" aria-label="Badge" aria-live="polite" role="status"></span></transition-stub></div></div></div><span class="font-weight-bold user-item__name">Jan Kowalski</span><span class="v-chip v-theme--light v-chip--density-default v-chip--size-small v-chip--variant-flat ml-2 font-weight-bold user-item__role" draggable="false"><span class="v-chip__underlay"></span><div class="v-chip__content" data-no-activator="">general.owner</div></span></div><span class="mb-0 text-right text--gray-darken1">3 years ago</span></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__value"><div class="logs-table__log-item d-flex flex-wrap"><span class="v-chip v-chip--label v-theme--light v-chip--density-default v-chip--size-small v-chip--variant-flat action-name action-name--post mr-2 mb-1" draggable="false"><span class="v-chip__underlay"></span><div class="v-chip__content" data-no-activator="">Label</div></span></div></div></div></div></div></td></tr>"`)
    wrapper.unmount()
  })

  it('shows the desktop skeleton while the logs load', async () => {
    setWidth(DESKTOP_WIDTH)
    vi.mocked(getInstanceLogs).mockReturnValue(new Promise(() => {}))

    const wrapper = await mountView(makeInstance('wordpress', ALL_LOGS))

    expect(wrapper.findComponent(LogsTableSortSkeleton).exists()).toBe(true)
    expect(wrapper.findComponent(LogsTableSkeletonItem).exists()).toBe(true)
    expect(wrapper.findAllComponents(LogsTableItemSkeletonMobile)).toHaveLength(0)
  })

  it('shows five mobile skeletons below 1200 px while the logs load', async () => {
    setWidth(MOBILE_WIDTH)
    vi.mocked(getInstanceLogs).mockReturnValue(new Promise(() => {}))

    const wrapper = await mountView(makeInstance('wordpress', ALL_LOGS))

    expect(wrapper.findAllComponents(LogsTableItemSkeletonMobile)).toHaveLength(5)
    expect(wrapper.findComponent(LogsTableSkeletonItem).exists()).toBe(false)
  })

  it('shows the error with Retry instead of the empty state when the GET fails, and Retry reloads', async () => {
    vi.mocked(getInstanceLogs).mockRejectedValueOnce(new Error('boom'))
    const pinia = createPinia()
    setActivePinia(pinia)
    const addAlert = vi.spyOn(useAlertsStore(pinia), 'addAlert')

    const wrapper = await mountKit(LogsView, { props: { instance: makeInstance('wordpress', ALL_LOGS) }, global: { plugins: [pinia] } })
    await flushPromises()

    expect(wrapper.find('[data-testid="instance-logs-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="instance-logs-empty"]').exists()).toBe(false)
    expect(addAlert).not.toHaveBeenCalled()

    vi.mocked(getInstanceLogs).mockResolvedValue({ items: [logRow()], total: 1 })
    await wrapper.get('[data-testid="instance-logs-retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="instance-logs-error"]').exists()).toBe(false)
    expect(wrapper.findComponent(LogsTable).exists()).toBe(true)
  })
})

describe('LogsView WordPress tab', () => {
  const WP_LOGS = [P.WORDPRESS_VIEW_LOGS]
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getInstanceLogs).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(getWordPressLogs).mockResolvedValue('wp line')
    vi.mocked(wordPressLogsDownloadUrl).mockReturnValue('https://api.test/instances/9/wordpress/logs/download')
    window.open = vi.fn()
    setWidth(DESKTOP_WIDTH)
  })

  function tabByLabel (wrapper: Awaited<ReturnType<typeof mountView>>, key: string) {
    return wrapper.findAll('.v-tab').find(tab => tab.text().includes(key))!
  }

  function downloadButton (wrapper: Awaited<ReturnType<typeof mountView>>) {
    return wrapper.findAll('button').find(button => button.text().includes('button.download'))!
  }

  it('loads WordPress once on mount when it is the first tab', async () => {
    const wrapper = await mountView(makeInstance('wordpress', [...WP_LOGS, P.VIEW_PHP_LOGS]))

    expect(getWordPressLogs).toHaveBeenCalledTimes(1)
    expect(getWordPressLogs).toHaveBeenCalledWith(9)
    expect(getPhpLogPage).not.toHaveBeenCalled()
    expect(getInstanceLogs).not.toHaveBeenCalled()
    expect(wrapper.find('pre').text()).toBe('wp line')
  })

  it('shows the table skeleton, not a spinner, while the WordPress log loads', async () => {
    const log = deferred<string>()
    vi.mocked(getWordPressLogs).mockReturnValue(log.promise)

    const wrapper = await mountView(makeInstance('wordpress', WP_LOGS))

    expect(wrapper.findComponent(LogLinesTable).props('loading')).toBe(true)
    expect(wrapper.find('pre').exists()).toBe(false)

    log.resolve('wp line')
    await flushPromises()

    expect(wrapper.findComponent(LogLinesTable).exists()).toBe(false)
    expect(wrapper.find('pre').text()).toBe('wp line')
  })

  it('does not load a text tab on mount when the instance tab is first', async () => {
    await mountView(makeInstance('wordpress', [P.VIEW_LOGS, ...WP_LOGS]))

    expect(getInstanceLogs).toHaveBeenCalledTimes(1)
    expect(getWordPressLogs).not.toHaveBeenCalled()
  })

  it('loads the tab on the first entry and not again when re-entered', async () => {
    const wrapper = await mountView(makeInstance('wordpress', [P.VIEW_LOGS, ...WP_LOGS]))
    expect(getWordPressLogs).not.toHaveBeenCalled()

    tabByLabel(wrapper, 'heading.instance.advanced.logs.wordpressLogs.title').trigger('click')
    await flushPromises()
    expect(getWordPressLogs).toHaveBeenCalledTimes(1)
    expect(wrapper.find('pre').text()).toBe('wp line')

    tabByLabel(wrapper, 'heading.instance.advanced.logs.instanceLogs.title').trigger('click')
    await flushPromises()
    tabByLabel(wrapper, 'heading.instance.advanced.logs.wordpressLogs.title').trigger('click')
    await flushPromises()

    expect(getWordPressLogs).toHaveBeenCalledTimes(1)
  })

  it('shows the WordPress empty state when the log is empty', async () => {
    vi.mocked(getWordPressLogs).mockResolvedValue(null)

    const wrapper = await mountView(makeInstance('wordpress', WP_LOGS))

    const noData = wrapper.findComponent(LogsNoData)
    expect(noData.props('title')).toBe('message.emptyTable.wpErrorLogs.title')
    expect(noData.props('description')).toBe('message.emptyTable.wpErrorLogs.description')
    expect(wrapper.find('pre').exists()).toBe(false)
  })

  it('opens the WordPress download in a new window', async () => {
    const wrapper = await mountView(makeInstance('wordpress', WP_LOGS))

    downloadButton(wrapper).trigger('click')
    await flushPromises()

    expect(wordPressLogsDownloadUrl).toHaveBeenCalledWith(9)
    expect(window.open).toHaveBeenCalledWith('https://api.test/instances/9/wordpress/logs/download', '_blank')
  })

  it('alerts with the error message when the WordPress log fails to load', async () => {
    const error = new Error('boom')
    vi.mocked(getWordPressLogs).mockRejectedValue(error)
    const pinia = createPinia()
    setActivePinia(pinia)
    const addAlert = vi.spyOn(useAlertsStore(pinia), 'addAlert')

    const wrapper = await mountKit(LogsView, { props: { instance: makeInstance('wordpress', WP_LOGS) }, global: { plugins: [pinia] } })
    await flushPromises()

    expect(addAlert).toHaveBeenCalledWith({ success: false, errorMessage: getErrorMessage(error) })
    expect(wrapper.findComponent(Loader).exists()).toBe(false)
  })
})

describe('LogsView PHP tab', () => {
  const PHP_LOGS = [P.VIEW_PHP_LOGS]
  const PHP_LINE = '[05-Nov-2026 10:00:00 UTC] PHP Warning:  first problem in /x.php on line 3'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getInstanceLogs).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(getPhpLogPage).mockResolvedValue(pageOf(PHP_LINE, 1, 3, 4096))
    vi.mocked(isLogPageConflict).mockImplementation(error => (error as { status?: number })?.status === 409)
    vi.mocked(phpLogsDownloadUrl).mockReturnValue('https://api.test/instances/9/php-logs/download')
    window.open = vi.fn()
    setWidth(DESKTOP_WIDTH)
  })

  function tabByLabel (wrapper: Awaited<ReturnType<typeof mountView>>, key: string) {
    return wrapper.findAll('.v-tab').find(tab => tab.text().includes(key))!
  }

  async function mountWithAlertSpy (instance: InstanceResource) {
    const pinia = createPinia()
    setActivePinia(pinia)
    const addAlert = vi.spyOn(useAlertsStore(pinia), 'addAlert')
    const wrapper = await mountKit(LogsView, { props: { instance }, global: { plugins: [pinia] } })
    await flushPromises()
    return { wrapper, addAlert }
  }

  it('loads page 1 without size once on mount when PHP is the first tab and shows it as a table', async () => {
    const wrapper = await mountView(makeInstance('wordpress', PHP_LOGS))

    expect(getPhpLogPage).toHaveBeenCalledTimes(1)
    expect(getPhpLogPage).toHaveBeenCalledWith(9, { page: 1, size: null })
    expect(getInstanceLogs).not.toHaveBeenCalled()
    expect(wrapper.find('pre').exists()).toBe(false)
    expect(wrapper.findComponent(LogLinesTable).props('kind')).toBe('php')
    expect(wrapper.findComponent(LogLinesTable).props('hasMore')).toBe(true)
    expect(wrapper.text()).toContain('first problem')
  })

  it('loads PHP on the first entry and not again when re-entered', async () => {
    const wrapper = await mountView(makeInstance('wordpress', [P.VIEW_LOGS, ...PHP_LOGS]))
    expect(getPhpLogPage).not.toHaveBeenCalled()

    tabByLabel(wrapper, 'heading.instance.advanced.logs.phpLogs.title').trigger('click')
    await flushPromises()
    tabByLabel(wrapper, 'heading.instance.advanced.logs.instanceLogs.title').trigger('click')
    await flushPromises()
    tabByLabel(wrapper, 'heading.instance.advanced.logs.phpLogs.title').trigger('click')
    await flushPromises()

    expect(getPhpLogPage).toHaveBeenCalledTimes(1)
  })

  it('asks page 2 with the size of page 1 and appends it after the loaded rows', async () => {
    const wrapper = await mountView(makeInstance('wordpress', PHP_LOGS))
    vi.mocked(getPhpLogPage).mockResolvedValueOnce(pageOf('PHP Notice:  older entry', 2, 3, 4096))

    wrapper.findComponent(LogLinesTable).vm.$emit('load-more')
    await flushPromises()

    expect(getPhpLogPage).toHaveBeenLastCalledWith(9, { page: 2, size: 4096 })
    const rows = wrapper.findComponent(LogLinesTable).props('rows') as Array<{ id: string, message: string }>
    expect(rows).toHaveLength(2)
    expect(rows[0]?.message).toContain('first problem')
    expect(rows[1]?.message).toContain('older entry')
    expect(new Set(rows.map(row => row.id)).size).toBe(rows.length)
    expect(wrapper.findComponent(LogLinesTable).props('hasMore')).toBe(true)
  })

  it('shows one page when the API cannot page the log (dind)', async () => {
    vi.mocked(getPhpLogPage).mockResolvedValue({ lines: [PHP_LINE], page: 1, pages: 1, size: null })

    const wrapper = await mountView(makeInstance('wordpress', PHP_LOGS))

    expect(wrapper.findComponent(LogLinesTable).props('hasMore')).toBe(false)
    expect(getPhpLogPage).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('first problem')
  })

  it('groups the lines of a multi-line entry into one row', async () => {
    vi.mocked(getPhpLogPage).mockResolvedValue({
      lines: [PHP_LINE, 'PHP Stack trace:', 'PHP   1. {main}() /x.php:0'],
      page: 1,
      pages: 1,
      size: 4096,
    })

    const wrapper = await mountView(makeInstance('wordpress', PHP_LOGS))

    expect(wrapper.findComponent(LogLinesTable).props('rows')).toHaveLength(1)
  })

  it('goes back to page 1 without size after a 409', async () => {
    const wrapper = await mountView(makeInstance('wordpress', PHP_LOGS))
    vi.mocked(getPhpLogPage)
      .mockRejectedValueOnce({ status: 409 })
      .mockResolvedValueOnce(pageOf('PHP Notice:  fresh entry', 1, 1, 100))

    wrapper.findComponent(LogLinesTable).vm.$emit('load-more')
    await flushPromises()

    expect(getPhpLogPage).toHaveBeenNthCalledWith(2, 9, { page: 2, size: 4096 })
    expect(getPhpLogPage).toHaveBeenNthCalledWith(3, 9, { page: 1, size: null })
    expect(wrapper.text()).toContain('fresh entry')
    expect(wrapper.text()).not.toContain('first problem')
    expect(wrapper.findComponent(LogLinesTable).props('hasMore')).toBe(false)
  })

  it('goes back to page 1 without size when the answer has another size', async () => {
    const wrapper = await mountView(makeInstance('wordpress', PHP_LOGS))
    vi.mocked(getPhpLogPage)
      .mockResolvedValueOnce(pageOf('PHP Notice:  shrunk entry', 2, 2, 500))
      .mockResolvedValueOnce(pageOf('PHP Notice:  fresh entry', 1, 1, 500))

    wrapper.findComponent(LogLinesTable).vm.$emit('load-more')
    await flushPromises()

    expect(getPhpLogPage).toHaveBeenLastCalledWith(9, { page: 1, size: null })
    expect(wrapper.text()).toContain('fresh entry')
    expect(wrapper.text()).not.toContain('shrunk entry')
  })

  it('asks for the older page once while it is on its way', async () => {
    const wrapper = await mountView(makeInstance('wordpress', PHP_LOGS))
    const slow = deferred<LogPage>()
    vi.mocked(getPhpLogPage).mockReturnValueOnce(slow.promise)

    wrapper.findComponent(LogLinesTable).vm.$emit('load-more')
    wrapper.findComponent(LogLinesTable).vm.$emit('load-more')
    await flushPromises()
    expect(wrapper.findComponent(LogLinesTable).props('loadingMore')).toBe(true)
    slow.resolve(pageOf('PHP Notice:  page two entry', 2, 3, 4096))
    await flushPromises()

    expect(getPhpLogPage).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('page two entry')
    expect(wrapper.findComponent(LogLinesTable).props('loadingMore')).toBe(false)
  })

  it('searches the loaded page without a request', async () => {
    const wrapper = await mountView(makeInstance('wordpress', PHP_LOGS))

    wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:searchTerm', 'nothing-like-this')
    await flushPromises()

    expect(getPhpLogPage).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent(LogLinesTable).props('searchTerm')).toBe('nothing-like-this')
  })

  it('shows the loading state while the page loads', async () => {
    vi.mocked(getPhpLogPage).mockReturnValue(new Promise(() => {}))

    const wrapper = await mountView(makeInstance('wordpress', PHP_LOGS))

    expect(wrapper.findComponent(LogLinesTable).props('loading')).toBe(true)
  })

  it('shows the PHP empty state when the log is empty', async () => {
    vi.mocked(getPhpLogPage).mockResolvedValue({ lines: [], page: 1, pages: 1, size: null })

    const wrapper = await mountView(makeInstance('wordpress', PHP_LOGS))

    expect(wrapper.text()).toContain('message.emptyTable.phpLogs.title')
    expect(wrapper.text()).toContain('message.emptyTable.phpLogs.description')
    expect(wrapper.get('[data-testid="logs-download"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('pre').exists()).toBe(false)
  })

  it('opens the PHP download in a new window', async () => {
    const wrapper = await mountView(makeInstance('wordpress', PHP_LOGS))

    wrapper.findAll('button').find(button => button.text().includes('button.download'))!.trigger('click')
    await flushPromises()

    expect(phpLogsDownloadUrl).toHaveBeenCalledWith(9)
    expect(window.open).toHaveBeenCalledWith('https://api.test/instances/9/php-logs/download', '_blank')
  })

  it('alerts with the error message when the page fails to load and tries again on the next entry', async () => {
    const error = new Error('boom')
    vi.mocked(getPhpLogPage).mockRejectedValueOnce(error)

    const { wrapper, addAlert } = await mountWithAlertSpy(makeInstance('wordpress', [P.VIEW_LOGS, ...PHP_LOGS]))
    tabByLabel(wrapper, 'heading.instance.advanced.logs.phpLogs.title').trigger('click')
    await flushPromises()

    expect(addAlert).toHaveBeenCalledWith({ success: false, errorMessage: getErrorMessage(error) })
    expect(wrapper.findComponent(LogLinesTable).props('loading')).toBe(false)

    tabByLabel(wrapper, 'heading.instance.advanced.logs.instanceLogs.title').trigger('click')
    await flushPromises()
    tabByLabel(wrapper, 'heading.instance.advanced.logs.phpLogs.title').trigger('click')
    await flushPromises()

    expect(getPhpLogPage).toHaveBeenCalledTimes(2)
  })
})

describe('LogsView webserver tab', () => {
  const WEBSERVER = [P.VIEW_WEBSERVER_LOGS]
  const TEXT_FILES = [
    { name: 'error.log', size: 2048, plain_text: true },
    { name: 'access.log', size: null, plain_text: true },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getInstanceLogs).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(getWebserverLogs).mockResolvedValue(TEXT_FILES)
    vi.mocked(getWebserverLogPage).mockResolvedValue(pageOf('web line', 1, 3, 2048))
    vi.mocked(isLogPageConflict).mockImplementation(error => (error as { status?: number })?.status === 409)
    vi.mocked(webserverLogDownloadUrl).mockReturnValue('https://api.test/instances/9/webserver-logs/archive.gz/download')
    window.open = vi.fn()
    setWidth(DESKTOP_WIDTH)
  })

  function tabByLabel (wrapper: Awaited<ReturnType<typeof mountView>>, key: string) {
    return wrapper.findAll('.v-tab').find(tab => tab.text().includes(key))!
  }

  function selectFile (wrapper: Awaited<ReturnType<typeof mountView>>, file: WebserverLogFile) {
    wrapper.findComponent({ name: 'VSelect' }).vm.$emit('update:modelValue', file)
  }

  async function mountWithAlertSpy (instance: InstanceResource) {
    const pinia = createPinia()
    setActivePinia(pinia)
    const addAlert = vi.spyOn(useAlertsStore(pinia), 'addAlert')
    const wrapper = await mountKit(LogsView, { props: { instance }, global: { plugins: [pinia] } })
    await flushPromises()
    return { wrapper, addAlert }
  }

  it('loads the file list, then the content of its first file, when webserver is the first tab', async () => {
    const wrapper = await mountView(makeInstance('wordpress', WEBSERVER))

    expect(getWebserverLogs).toHaveBeenCalledTimes(1)
    expect(getWebserverLogs).toHaveBeenCalledWith(9)
    expect(getWebserverLogPage).toHaveBeenCalledTimes(1)
    expect(getWebserverLogPage).toHaveBeenCalledWith(9, 'error.log', { page: 1, size: null })
    expect(vi.mocked(getWebserverLogs).mock.invocationCallOrder[0]!)
      .toBeLessThan(vi.mocked(getWebserverLogPage).mock.invocationCallOrder[0]!)
    expect(getInstanceLogs).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('web line')
  })

  it('loads the file list in the background without the content when webserver is not the first tab', async () => {
    await mountView(makeInstance('wordpress', [P.VIEW_LOGS, ...WEBSERVER]))

    expect(getWebserverLogs).toHaveBeenCalledTimes(1)
    expect(getWebserverLogPage).not.toHaveBeenCalled()
    expect(getInstanceLogs).toHaveBeenCalledTimes(1)
  })

  it('reloads the content on every entry into the tab', async () => {
    const wrapper = await mountView(makeInstance('wordpress', [P.VIEW_LOGS, ...WEBSERVER]))

    tabByLabel(wrapper, 'heading.instance.advanced.logs.webserverLogs.title').trigger('click')
    await flushPromises()
    expect(getWebserverLogPage).toHaveBeenCalledTimes(1)

    tabByLabel(wrapper, 'heading.instance.advanced.logs.instanceLogs.title').trigger('click')
    await flushPromises()
    tabByLabel(wrapper, 'heading.instance.advanced.logs.webserverLogs.title').trigger('click')
    await flushPromises()

    expect(getWebserverLogPage).toHaveBeenCalledTimes(2)
    expect(getWebserverLogs).toHaveBeenCalledTimes(1)
  })

  it('reloads the content of the newly picked text file', async () => {
    const wrapper = await mountView(makeInstance('wordpress', WEBSERVER))

    selectFile(wrapper, TEXT_FILES[1]!)
    await flushPromises()

    expect(getWebserverLogPage).toHaveBeenCalledTimes(2)
    expect(getWebserverLogPage).toHaveBeenLastCalledWith(9, 'access.log', { page: 1, size: null })
  })

  it('keeps the content of the newest picked file when an earlier request answers last', async () => {
    const slow = deferred<LogPage>()
    vi.mocked(getWebserverLogPage)
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(pageOf('access line', 1, 1, 10))
    const wrapper = await mountView(makeInstance('wordpress', WEBSERVER))

    selectFile(wrapper, TEXT_FILES[1]!)
    await flushPromises()
    slow.resolve(pageOf('error line', 1, 1, 10))
    await flushPromises()

    expect(wrapper.text()).toContain('access line')
    expect(wrapper.text()).not.toContain('error line')
  })

  it('asks page 2 with the size of page 1 and appends it after the loaded rows', async () => {
    const wrapper = await mountView(makeInstance('wordpress', WEBSERVER))
    vi.mocked(getWebserverLogPage).mockResolvedValueOnce(pageOf('older line', 2, 3, 2048))

    wrapper.findComponent(LogLinesTable).vm.$emit('load-more')
    await flushPromises()

    expect(getWebserverLogPage).toHaveBeenLastCalledWith(9, 'error.log', { page: 2, size: 2048 })
    const rows = wrapper.findComponent(LogLinesTable).props('rows') as Array<{ message: string }>
    expect(rows.map(row => row.message)).toEqual(['web line', 'older line'])
    expect(wrapper.findComponent(LogLinesTable).props('hasMore')).toBe(true)
  })

  it('goes back to page 1 without size after a 409', async () => {
    const wrapper = await mountView(makeInstance('wordpress', WEBSERVER))
    vi.mocked(getWebserverLogPage)
      .mockRejectedValueOnce({ status: 409 })
      .mockResolvedValueOnce(pageOf('fresh line', 1, 1, 100))

    wrapper.findComponent(LogLinesTable).vm.$emit('load-more')
    await flushPromises()

    expect(getWebserverLogPage).toHaveBeenNthCalledWith(2, 9, 'error.log', { page: 2, size: 2048 })
    expect(getWebserverLogPage).toHaveBeenNthCalledWith(3, 9, 'error.log', { page: 1, size: null })
    expect(wrapper.text()).toContain('fresh line')
    expect(wrapper.text()).not.toContain('web line')
  })

  it('goes back to page 1 without size when the answer has another size', async () => {
    const wrapper = await mountView(makeInstance('wordpress', WEBSERVER))
    vi.mocked(getWebserverLogPage)
      .mockResolvedValueOnce(pageOf('shrunk line', 2, 2, 500))
      .mockResolvedValueOnce(pageOf('fresh line', 1, 1, 500))

    wrapper.findComponent(LogLinesTable).vm.$emit('load-more')
    await flushPromises()

    expect(getWebserverLogPage).toHaveBeenLastCalledWith(9, 'error.log', { page: 1, size: null })
    expect(wrapper.text()).toContain('fresh line')
    expect(wrapper.text()).not.toContain('shrunk line')
  })

  it('asks for the older page once while it is on its way', async () => {
    const wrapper = await mountView(makeInstance('wordpress', WEBSERVER))
    const slow = deferred<LogPage>()
    vi.mocked(getWebserverLogPage).mockReturnValueOnce(slow.promise)

    wrapper.findComponent(LogLinesTable).vm.$emit('load-more')
    wrapper.findComponent(LogLinesTable).vm.$emit('load-more')
    await flushPromises()
    slow.resolve(pageOf('page two line', 2, 3, 2048))
    await flushPromises()

    expect(getWebserverLogPage).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('page two line')
  })

  it('searches the loaded page without a request', async () => {
    vi.mocked(getWebserverLogPage).mockResolvedValue(pageOf('web line', 1, 1, 2048))
    const wrapper = await mountView(makeInstance('wordpress', WEBSERVER))

    wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:searchTerm', 'nothing-like-this')
    await flushPromises()

    expect(getWebserverLogPage).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent(LogLinesTable).props('searchTerm')).toBe('nothing-like-this')
  })

  it('does not load the content of a newly picked binary file', async () => {
    const wrapper = await mountView(makeInstance('wordpress', WEBSERVER))

    selectFile(wrapper, { name: 'archive.gz', size: 5_000_000, plain_text: false })
    await flushPromises()

    expect(getWebserverLogPage).toHaveBeenCalledTimes(1)
    expect(getWebserverLogPage).not.toHaveBeenCalledWith(9, 'archive.gz')
  })

  it('shows the download state for a binary file and opens its download', async () => {
    vi.mocked(getWebserverLogs).mockResolvedValue([{ name: 'archive.gz', size: 5_000_000, plain_text: false }])

    const wrapper = await mountView(makeInstance('wordpress', WEBSERVER))

    expect(getWebserverLogPage).not.toHaveBeenCalled()
    expect(wrapper.findComponent(LogLinesTable).exists()).toBe(false)
    const noData = wrapper.findComponent(LogsNoData)
    expect(noData.props('title')).toBe('message.emptyTable.webserverLogs.downloadTitle')
    expect(noData.props('description')).toBe('message.emptyTable.webserverLogs.downloadDescription')
    expect(noData.props('btnDownload')).toBe(true)

    wrapper.findAll('button').find(button => button.text().includes('button.download'))!.trigger('click')
    await flushPromises()

    expect(webserverLogDownloadUrl).toHaveBeenCalledWith(9, 'archive.gz')
    expect(window.open).toHaveBeenCalledWith('https://api.test/instances/9/webserver-logs/archive.gz/download', '_blank')
  })

  it('shows the table skeleton, not the empty state, while the file list loads', async () => {
    const list = deferred<WebserverLogFile[]>()
    vi.mocked(getWebserverLogs).mockReturnValue(list.promise)

    const { wrapper } = await mountWithAlertSpy(makeInstance('wordpress', WEBSERVER))

    expect(wrapper.findComponent(LogLinesTable).props('loading')).toBe(true)
    expect(wrapper.findComponent(LogsNoData).exists()).toBe(false)

    list.resolve([])
    await flushPromises()

    expect(wrapper.findComponent(LogLinesTable).exists()).toBe(false)
    expect(wrapper.findComponent(LogsNoData).props('title')).toBe('message.emptyTable.webserverLogs.title')
  })

  it('shows the empty state and makes no content request when the file list is empty (D1)', async () => {
    vi.mocked(getWebserverLogs).mockResolvedValue([])

    const { wrapper, addAlert } = await mountWithAlertSpy(makeInstance('wordpress', WEBSERVER))

    expect(getWebserverLogPage).not.toHaveBeenCalled()
    expect(addAlert).not.toHaveBeenCalled()
    const noData = wrapper.findComponent(LogsNoData)
    expect(noData.props('title')).toBe('message.emptyTable.webserverLogs.title')
    expect(noData.props('description')).toBe('message.emptyTable.webserverLogs.description')
    expect(noData.props('btnDownload')).toBe(false)
  })

  it('alerts with the error message when the file list fails to load', async () => {
    const error = new Error('boom')
    vi.mocked(getWebserverLogs).mockRejectedValue(error)

    const { wrapper, addAlert } = await mountWithAlertSpy(makeInstance('wordpress', WEBSERVER))

    expect(addAlert).toHaveBeenCalledWith({ success: false, errorMessage: getErrorMessage(error) })
    expect(getWebserverLogPage).not.toHaveBeenCalled()
    expect(wrapper.findComponent(LogsNoData).props('title')).toBe('message.emptyTable.webserverLogs.title')
  })

  it('alerts with the error message when the file content fails to load', async () => {
    const error = new Error('boom')
    vi.mocked(getWebserverLogPage).mockRejectedValue(error)

    const { wrapper, addAlert } = await mountWithAlertSpy(makeInstance('wordpress', WEBSERVER))

    expect(addAlert).toHaveBeenCalledWith({ success: false, errorMessage: getErrorMessage(error) })
    expect(wrapper.findComponent(LogLinesTable).props('loading')).toBe(false)
  })
})

describe('LogsView deploy tab', () => {
  const DEPLOY = [P.VIEW_LOGS]

  function run (overrides: Partial<DeployLogEntry> = {}): DeployLogEntry {
    return { id: 1, status: 'success', started_at: '2026-10-19T08:30:00Z', finished_at: '2026-10-19T08:31:00Z', source_type: 'git', ...overrides }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getInstanceLogs).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(listDeployLogs).mockResolvedValue([run()])
    vi.mocked(getDeployLog).mockResolvedValue({ status: 'success', stages: [], lines: [], error: null })
    vi.mocked(getDeployLogsLive).mockResolvedValue({ panel: null, engine: null })
    setWidth(DESKTOP_WIDTH)
  })

  function deployTab (wrapper: Awaited<ReturnType<typeof mountView>>) {
    return wrapper.findAll('.v-tab').find(tab => tab.text().includes('deployLogs.title'))!
  }

  async function openDeployTab (wrapper: Awaited<ReturnType<typeof mountView>>) {
    deployTab(wrapper).trigger('click')
    await flushPromises()
  }

  function selectedRunId (wrapper: Awaited<ReturnType<typeof mountView>>) {
    return wrapper.findComponent(DeployLogsTab).props('selectedLog')?.id ?? null
  }

  it('loads the run list on mount for a custom instance only', async () => {
    await mountView(makeInstance('custom', DEPLOY))
    expect(listDeployLogs).toHaveBeenCalledWith(9)

    vi.clearAllMocks()
    await mountView(makeInstance('wordpress', DEPLOY))
    expect(listDeployLogs).not.toHaveBeenCalled()
  })

  it('shows the tab content and the run select only after the deploy tab is opened', async () => {
    const wrapper = await mountView(makeInstance('custom', DEPLOY))

    expect(wrapper.find('.deploy-logs-select').exists()).toBe(false)
    expect(wrapper.findComponent(DeployLogsTab).exists()).toBe(false)

    await openDeployTab(wrapper)

    expect(wrapper.find('.deploy-logs-select').exists()).toBe(true)
    expect(wrapper.findComponent(DeployLogsTab).exists()).toBe(true)
  })

  it('passes the deploy search term to the tab and sends nothing to the API', async () => {
    const wrapper = await mountView(makeInstance('custom', DEPLOY))
    await openDeployTab(wrapper)
    vi.mocked(getInstanceLogs).mockClear()

    wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:search-term', 'boom')
    await flushPromises()

    expect(wrapper.findComponent(DeployLogsTab).props('searchTerm')).toBe('boom')
    expect(getInstanceLogs).not.toHaveBeenCalled()
  })

  it('picks the newest run, which is the running one', async () => {
    vi.mocked(listDeployLogs).mockResolvedValue([run({ id: 2, status: 'running', finished_at: null }), run({ id: 1 })])
    const wrapper = await mountView(makeInstance('custom', DEPLOY))

    await openDeployTab(wrapper)

    expect(selectedRunId(wrapper)).toBe(2)
  })

  it('picks the newest run, not an older finished or cancelled one', async () => {
    // The tester's history: the newest run finished with warnings, an earlier one finished, the oldest was cancelled.
    vi.mocked(listDeployLogs).mockResolvedValue([run({ id: 6 }), run({ id: 5 }), run({ id: 4, status: 'cancelled' })])
    const wrapper = await mountView(makeInstance('custom', DEPLOY))

    await openDeployTab(wrapper)

    expect(selectedRunId(wrapper)).toBe(6)
  })

  it('loads the history of the selected finished run by its id', async () => {
    vi.mocked(listDeployLogs).mockResolvedValue([run({ id: 3, status: 'failed' })])
    const wrapper = await mountView(makeInstance('custom', DEPLOY))

    await openDeployTab(wrapper)

    expect(getDeployLog).toHaveBeenCalledWith(9, 3)
  })

  it('reloads the list on terminal and keeps the picked run', async () => {
    vi.mocked(listDeployLogs)
      .mockResolvedValueOnce([run({ id: 2, status: 'running', finished_at: null }), run({ id: 1 })])
      .mockResolvedValueOnce([run({ id: 1 }), run({ id: 2, status: 'success' })])
    const wrapper = await mountView(makeInstance('custom', DEPLOY))
    await openDeployTab(wrapper)
    expect(selectedRunId(wrapper)).toBe(2)

    wrapper.findComponent(DeployLogsTab).vm.$emit('terminal', 'success')
    await flushPromises()

    expect(listDeployLogs).toHaveBeenCalledTimes(2)
    expect(selectedRunId(wrapper)).toBe(2)
    expect(wrapper.findComponent(DeployLogsTab).props('selectedLog')?.status).toBe('success')
  })

  it('empties the run list when a reload answers with something else than an array, as legacy does', async () => {
    vi.mocked(listDeployLogs)
      .mockResolvedValueOnce([run({ id: 2, status: 'running', finished_at: null })])
      .mockResolvedValueOnce(null as never)
    const wrapper = await mountView(makeInstance('custom', DEPLOY))
    await openDeployTab(wrapper)
    expect(selectedRunId(wrapper)).toBe(2)

    wrapper.findComponent(DeployLogsTab).vm.$emit('terminal', 'success')
    await flushPromises()

    expect(selectedRunId(wrapper)).toBeNull()
    expect(wrapper.find('.deploy-logs-select').exists()).toBe(false)
  })

  it('shows Download beside the run select for a finished run with lines and saves that run', async () => {
    vi.mocked(listDeployLogs).mockResolvedValue([run({ id: 3, status: 'failed' })])
    vi.mocked(getDeployLog).mockResolvedValue({ status: 'failed', stages: [], lines: [{ msg: 'boom' }], error: null })
    const wrapper = await mountView(makeInstance('custom', DEPLOY))
    await openDeployTab(wrapper)

    const download = wrapper.get('.page-title__filter-controls [data-testid="logs-download"]')
    await download.trigger('click')
    await flushPromises()

    expect(downloadDeployLog).toHaveBeenCalledWith(9, 3)
  })

  it('keeps Download in place but disabled for a run without lines', async () => {
    const wrapper = await mountView(makeInstance('custom', DEPLOY))
    await openDeployTab(wrapper)

    expect(wrapper.get('[data-testid="logs-download"]').attributes('disabled')).toBeDefined()
  })

  it('shows Download disabled while the run list loads', async () => {
    let finish!: (value: DeployLogEntry[]) => void
    vi.mocked(listDeployLogs).mockReturnValue(new Promise(resolve => {
      finish = resolve
    }))
    const wrapper = await mountView(makeInstance('custom', DEPLOY))
    await openDeployTab(wrapper)

    expect(wrapper.get('[data-testid="logs-download"]').attributes('disabled')).toBeDefined()
    finish([])
    await flushPromises()
  })

  it('has no Download on the Project Logs tab', async () => {
    const wrapper = await mountView(makeInstance('custom', DEPLOY))

    expect(wrapper.find('[data-testid="logs-download"]').exists()).toBe(false)
  })

  it('hides the run select and shows the empty state when there are no runs', async () => {
    vi.mocked(listDeployLogs).mockResolvedValue([])
    const wrapper = await mountView(makeInstance('custom', DEPLOY))

    await openDeployTab(wrapper)

    expect(wrapper.find('.deploy-logs-select').exists()).toBe(false)
    expect(wrapper.findComponent(DeployLogsTab).findComponent(LogsNoData).props('title')).toBe('deployLogs.noDeploys')
  })

  it('alerts with the error message when the run list fails to load', async () => {
    const error = new Error('boom')
    vi.mocked(listDeployLogs).mockRejectedValue(error)
    const pinia = createPinia()
    setActivePinia(pinia)
    const addAlert = vi.spyOn(useAlertsStore(pinia), 'addAlert')

    await mountKit(LogsView, { props: { instance: makeInstance('custom', DEPLOY) }, global: { plugins: [pinia] } })
    await flushPromises()

    expect(addAlert).toHaveBeenCalledWith({ success: false, errorMessage: getErrorMessage(error) })
  })
})
