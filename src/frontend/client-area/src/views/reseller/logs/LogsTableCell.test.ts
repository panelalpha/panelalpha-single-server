import type { ResellerLogRow } from '@/views/reseller/reseller.api'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import LogsTableCell from './LogsTableCell.vue'

function row (overrides: Partial<ResellerLogRow> = {}): ResellerLogRow {
  return {
    id: 1,
    user: { email: 'jan@example.com', first_name: 'Jan', last_name: 'Kowalski', role: null },
    action: 'user.instance.plugin.install',
    request_method: 'POST',
    payload: { 'App\\Models\\Application:12': { name: 'My blog', url: 'https://blog.example.com' } },
    date: '2026-03-05 14:07:00',
    ...overrides,
  } as ResellerLogRow
}

const HEADER = {
  user: { text: 'user', value: 'user' },
  instance: { text: 'instance', value: 'instance' },
  action: { text: 'actions', value: 'action' },
  date: { text: 'date', value: 'date', sortable: true },
}

async function mountCell (header: keyof typeof HEADER, props: { item?: ResellerLogRow, isMobile?: boolean } = {}) {
  return mountKit(LogsTableCell, {
    props: { item: row(), header: HEADER[header], ...props },
    attachTo: document.body,
  })
}

describe('reseller LogsTableCell', () => {
  it('links the instance in a new tab with its name', async () => {
    const wrapper = await mountCell('instance')

    const link = wrapper.get('a.logs-table__instance')
    expect(link.attributes('href')).toBe('https://blog.example.com')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.text()).toBe('My blog')
    wrapper.unmount()
  })

  it('renders no link when the payload is null or holds no application', async () => {
    const empty = await mountCell('instance', { item: row({ payload: null }) })
    expect(empty.find('a').exists()).toBe(false)
    empty.unmount()

    const other = await mountCell('instance', { item: row({ payload: { PluginResource: { title: 'Akismet' } } }) })
    expect(other.find('a').exists()).toBe(false)
    other.unmount()
  })

  it('renders the user and the action through the kit components', async () => {
    const user = await mountCell('user')
    expect(user.text()).toContain('Jan Kowalski')
    user.unmount()

    const action = await mountCell('action')
    expect(action.get('.action-name').text()).toBe('User Instance Plugin Install')
    action.unmount()
  })

  it('wraps the date in actions-row only outside mobile', async () => {
    const desktop = await mountCell('date')
    expect(desktop.find('.actions-row').exists()).toBe(true)
    desktop.unmount()

    const mobile = await mountCell('date', { isMobile: true })
    expect(mobile.find('.actions-row').exists()).toBe(false)
    mobile.unmount()
  })

  it('shows the date as time from now and the fixed YYYY-MM-DD HH:mm in the tooltip', async () => {
    const recent = await mountCell('date', { item: row({ date: new Date(Date.now() - 3 * 3600 * 1000).toISOString() }) })
    expect(recent.get('span.text--gray-darken1').text()).toBe('3 hours ago')
    recent.unmount()

    const fixed = await mountCell('date')
    fixed.getComponent({ name: 'VTooltip' }).vm.$emit('update:modelValue', true)
    await flushPromises()
    expect(document.body.textContent).toContain('2026-03-05 14:07')
    fixed.unmount()
  })
})
