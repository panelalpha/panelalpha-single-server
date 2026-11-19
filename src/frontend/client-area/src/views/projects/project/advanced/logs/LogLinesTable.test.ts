import type { LogRow } from './log-lines'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import DataIteratorFooter from '@/shared/ui/data-iterator/DataIteratorFooter.vue'
import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'
import { mountKit } from '@/test/mount-kit'
import LogLinesTable from './LogLinesTable.vue'

const accessRows: LogRow[] = [
  { id: '0', time: '05/Nov/2026:12:00:00 +0000', sortKey: 0, ip: '1.2.3.4', request: 'GET /a HTTP/1.1', status: '200', size: '512', message: 'GET /a HTTP/1.1', detail: 'https://ref.example · Mozilla' },
  { id: '1', time: '05/Nov/2026:12:00:01 +0000', sortKey: 1, ip: '5.6.7.8', request: 'GET /b HTTP/1.1', status: '503', size: '-', message: 'GET /b HTTP/1.1' },
]

const deployRows: LogRow[] = [
  { id: '0', time: 'first', sortKey: 0, stage: 'build', level: 'info', message: 'alpha' },
  { id: '1', time: 'second', sortKey: 1, stage: 'build', level: 'error', message: 'beta' },
  { id: '2', time: 'third', sortKey: 2, stage: 'deploy', level: 'ok', message: 'gamma' },
]

describe('LogLinesTable', () => {
  const width = window.innerWidth

  beforeEach(() => {
    window.innerWidth = 1600
  })

  afterEach(() => {
    window.innerWidth = width
  })

  async function mountWith (props: Record<string, unknown>, w = 1600) {
    window.innerWidth = w
    setActivePinia(createPinia())
    return mountKit(LogLinesTable, { props })
  }

  it('shows the access columns, status chips and the detail line', async () => {
    const wrapper = await mountWith({ kind: 'access', rows: accessRows })

    const headers = wrapper.findAll('.custom-sort__item').map(h => h.text())
    expect(headers).toEqual(['Time', 'IP', 'Request', 'Status', 'Size'])
    const chips = wrapper.findAllComponents(StatusLabel)
    expect(chips.map(c => c.props('value'))).toEqual(['200', '503'])
    expect(chips.map(c => c.props('status'))).toEqual(['success', 'error'])
    expect(wrapper.findAll('[data-testid="log-lines-detail"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('https://ref.example · Mozilla')
    wrapper.unmount()
  })

  it('shows Time, Level and Message for an error log, with level chips', async () => {
    const rows: LogRow[] = [{ id: '0', time: 't', sortKey: 0, level: 'warning', message: 'line1\nline2' }]
    const wrapper = await mountWith({ kind: 'error', rows })

    expect(wrapper.findAll('.custom-sort__item').map(h => h.text())).toEqual(['Time', 'Level', 'Message'])
    expect(wrapper.findComponent(StatusLabel).props('status')).toBe('warning')
    expect(wrapper.findComponent(StatusLabel).props('value')).toBe('Warning')
    wrapper.unmount()
  })

  it('shows the empty state for no rows', async () => {
    const wrapper = await mountWith({ kind: 'php', rows: [] })

    expect(wrapper.findComponent(EmptyState).props('title')).toBe('message.emptyTable.phpLogs.title')
    wrapper.unmount()
  })

  it('shows the card on a narrow screen', async () => {
    const wrapper = await mountWith({ kind: 'access', rows: accessRows }, 800)

    expect(wrapper.findAll('.mobile-table-item')).toHaveLength(2)
    wrapper.unmount()
  })

  const accessMany = (from: number, count: number): LogRow[] => Array.from({ length: count }, (_, index) => ({
    id: String(from + index),
    time: `t${from + index}`,
    sortKey: from + index,
    ip: '1.2.3.4',
    request: `GET /line-${from + index} HTTP/1.1`,
    status: '200',
    size: '1',
    message: `GET /line-${from + index} HTTP/1.1`,
  }))

  it('pages a file log in the browser with one page more while the file has an older window', async () => {
    const wrapper = await mountWith({ kind: 'access', rows: accessMany(0, 20), hasMore: true })

    expect(wrapper.findAll('tbody tr')).toHaveLength(15)
    const footer = wrapper.findComponent(DataIteratorFooter)
    expect(footer.props('numberOfPages')).toBe(3)
    expect(footer.props('possibleItemsPerPage')).toEqual([[15, 50, 100]])
    wrapper.unmount()
  })

  it('asks for the older window past the loaded rows and moves to the page when it arrives', async () => {
    const loaded = accessMany(0, 20)
    const wrapper = await mountWith({ kind: 'access', rows: loaded, hasMore: true })

    wrapper.findComponent(DataIteratorFooter).vm.$emit('update:page', 3)
    await flushPromises()
    expect(wrapper.emitted('load-more')).toHaveLength(1)

    await wrapper.setProps({ loadingMore: true })
    await wrapper.setProps({ rows: [...loaded, ...accessMany(20, 20)], loadingMore: false, hasMore: false })
    await flushPromises()

    expect(wrapper.findComponent(DataIteratorFooter).props('page')).toBe(3)
    expect(wrapper.findAll('tbody tr')).toHaveLength(10)
    expect(wrapper.text()).toContain('/line-30 ')
    wrapper.unmount()
  })

  it('keeps the page when the older window does not come', async () => {
    const wrapper = await mountWith({ kind: 'access', rows: accessMany(0, 20), hasMore: true })

    wrapper.findComponent(DataIteratorFooter).vm.$emit('update:page', 3)
    await wrapper.setProps({ loadingMore: true })
    await wrapper.setProps({ loadingMore: false })
    await flushPromises()

    expect(wrapper.emitted('load-more')).toHaveLength(1)
    expect(wrapper.findComponent(DataIteratorFooter).props('page')).toBe(1)
    wrapper.unmount()
  })

  it('starts on page 1 again when the rows are replaced (another file, a reload)', async () => {
    const wrapper = await mountWith({ kind: 'access', rows: accessMany(0, 40) })

    wrapper.findComponent(DataIteratorFooter).vm.$emit('update:page', 2)
    await flushPromises()
    expect(wrapper.findComponent(DataIteratorFooter).props('page')).toBe(2)

    await wrapper.setProps({ rows: accessMany(100, 40) })
    await flushPromises()
    expect(wrapper.findComponent(DataIteratorFooter).props('page')).toBe(1)
    wrapper.unmount()
  })

  it('pages only the loaded rows while searching', async () => {
    const wrapper = await mountWith({ kind: 'access', rows: accessMany(0, 20), hasMore: true, searchTerm: 'GET' })

    expect(wrapper.findComponent(DataIteratorFooter).props('numberOfPages')).toBe(2)
    wrapper.unmount()
  })

  it('cuts the deploy rows into pages of 15 with the sizes 15, 50, 100 in the footer', async () => {
    const many: LogRow[] = Array.from({ length: 20 }, (_, index) => ({ id: String(index), time: `t${index}`, sortKey: index, stage: 'build', level: 'info', message: `line-${index}` }))
    const wrapper = await mountWith({ kind: 'deploy', rows: many })

    expect(wrapper.findAll('tbody tr')).toHaveLength(15)
    const footer = wrapper.findComponent(DataIteratorFooter)
    expect(footer.props('numberOfPages')).toBe(2)
    expect(footer.props('possibleItemsPerPage')).toEqual([[15, 50, 100]])
    wrapper.unmount()
  })

  it('turns the page of the deploy rows in the browser when a footer button is clicked', async () => {
    const many: LogRow[] = Array.from({ length: 20 }, (_, index) => ({ id: String(index), time: `t${index}`, sortKey: index, stage: 'build', level: 'info', message: `line-${index}` }))
    const wrapper = await mountWith({ kind: 'deploy', rows: many })

    await wrapper.findAll('.v-pagination button').find(button => button.text() === '2')!.trigger('click')
    await flushPromises()

    expect(wrapper.findAll('tbody tr')).toHaveLength(5)
    expect(wrapper.text()).toContain('line-15')
    expect(wrapper.text()).not.toContain('line-0')
    wrapper.unmount()
  })

  it('shows the size of an access line in B, KB or MB', async () => {
    const wrapper = await mountWith({ kind: 'access', rows: [{ ...accessRows[0]!, size: '2048' }, accessRows[1]!] })

    expect(wrapper.text()).toContain('2 KB')
    wrapper.unmount()
  })

  it('filters the rows in the browser by the search term', async () => {
    const wrapper = await mountWith({ kind: 'deploy', rows: deployRows, searchTerm: 'beta' })

    expect(wrapper.text()).toContain('beta')
    expect(wrapper.text()).not.toContain('alpha')
    expect(wrapper.text()).not.toContain('gamma')
    wrapper.unmount()
  })

  it('sorts the deploy rows by the Time column', async () => {
    const wrapper = await mountWith({ kind: 'deploy', rows: deployRows })

    const order = () => wrapper.findAll('tbody tr').map(row => row.text()).filter(Boolean)
    expect(order()[0]).toContain('alpha')

    await wrapper.findAll('.custom-sort__item--sortable')[0]!.trigger('click')
    await wrapper.findAll('.custom-sort__item--sortable')[0]!.trigger('click')

    expect(order()[0]).toContain('gamma')
    wrapper.unmount()
  })
})
