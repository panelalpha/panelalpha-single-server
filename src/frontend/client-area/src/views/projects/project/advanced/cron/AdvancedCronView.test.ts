import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listCronJobs } from '@/views/hosting/cron/cron.api'
import CronView from '@/views/hosting/cron/CronView.vue'
import { mountKit } from '@/test/mount-kit'
import AdvancedCronView from './AdvancedCronView.vue'

vi.mock('@/views/hosting/cron/cron.api', () => ({
  // The list, not a bare array: `services: null` is PHP hosting.
  listCronJobs: vi.fn().mockResolvedValue({ jobs: [], services: null }),
  createCronJob: vi.fn(),
  updateCronJob: vi.fn(),
  deleteCronJob: vi.fn(),
}))

function makeInstance (hostingId: number | null = 77): InstanceResource {
  return {
    id: 9,
    service_id: 5,
    hostingId,
    hostingServerType: 'cpanel',
    hostingAccountDetails: { homedir: '/home/shop' },
    diagnostic_mode: false,
    privileges: ['hosting.manage_cron'],
  } as unknown as InstanceResource
}

describe('AdvancedCronView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(listCronJobs).mockClear()
  })

  it('renders CronView in the project variant with the service built from the instance', async () => {
    const wrapper = await mountKit(AdvancedCronView, { props: { instance: makeInstance() }, global: { plugins: [createPinia()] } })
    await flushPromises()

    const cron = wrapper.findComponent(CronView)
    expect(cron.exists()).toBe(true)
    expect(cron.props('variant')).toBe('project')
    expect(cron.props('service').server_accounts[0]!.id).toBe(77)
    expect(cron.props('service').hosting_server_type).toBe('cpanel')
    wrapper.unmount()
  })

  it('asks for the jobs of the project hosting account', async () => {
    const wrapper = await mountKit(AdvancedCronView, { props: { instance: makeInstance() }, global: { plugins: [createPinia()] } })
    await flushPromises()

    expect(listCronJobs).toHaveBeenCalledExactlyOnceWith(77)
    wrapper.unmount()
  })

  // Entry straight from a link to a project without a hosting account: legacy makes no request and keeps the skeleton.
  it('makes no request for a project without a hosting account', async () => {
    const wrapper = await mountKit(AdvancedCronView, { props: { instance: makeInstance(null) }, global: { plugins: [createPinia()] } })
    await flushPromises()

    expect(listCronJobs).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
