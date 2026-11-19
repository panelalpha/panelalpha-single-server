import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as resellerApi from '@/views/reseller/reseller.api'
import { toInstanceResource } from '@/entities/project/instance-resource'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import UserInstancesTooltip from './UserInstancesTooltip.vue'

const resolverMock = {
  isSubmitting: vi.fn(() => false),
  onResolve: vi.fn(),
  onError: vi.fn(),
}

vi.mock('@/entities/project/use-issue-resolve', () => ({
  useIssueResolve: () => resolverMock,
}))

vi.mock('@/views/reseller/reseller.api', () => ({
  listResellerUserInstances: vi.fn(),
}))

function deferred<T> () {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

const USER = { id: 7, name: 'Bob', email: 'bob@example.com', instances_count: 2 }

function instance (id: number, overrides: Record<string, unknown> = {}) {
  return toInstanceResource({
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
  } as never)
}

async function mountTooltip (props: { instancesCount?: number } = {}, singleServer = false) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().hydrateHome({ app: { single_server: { active: singleServer } }, user: {} } as never)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { render: () => h('div') } }] })
  await router.push('/')
  const wrapper = await mountKit(UserInstancesTooltip, {
    props: { user: USER, instancesCount: 2, ...props },
    slots: { default: '<span data-testid="chip">2</span>' },
    attachTo: document.body,
    global: { plugins: [pinia, router] },
  })
  return { wrapper, alerts: useAlertsStore() }
}

async function openMenu (wrapper: Awaited<ReturnType<typeof mountTooltip>>['wrapper']) {
  wrapper.getComponent({ name: 'VMenu' }).vm.$emit('update:modelValue', true)
  await flushPromises()
}

function body () {
  return document.body
}

describe('UserInstancesTooltip', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    resolverMock.isSubmitting.mockReturnValue(false)
    vi.mocked(resellerApi.listResellerUserInstances).mockResolvedValue([])
  })

  it('fetches the instances on mount, also for a user with no instances', async () => {
    const { wrapper } = await mountTooltip({ instancesCount: 0 })
    await flushPromises()

    expect(resellerApi.listResellerUserInstances).toHaveBeenCalledWith(7, expect.anything())
    wrapper.unmount()
  })

  it('disables the menu when the user has no instances', async () => {
    const { wrapper } = await mountTooltip({ instancesCount: 0 })
    expect(wrapper.getComponent({ name: 'VMenu' }).props('disabled')).toBe(true)
    wrapper.unmount()

    const second = await mountTooltip({ instancesCount: 2 })
    expect(second.wrapper.getComponent({ name: 'VMenu' }).props('disabled')).toBe(false)
    second.wrapper.unmount()
  })

  it('shows five skeleton rows while the instances load', async () => {
    const pending = deferred<never[]>()
    vi.mocked(resellerApi.listResellerUserInstances).mockReturnValue(pending.promise)
    const { wrapper } = await mountTooltip()
    await openMenu(wrapper)

    expect(body().querySelectorAll('[data-testid="user-instances-skeleton"]')).toHaveLength(5)
    expect(body().querySelectorAll('[data-testid="user-instance-row"]')).toHaveLength(0)

    pending.resolve([])
    await flushPromises()
    expect(body().querySelectorAll('[data-testid="user-instances-skeleton"]')).toHaveLength(0)
    wrapper.unmount()
  })

  it('links every instance to /instances/:id and the full list to /instances on multi-server', async () => {
    vi.mocked(resellerApi.listResellerUserInstances).mockResolvedValue([instance(1), instance(2)])
    const { wrapper } = await mountTooltip()
    await openMenu(wrapper)

    const rows = Array.from(body().querySelectorAll<HTMLAnchorElement>('[data-testid="user-instance-row"]'))
    expect(rows.map(row => row.getAttribute('href'))).toEqual(['/instances/1', '/instances/2'])
    expect(body().querySelector('[data-testid="user-instances-full-list"]')?.getAttribute('href')).toBe('/instances')
    expect(body().textContent).toContain('Site 1')
    expect(body().textContent).toContain('reseller.user.sharedInstances')
    wrapper.unmount()
  })

  it('links to /projects/:id and /projects on single-server', async () => {
    vi.mocked(resellerApi.listResellerUserInstances).mockResolvedValue([instance(1)])
    const { wrapper } = await mountTooltip({}, true)
    await openMenu(wrapper)

    expect(body().querySelector('[data-testid="user-instance-row"]')?.getAttribute('href')).toBe('/projects/1')
    expect(body().querySelector('[data-testid="user-instances-full-list"]')?.getAttribute('href')).toBe('/projects')
    wrapper.unmount()
  })

  it('marks suspended and cancelled instances with the suspended chip only', async () => {
    vi.mocked(resellerApi.listResellerUserInstances).mockResolvedValue([
      instance(1, { service_status: 'suspended' }),
      instance(2, { service_status: 'cancelled' }),
      instance(3),
    ])
    const { wrapper } = await mountTooltip({ instancesCount: 3 })
    await openMenu(wrapper)

    expect(body().querySelectorAll('[data-testid="user-instance-suspended"]')).toHaveLength(2)
    wrapper.unmount()
  })

  it('alerts when the fetch fails', async () => {
    vi.mocked(resellerApi.listResellerUserInstances).mockRejectedValue(new Error('boom'))
    const { wrapper, alerts } = await mountTooltip()
    await flushPromises()

    expect(alerts.activeAlerts).toHaveLength(1)
    wrapper.unmount()
  })

  it('hands an upload-archive resolve to the resolver with the right instance', async () => {
    vi.mocked(resellerApi.listResellerUserInstances).mockResolvedValue([instance(1), instance(2)])
    const { wrapper } = await mountTooltip()
    await openMenu(wrapper)

    const indicators = wrapper.findAllComponents({ name: 'StatusIndicator' })
    expect(indicators).toHaveLength(2)
    const payload = { issue: { code: 'x', solutions: [] }, solutionId: 's', value: null }
    indicators[1]!.vm.$emit('resolve', payload)

    expect(resolverMock.onResolve).toHaveBeenCalledWith(2, payload, expect.anything())
    indicators[0]!.vm.$emit('error', 'some.key')
    expect(resolverMock.onError).toHaveBeenCalledWith('some.key')
    wrapper.unmount()
  })

  it('keeps the content (and the status indicators) mounted after the menu closes', async () => {
    vi.mocked(resellerApi.listResellerUserInstances).mockResolvedValue([instance(1)])
    const { wrapper } = await mountTooltip()
    await openMenu(wrapper)
    expect(wrapper.findAllComponents({ name: 'StatusIndicator' })).toHaveLength(1)

    wrapper.getComponent({ name: 'VMenu' }).vm.$emit('update:modelValue', false)
    await flushPromises()

    expect(wrapper.getComponent({ name: 'VMenu' }).props('eager')).toBe(true)
    expect(body().querySelector('[data-testid="user-instance-row"]')).not.toBeNull()
    expect(wrapper.findAllComponents({ name: 'StatusIndicator' })).toHaveLength(1)
    wrapper.unmount()
  })
})
