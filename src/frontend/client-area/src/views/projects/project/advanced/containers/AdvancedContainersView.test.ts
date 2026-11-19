import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ContainersView from '@/views/hosting/containers/ContainersView.vue'
import { mountKit } from '@/test/mount-kit'
import AdvancedContainersView from './AdvancedContainersView.vue'

vi.mock('@/views/hosting/containers/containers.api', () => ({
  listContainerGroups: vi.fn().mockResolvedValue([]),
  listProxyRules: vi.fn().mockResolvedValue([]),
  projectAction: vi.fn(),
  serviceAction: vi.fn(),
  containerLogs: vi.fn(),
  createProxyRule: vi.fn(),
  deleteProxyRule: vi.fn(),
  listDomains: vi.fn().mockResolvedValue([]),
}))

function makeInstance (overrides: Record<string, unknown> = {}): InstanceResource {
  return {
    id: 9,
    service_id: 5,
    hostingId: 77,
    hostingServerType: 'cpanel',
    hostingAccountDetails: { homedir: '/home/shop' },
    diagnostic_mode: false,
    privileges: ['hosting.manage_containers'],
    host_ipv4_addresses: [],
    host_ip_address: '10.0.0.5',
    ...overrides,
  } as unknown as InstanceResource
}

async function mountView (instance: InstanceResource) {
  const wrapper = await mountKit(AdvancedContainersView, { props: { instance }, global: { plugins: [createPinia()] } })
  await flushPromises()
  return wrapper
}

describe('AdvancedContainersView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders ContainersView in the project variant with the service built from the instance', async () => {
    const wrapper = await mountView(makeInstance())

    const containers = wrapper.findComponent(ContainersView)
    expect(containers.exists()).toBe(true)
    expect(containers.props('variant')).toBe('project')
    expect(containers.props('service').id).toBe(5)
    expect(containers.props('service').server_accounts[0]!.id).toBe(77)
    wrapper.unmount()
  })

  it('passes the server IP with the host_ip_address fallback', async () => {
    const fallback = await mountView(makeInstance())
    expect(fallback.findComponent(ContainersView).props('serverIp')).toBe('10.0.0.5')
    fallback.unmount()

    const first = await mountView(makeInstance({ host_ipv4_addresses: ['1.2.3.4'] }))
    expect(first.findComponent(ContainersView).props('serverIp')).toBe('1.2.3.4')
    first.unmount()
  })
})
