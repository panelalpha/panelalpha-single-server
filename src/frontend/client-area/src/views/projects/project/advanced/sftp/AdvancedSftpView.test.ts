import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SftpView from '@/views/hosting/sftp/SftpView.vue'
import { mountKit } from '@/test/mount-kit'
import AdvancedSftpView from './AdvancedSftpView.vue'

vi.mock('@/views/hosting/sftp/sftp.api', () => ({
  listSftpAccounts: vi.fn().mockResolvedValue({ data: [], meta: { access_type: 'sftp', actions: [] } }),
  createSftpAccount: vi.fn(),
  updateSftpAccount: vi.fn(),
  deleteSftpAccount: vi.fn(),
  getSftpServerInfo: vi.fn(),
  disconnectAllSftp: vi.fn(),
  setSftpAccessType: vi.fn(),
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

describe('AdvancedSftpView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders SftpView in the project variant with the service built from the instance', async () => {
    const wrapper = await mountKit(AdvancedSftpView, { props: { instance: makeInstance() }, global: { plugins: [createPinia()] } })
    await flushPromises()

    const sftp = wrapper.findComponent(SftpView)
    expect(sftp.exists()).toBe(true)
    expect(sftp.props('variant')).toBe('project')
    expect(sftp.props('service').server_accounts[0]!.id).toBe(77)
    wrapper.unmount()
  })
})
