import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DatabasesView from '@/views/hosting/databases/DatabasesView.vue'
import { mountKit } from '@/test/mount-kit'
import AdvancedDatabasesView from './AdvancedDatabasesView.vue'

vi.mock('@/views/hosting/databases/databases.api', () => ({
  listDatabases: vi.fn().mockResolvedValue({ data: [], meta: { usage: false } }),
  listUsers: vi.fn().mockResolvedValue({ data: [], meta: { usage: false } }),
  createDatabase: vi.fn(),
  renameDatabase: vi.fn(),
  deleteDatabase: vi.fn(),
  listDatabasesCached: vi.fn().mockResolvedValue([]),
  getServerInfo: vi.fn().mockResolvedValue({}),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  getPrivileges: vi.fn(),
  updatePrivileges: vi.fn(),
}))

vi.mock('@/entities/sso/phpmyadmin-sso.api', () => ({
  getPhpMyAdminSsoUrl: vi.fn(),
  getPhpMyAdminPreviewSsoUrl: vi.fn(),
  listPhpMyAdminDatabases: vi.fn(),
}))

function makeInstance (): InstanceResource {
  return {
    id: 9,
    service_id: 5,
    hostingId: 77,
    hostingServerType: 'cpanel',
    hostingAccountDetails: { homedir: '/home/shop', mysql_db_prefix: 'shop_' },
    diagnostic_mode: false,
    privileges: ['hosting.manage_mysql'],
  } as unknown as InstanceResource
}

describe('AdvancedDatabasesView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders DatabasesView in the project variant with the service built from the instance', async () => {
    const wrapper = await mountKit(AdvancedDatabasesView, { props: { instance: makeInstance() }, global: { plugins: [createPinia()] } })
    await flushPromises()

    const databases = wrapper.findComponent(DatabasesView)
    expect(databases.exists()).toBe(true)
    expect(databases.props('variant')).toBe('project')
    expect(databases.props('service').server_accounts[0]!.id).toBe(77)
    expect(databases.props('service').server_accounts[0]!.mysql_db_prefix).toBe('shop_')
    wrapper.unmount()
  })
})
