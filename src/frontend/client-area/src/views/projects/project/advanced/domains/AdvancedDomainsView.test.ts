import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DomainsView from '@/views/hosting/domains/DomainsView.vue'
import { getInstance } from '@/views/projects/project/instance.api'
import { useInstanceStore } from '@/views/projects/project/instance.store'
import { mountKit } from '@/test/mount-kit'
import AdvancedDomainsView from './AdvancedDomainsView.vue'

// The shared screen is replaced by a stub: this test covers only the frame (the props it passes, the events it handles).
vi.mock('@/views/hosting/domains/DomainsView.vue', () => ({
  default: {
    name: 'DomainsView',
    props: ['service', 'variant', 'instanceId'],
    emits: ['primary-domain-set'],
    template: '<div class="domains-view-stub" />',
  },
}))

vi.mock('@/views/projects/project/instance.api', () => ({ getInstance: vi.fn(), updateSiteName: vi.fn() }))

function makeInstance (): InstanceResource {
  return {
    id: 9,
    service_id: 5,
    hostingId: 77,
    hostingServerType: 'cpanel',
    hostingAccountDetails: { homedir: '/home/shop' },
    diagnostic_mode: false,
    domain: 'a.test',
    url: 'https://a.test',
    privileges: ['hosting.manage_domains'],
  } as unknown as InstanceResource
}

describe('AdvancedDomainsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(getInstance).mockReset()
  })

  it('renders DomainsView in the project variant with the service built from the instance and its id', async () => {
    const wrapper = await mountKit(AdvancedDomainsView, { props: { instance: makeInstance() }, global: { plugins: [createPinia()] } })

    const domains = wrapper.findComponent(DomainsView)
    expect(domains.exists()).toBe(true)
    expect(domains.props('variant')).toBe('project')
    expect(domains.props('instanceId')).toBe(9)
    expect(domains.props('service').server_accounts[0]!.id).toBe(77)
    wrapper.unmount()
  })

  it('gives the frame resource the address the switch set, without a reload', async () => {
    vi.mocked(getInstance).mockResolvedValue({ id: 9, domain: 'b.test', url: 'https://b.test' } as never)
    const wrapper = await mountKit(AdvancedDomainsView, { props: { instance: makeInstance() }, global: { plugins: [createPinia()] } })
    const store = useInstanceStore()
    store.replace(makeInstance())

    wrapper.findComponent(DomainsView).vm.$emit('primary-domain-set')
    await flushPromises()

    expect(getInstance).toHaveBeenCalledWith(9, null)
    expect(store.instance?.url).toBe('https://b.test')
    wrapper.unmount()
  })

  it('keeps the page as it was when the refresh itself fails', async () => {
    vi.mocked(getInstance).mockRejectedValue(new Error('503'))
    const wrapper = await mountKit(AdvancedDomainsView, { props: { instance: makeInstance() }, global: { plugins: [createPinia()] } })
    const store = useInstanceStore()
    store.replace(makeInstance())

    wrapper.findComponent(DomainsView).vm.$emit('primary-domain-set')
    await flushPromises()

    expect(store.instance?.url).toBe('https://a.test')
    wrapper.unmount()
  })
})
