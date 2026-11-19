import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FileManagerView from '@/views/hosting/file-manager/FileManagerView.vue'
import { mountKit } from '@/test/mount-kit'
import AdvancedFileManagerView from './AdvancedFileManagerView.vue'

vi.mock('@/views/hosting/file-manager/FileManagerView.vue', () => ({
  default: { name: 'FileManagerView', props: ['service', 'variant'], template: '<div />' },
}))

function makeInstance (): InstanceResource {
  return {
    id: 9,
    service_id: 5,
    hostingId: 77,
    hostingServerType: 'cpanel',
    hostingAccountDetails: { homedir: '/home/shop' },
    diagnostic_mode: false,
    privileges: ['hosting.manage_file_manager'],
  } as unknown as InstanceResource
}

describe('AdvancedFileManagerView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders FileManagerView in the project variant with the service built from the instance', async () => {
    const wrapper = await mountKit(AdvancedFileManagerView, { props: { instance: makeInstance() }, global: { plugins: [createPinia()] } })
    await flushPromises()

    const fm = wrapper.findComponent(FileManagerView)
    expect(fm.exists()).toBe(true)
    expect(fm.props('variant')).toBe('project')
    expect(fm.props('service').server_accounts[0]!.id).toBe(77)
    wrapper.unmount()
  })
})
