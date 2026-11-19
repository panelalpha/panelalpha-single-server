import { describe, expect, it } from 'vitest'
import { buildInstanceHostingService, type InstanceHostingSource } from './instance-hosting-context'

function source (overrides: Partial<InstanceHostingSource> = {}): InstanceHostingSource {
  return {
    hostingId: 42,
    hostingServerType: 'wp-cloud',
    diagnostic_mode: false,
    service_id: 7,
    hostingAccountDetails: {
      homedir: '/home/panelalpha_42',
      mysql_db_prefix: 'pa42_',
      ip_address: '10.0.0.5',
      username: 'panelalpha_42',
      mysql_php_my_admin_sso_host: 'db.local',
    },
    host_ipv4_addresses: ['10.0.0.5'],
    dns_nameservers: ['ns1.example.com'],
    host_c_names: ['www.example.com'],
    dns_settings: { display_options: {} },
    server_settings: { uses_own_backup_system: true },
    plan_settings: { copy_instance_allowed: true },
    privileges: ['hosting.manage_ftp'],
    ...overrides,
  } as InstanceHostingSource
}

describe('buildInstanceHostingService', () => {
  it('maps the service and the single server account from the instance', () => {
    const service = buildInstanceHostingService(source())

    expect(service).toMatchObject({
      id: 7,
      hosting_server_type: 'wp-cloud',
      dns_settings: { display_options: {} },
      server_settings: { uses_own_backup_system: true },
      plan_settings: { copy_instance_allowed: true },
      dns_server_enabled: false,
      privileges: ['hosting.manage_ftp'],
    })
    expect(service.server_accounts).toHaveLength(1)
    expect(service.server_accounts[0]).toMatchObject({
      id: 42,
      server_type: 'wp-cloud',
      diagnostic_mode: false,
      username: 'panelalpha_42',
      homedir: '/home/panelalpha_42/',
      mysql_db_prefix: 'pa42_',
      ip_address: '10.0.0.5',
      ipv4_addresses: ['10.0.0.5'],
      nameservers: ['ns1.example.com'],
      host_c_names: ['www.example.com'],
    })
    expect(service.server_accounts[0]?.details?.mysql_php_my_admin_sso_host).toBe('db.local')
  })

  it('appends a slash to homedir only when it is missing', () => {
    const withSlash = source({ hostingAccountDetails: { homedir: '/home/x/' } })
    expect(buildInstanceHostingService(withSlash).server_accounts[0]?.homedir).toBe('/home/x/')
    const without = source({ hostingAccountDetails: { homedir: '/home/x' } })
    expect(buildInstanceHostingService(without).server_accounts[0]?.homedir).toBe('/home/x/')
  })

  it('gives an empty homedir without one', () => {
    const service = buildInstanceHostingService(source({ hostingAccountDetails: {} }))
    expect(service.server_accounts[0]?.homedir).toBe('')
  })

  it('tolerates missing hostingAccountDetails', () => {
    const account = buildInstanceHostingService(source({ hostingAccountDetails: undefined })).server_accounts[0]
    expect(account?.details).toEqual({})
    expect(account?.homedir).toBe('')
    expect(account?.id).toBe(42)
  })

  it('defaults the settings objects to {}', () => {
    const service = buildInstanceHostingService(source({ dns_settings: undefined, server_settings: null, plan_settings: undefined }))
    expect(service.dns_settings).toEqual({})
    expect(service.server_settings).toEqual({})
    expect(service.plan_settings).toEqual({})
  })

  it('leaves domain, plan_name and status undefined, as legacy does', () => {
    const service = buildInstanceHostingService(source())
    expect(service.domain).toBeUndefined()
    expect(service.plan_name).toBeUndefined()
    expect(service.status).toBeUndefined()
    expect(service.server_accounts[0]?.domain).toBeUndefined()
  })
})
