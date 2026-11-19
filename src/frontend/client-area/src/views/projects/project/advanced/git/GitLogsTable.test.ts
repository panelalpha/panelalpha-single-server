import type { GitLog } from './git-status'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDate } from '@/shared/time/date-format'
import { fromNow } from '@/shared/time/from-now'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import GitLogsTable from './GitLogsTable.vue'

// Carbon ISO in UTC with microseconds, as the backend sends `created_at`.
const CREATED = '2026-10-20T12:34:56.000000Z'

const originalWidth = window.innerWidth

function setWindowWidth (width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
}

function log (overrides: Partial<GitLog> = {}): GitLog {
  return {
    action: 'pull',
    status: 'success',
    commit_hash: 'abcdef1234567890',
    commit_message: 'Fix the page',
    error_message: null,
    created_at: CREATED,
    ...overrides,
  }
}

interface TableProps {
  items?: GitLog[]
  total?: number
  page?: number
  perPage?: number
  loading?: boolean
}

async function mountTable (props: TableProps = {}): Promise<VueWrapper> {
  setActivePinia(createPinia())
  return mountKit(GitLogsTable, {
    props: { items: [], total: 0, page: 1, perPage: 5, loading: false, ...props },
  })
}

function buttonWithText (wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find(node => node.text() === label)
  if (!button) {
    throw new Error(`no button "${label}"`)
  }
  return button
}

describe('GitLogsTable', () => {
  beforeEach(() => {
    setWindowWidth(1600)
    // `fromNow` reads `new Date()`; freeze it 14 days after CREATED so the "14 days ago" snapshots do not depend on today.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-03T12:34:56.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    setWindowWidth(originalWidth)
  })

  it('shows the empty message and no footer when there are no logs', async () => {
    const wrapper = await mountTable({ items: [], total: 0 })

    expect(wrapper.find('.git-logs-empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('message.emptyTable.gitLogs.title')
    expect(wrapper.find('.data-iterator-footer').exists()).toBe(false)
    expect(wrapper.find('.v-data-table-server').exists()).toBe(false)
  })

  it('renders a row with a status chip and an error tooltip for a failed log', async () => {
    const wrapper = await mountTable({
      items: [log({ status: 'failed', error_message: ' Clone failed ' })],
      total: 1,
    })

    const chip = wrapper.findAll('.v-chip').find(node => node.text() === 'failed')
    expect(chip).toBeDefined()
    expect(chip?.classes()).toContain('cursor-pointer')
    expect(wrapper.text()).toContain('abcdef1…890')
    expect(wrapper.text()).toContain('Fix the page')
  })

  it('a successful log gets a plain chip without the tooltip activator', async () => {
    const wrapper = await mountTable({ items: [log({ status: 'success', error_message: 'ignored' })], total: 1 })

    const chip = wrapper.findAll('.v-chip').find(node => node.text() === 'success')
    expect(chip).toBeDefined()
    expect(chip?.classes()).not.toContain('cursor-pointer')
  })

  it('renders the stacked row below 1400 px and the table row from 1400 px', async () => {
    setWindowWidth(1200)
    const narrow = await mountTable({ items: [log()], total: 1 })
    expect(narrow.find('.mobile-table-item').exists()).toBe(true)
    narrow.unmount()

    setWindowWidth(1600)
    const wide = await mountTable({ items: [log()], total: 1 })
    expect(wide.find('.mobile-table-item').exists()).toBe(false)
    expect(wide.find('td.v-data-table-column--align-end').exists()).toBe(true)
  })

  // Characterization of the card markup: the DOM of a row stays as it was written by hand.
  it('renders the stacked card of a log with the legacy markup', async () => {
    setWindowWidth(1200)
    const wrapper = await mountTable({ items: [log(), log({ status: 'failed', error_message: 'boom' })], total: 2 })

    const rows = wrapper.findAll('tbody tr')
    expect(normalizeHtml(rows[0]!.html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.action</div><div class="mobile-table-item__value"><div class="d-flex flex-column"><div class="text--gray-darken2 font-weight-medium">pull</div></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.commit</div><div class="mobile-table-item__value"><div class="d-flex flex-column"><div class="caption text--gray-darken1 text-truncate commit-cell"><span class="font-weight-medium">abcdef1…890</span><span class="ml-2">Fix the page</span></div></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.status</div><div class="mobile-table-item__value"><span class="v-chip v-chip--label v-theme--light v-chip--density-default v-chip--size-small v-chip--variant-flat status-label status-label--success" draggable="false"><span class="v-chip__underlay"></span><div class="v-chip__content" data-no-activator=""><span class="status-label__text">success</span></div></span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.date</div><div class="mobile-table-item__value"><span class="mb-0 text--gray-darken1">14 days ago</span></div></div></div></div></td></tr>"`)
    expect(normalizeHtml(rows[1]!.html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.action</div><div class="mobile-table-item__value"><div class="d-flex flex-column"><div class="text--gray-darken2 font-weight-medium">pull</div></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.commit</div><div class="mobile-table-item__value"><div class="d-flex flex-column"><div class="caption text--gray-darken1 text-truncate commit-cell"><span class="font-weight-medium">abcdef1…890</span><span class="ml-2">Fix the page</span></div></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.status</div><div class="mobile-table-item__value"><span class="v-chip v-chip--label v-theme--light v-chip--density-default v-chip--size-small v-chip--variant-flat status-label status-label--error cursor-pointer" draggable="false"><span class="v-chip__underlay"></span><div class="v-chip__content" data-no-activator=""><span class="status-label__text">failed</span></div></span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.date</div><div class="mobile-table-item__value"><span class="mb-0 text--gray-darken1">14 days ago</span></div></div></div></div></td></tr>"`)
    wrapper.unmount()
  })

  it('shows the branches a switch changed between on its row', async () => {
    const wrapper = await mountTable({
      items: [log({ action: 'branch_change', branch_from: 'main', branch_to: 'develop' })],
      total: 1,
    })

    expect(wrapper.text()).toContain('main → develop')
    wrapper.unmount()
  })

  it('shows no branch line on a row recorded without the branches', async () => {
    const wrapper = await mountTable({ items: [log({ action: 'branch_change' }), log({ action: 'pull' })], total: 2 })

    expect(wrapper.find('.branch-change').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the column header row only for a desktop list with rows', async () => {
    const wrapper = await mountTable({ items: [log()], total: 1 })

    expect(wrapper.find('.custom-sort').exists()).toBe(true)
    expect(wrapper.findAll('.custom-sort .sort-item')).toHaveLength(4)
  })

  it('shows the skeleton rows and no empty message while loading', async () => {
    const wrapper = await mountTable({ items: [], total: 0, loading: true })

    expect(wrapper.find('.git-logs-empty').exists()).toBe(false)
    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(true)
    expect(wrapper.find('.data-iterator-footer').exists()).toBe(false)
  })

  it('emits update:page with the clicked page', async () => {
    const wrapper = await mountTable({ items: [log()], total: 12, perPage: 5 })

    await buttonWithText(wrapper, '2').trigger('click')

    expect(wrapper.emitted('update:page')).toEqual([[2]])
  })

  it('emits update:per-page with the chosen size', async () => {
    const wrapper = await mountTable({ items: [log()], total: 12, perPage: 5 })

    await buttonWithText(wrapper, '15').trigger('click')

    expect(wrapper.emitted('update:per-page')).toEqual([[15]])
  })

  it('formats created_at in the backend format without an invalid date', () => {
    expect(fromNow(CREATED)).not.toContain('Invalid')
    expect(formatDate(CREATED, { time: true })).not.toContain('Invalid')
    expect(formatDate(CREATED, { time: true })).toContain('2026-10-20')
  })
})

describe('GitLogsTable (kit-data-table-advanced)', () => {
  beforeEach(() => {
    setWindowWidth(1600)
  })

  afterEach(() => {
    setWindowWidth(originalWidth)
  })

  it('nie emituje sortu z nagłówka', async () => {
    const wrapper = await mountTable({ items: [log()], total: 1 })

    expect(wrapper.findAll('.custom-sort__item--sortable')).toHaveLength(0)
    wrapper.unmount()
  })

  it('karta ma cztery pola z etykietami', async () => {
    setWindowWidth(1300)
    const wrapper = await mountTable({ items: [log()], total: 1 })

    expect(wrapper.findAll('.mobile-table-item')[0]!.findAll('.mobile-table-item__header')).toHaveLength(4)
    wrapper.unmount()
  })
})
