import type * as HostingApi from '@/views/hosting/hosting.api'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as hostingApi from '@/views/hosting/hosting.api'
import { makeService } from '@/views/hosting/hosting.fixtures'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import HostingInstancesCard from './HostingInstancesCard.vue'

vi.mock('@/views/hosting/hosting.api', async importOriginal => {
  const actual: typeof HostingApi = await importOriginal()
  return { listHostingInstances: vi.fn(), toHostingInstance: actual.toHostingInstance }
})

function rawInstance (id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: 'wordpress',
    name: `Site ${id}`,
    url: `https://site${id}.example.com`,
    domain: `site${id}.example.com`,
    status: 'active',
    privileges: [],
    shared_access: [],
    owner: null,
    server_settings: {},
    service_created_at: '2026-01-01T00:00:00Z',
    created_at: '2026-09-01T00:00:00Z',
    version: '6.8',
    has_automatic_backup: true,
    backup_details: [{ type: 'automatic' }],
    async_status: {},
    details: {},
    ...overrides,
  }
}

function accounts (...ids: number[]) {
  return ids.map(id => ({ id, domain: `acc${id}.test` }))
}

async function mountCard (service = makeService({ owned: true, instances_count: 2, server_accounts: accounts(11) }), singleServer = false) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().hydrateHome({ app: { single_server: { active: singleServer } }, user: {} } as never)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { render: () => h('div') } }] })
  await router.push('/')
  const wrapper = await mountKit(HostingInstancesCard, { props: { service }, global: { plugins: [pinia, router] } })
  await flushPromises()
  return wrapper
}

describe('HostingInstancesCard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('requests five instances per account, merges them and sums the totals', async () => {
    vi.mocked(hostingApi.listHostingInstances)
      .mockResolvedValueOnce({ data: [rawInstance(1), rawInstance(2)], meta: { total: 2 } })
      .mockResolvedValueOnce({ data: [rawInstance(3)], meta: { total: 4 } })
    const wrapper = await mountCard(makeService({ owned: true, server_accounts: accounts(11, 12) }))

    expect(hostingApi.listHostingInstances).toHaveBeenCalledWith(11, 5)
    expect(hostingApi.listHostingInstances).toHaveBeenCalledWith(12, 5)
    expect(wrapper.findAll('[data-testid="summary-instance-row"]')).toHaveLength(3)
    expect((wrapper.vm as unknown as { totalInstances: number }).totalInstances).toBe(6)
    wrapper.unmount()
  })

  it('skips an account whose request fails but keeps the others', async () => {
    vi.mocked(hostingApi.listHostingInstances)
      .mockRejectedValueOnce(new Error('500'))
      .mockResolvedValueOnce({ data: [rawInstance(3)], meta: { total: 1 } })
    const wrapper = await mountCard(makeService({ owned: true, server_accounts: accounts(11, 12) }))

    expect(wrapper.findAll('[data-testid="summary-instance-row"]')).toHaveLength(1)
    expect((wrapper.vm as unknown as { totalInstances: number }).totalInstances).toBe(1)
    wrapper.unmount()
  })

  it('links a row to /instances/<id>, or /projects/<id> on a single-server install', async () => {
    vi.mocked(hostingApi.listHostingInstances).mockResolvedValue({ data: [rawInstance(9)], meta: { total: 1 } })
    const app = await mountCard()
    expect(app.get('[data-testid="summary-instance-row"]').attributes('href')).toBe('/instances/9')
    app.unmount()

    const lite = await mountCard(undefined, true)
    expect(lite.get('[data-testid="summary-instance-row"]').attributes('href')).toBe('/projects/9')
    lite.unmount()
  })

  it('shows the Load more button only with more instances than shown, and then asks for 99', async () => {
    vi.mocked(hostingApi.listHostingInstances).mockResolvedValue({ data: [1, 2, 3, 4, 5].map(id => rawInstance(id)), meta: { total: 12 } })
    const wrapper = await mountCard()
    const button = wrapper.get('[data-testid="summary-load-more"]')

    vi.mocked(hostingApi.listHostingInstances).mockResolvedValue({ data: Array.from({ length: 12 }, (_, index) => rawInstance(index + 1)), meta: { total: 12 } })
    await button.trigger('click')
    await flushPromises()

    expect(hostingApi.listHostingInstances).toHaveBeenLastCalledWith(11, 99)
    expect(wrapper.findAll('[data-testid="summary-instance-row"]')).toHaveLength(12)
    expect(wrapper.find('[data-testid="summary-load-more"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('has no Load more with five or fewer instances', async () => {
    vi.mocked(hostingApi.listHostingInstances).mockResolvedValue({ data: [rawInstance(1)], meta: { total: 1 } })
    const wrapper = await mountCard()
    expect(wrapper.find('[data-testid="summary-load-more"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('marks a suspended or cancelled service on the row', async () => {
    vi.mocked(hostingApi.listHostingInstances).mockResolvedValue({ data: [rawInstance(1, { service_status: 'suspended' }), rawInstance(2)], meta: { total: 2 } })
    const wrapper = await mountCard()
    expect(wrapper.findAll('.suspend-chip')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows the empty state without instances', async () => {
    vi.mocked(hostingApi.listHostingInstances).mockResolvedValue({ data: [], meta: { total: 0 } })
    const wrapper = await mountCard()
    expect(wrapper.find('[data-testid="summary-instances-empty"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('tells the parent when loading starts and ends, with the instances', async () => {
    vi.mocked(hostingApi.listHostingInstances).mockResolvedValue({ data: [rawInstance(1)], meta: { total: 1 } })
    const wrapper = await mountCard()

    expect(wrapper.emitted('instances-loaded')).toHaveLength(1)
    expect((wrapper.emitted('instances-loaded')![0]![0] as Array<{ id: number }>)[0]!.id).toBe(1)
    expect(wrapper.emitted('instances-loading')).toEqual([[false]])
    wrapper.unmount()
  })
})
