import { describe, expect, it } from 'vitest'
import { hasTabForPath, sftpPageType, sidebarItems } from './hosting-sidebar-items'
import { makeService } from './hosting.fixtures'

const all = [
  'hosting.manage_domains',
  'hosting.manage_ftp',
  'hosting.manage_sftp',
  'hosting.manage_mysql',
  'hosting.manage_cron',
  'hosting.manage_file_manager',
  'hosting.manage_dns',
  'hosting.manage_email',
  'hosting.manage_containers',
]
const keys = (items: ReturnType<typeof sidebarItems>) => items.map(item => item.key)
const app = { singleServer: false, emailRecordsDot: false }

describe('sidebarItems', () => {
  it('lists Summary first on a multi-server install and nothing else without privileges', () => {
    expect(keys(sidebarItems(makeService({ privileges: ['hosting.control_panel_sso'] }), app))).toEqual(['summary'])
  })

  it('lists only Usage on a single-server install without DNS or e-mail, also with full privileges', () => {
    const full = makeService({
      privileges: all.filter(privilege => privilege !== 'hosting.manage_dns' && privilege !== 'hosting.manage_email'),
      dns_server_enabled: false,
      email_server_enabled: false,
    })
    const single = { singleServer: true, emailRecordsDot: true }
    expect(sidebarItems(makeService({ privileges: [] }), single)).toEqual([
      { key: 'usage', to: '/hosting/usage', titleKey: 'heading.hosting.usage.title', group: 'manage' },
    ])
    expect(sidebarItems(full, single)).toEqual([
      { key: 'usage', to: '/hosting/usage', titleKey: 'heading.hosting.usage.title', group: 'manage' },
    ])
  })

  it('adds the DNS page to Usage on a single-server install with DNS, the privilege and plan DNS management', () => {
    const service = makeService({
      privileges: ['hosting.manage_dns'],
      dns_server_enabled: true,
      plan_settings: { dns_management_enabled: true },
    })
    expect(keys(sidebarItems(service, { singleServer: true, emailRecordsDot: false }))).toEqual(['usage', 'dns'])
  })

  it('adds the e-mail pages to Usage on a single-server install, the dot on Email Addresses only', () => {
    const service = makeService({ privileges: ['hosting.manage_email'], email_server_enabled: true })
    const items = sidebarItems(service, { singleServer: true, emailRecordsDot: true })
    expect(keys(items)).toEqual(['usage', 'email-addresses', 'email-forwarders'])
    expect(items.filter(item => item.group === 'email').map(item => item.key)).toEqual(['email-addresses', 'email-forwarders'])
    expect(items.find(item => item.key === 'email-addresses')?.showDot).toBe(true)
    expect(items.find(item => item.key === 'email-forwarders')?.showDot).toBeUndefined()
  })

  it('keeps legacy order and groups', () => {
    const service = makeService({
      privileges: all,
      dns_server_enabled: true,
      email_server_enabled: true,
      plan_settings: { dns_management_enabled: true },
    })
    const items = sidebarItems(service, app)

    expect(keys(items)).toEqual(['summary', 'domains', 'ftp', 'sftp', 'databases', 'cron', 'file-manager', 'dns', 'email-addresses', 'email-forwarders'])
    expect(items.filter(item => item.group === 'email').map(item => item.key)).toEqual(['email-addresses', 'email-forwarders'])
  })

  it('shows databases for phpMyAdmin SSO alone', () => {
    expect(keys(sidebarItems(makeService({ privileges: ['hosting.phpmyadmin_sso'] }), app))).toContain('databases')
  })

  it('DNS needs the DNS server, the privilege and plan DNS management', () => {
    const base = makeService({ privileges: ['hosting.manage_dns'], dns_server_enabled: true, plan_settings: { dns_management_enabled: true } })
    expect(keys(sidebarItems(base, app))).toContain('dns')
    expect(keys(sidebarItems({ ...base, dns_server_enabled: false }, app))).not.toContain('dns')
    expect(keys(sidebarItems({ ...base, plan_settings: {} }, app))).not.toContain('dns')
  })

  it('titles the SFTP page SSH when the plan allows SSH access', () => {
    const base = makeService({ privileges: ['hosting.manage_sftp'] })
    expect(sftpPageType(base)).toBe('sftp')
    expect(sftpPageType({ ...base, plan_settings: { default_ssh_access_enabled: true } })).toBe('ssh')
    expect(sftpPageType({ ...base, plan_settings: { allow_user_enable_ssh_access: true } })).toBe('ssh')
    expect(sidebarItems({ ...base, plan_settings: { default_ssh_access_enabled: true } }, app).find(item => item.key === 'sftp')?.titleKey).toBe('heading.hosting.ssh.title')
  })

  it('puts the dot on the email addresses item only', () => {
    const service = makeService({ privileges: ['hosting.manage_email'], email_server_enabled: true })
    const items = sidebarItems(service, { ...app, emailRecordsDot: true })
    expect(items.find(item => item.key === 'email-addresses')?.showDot).toBe(true)
    expect(items.find(item => item.key === 'email-forwarders')?.showDot).toBeUndefined()
  })

  it('never lists Containers (removed from the menu)', () => {
    const service = makeService({ privileges: all, dns_server_enabled: true, email_server_enabled: true, plan_settings: { dns_management_enabled: true } })
    expect(keys(sidebarItems(service, app))).not.toContain('containers')
    expect(keys(sidebarItems(service, { ...app, singleServer: true }))).not.toContain('containers')
  })

  it('finds a tab for the route or its subpath, and none for a route without one', () => {
    const single = sidebarItems(makeService({ privileges: [] }), { singleServer: true, emailRecordsDot: false })
    const multi = sidebarItems(makeService({ privileges: ['hosting.manage_email'], email_server_enabled: true }), app)

    expect(hasTabForPath(multi, '/hosting/summary')).toBe(true)
    expect(hasTabForPath(multi, '/hosting/email-addresses/12')).toBe(true)
    expect(hasTabForPath(single, '/hosting/usage')).toBe(true)
    expect(hasTabForPath(single, '/hosting/ftp')).toBe(false)
    expect(hasTabForPath(multi, '/hosting/cron')).toBe(false)
  })
})
