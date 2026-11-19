import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FtpView from '@/views/hosting/ftp/FtpView.vue'
import { mountKit } from '@/test/mount-kit'
import AdvancedFtpView from './AdvancedFtpView.vue'

vi.mock('@/views/hosting/ftp/ftp.api', () => ({
  listFtpAccounts: vi.fn().mockResolvedValue({ data: [], meta: { usage: false } }),
  createFtpAccount: vi.fn(),
  deleteFtpAccount: vi.fn(),
  getFtpServerInfo: vi.fn(),
  listAccountDomains: vi.fn(),
}))

function makeInstance (): InstanceResource {
  return {
    id: 9,
    service_id: 5,
    hostingId: 77,
    hostingServerType: 'cpanel',
    hostingAccountDetails: { homedir: '/home/shop' },
    diagnostic_mode: false,
    privileges: ['hosting.manage_ftp'],
  } as unknown as InstanceResource
}

describe('AdvancedFtpView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders FtpView in the project variant with the service built from the instance', async () => {
    const wrapper = await mountKit(AdvancedFtpView, { props: { instance: makeInstance() }, global: { plugins: [createPinia()] } })
    await flushPromises()

    const ftp = wrapper.findComponent(FtpView)
    expect(ftp.exists()).toBe(true)
    expect(ftp.props('variant')).toBe('project')
    expect(ftp.props('service').server_accounts[0]!.id).toBe(77)
    expect(ftp.props('service').server_accounts[0]!.homedir).toBe('/home/shop/')
    wrapper.unmount()
  })
})
