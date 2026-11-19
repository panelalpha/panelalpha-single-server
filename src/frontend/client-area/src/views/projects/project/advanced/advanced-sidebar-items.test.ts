import { describe, expect, it } from 'vitest'
import { createInstancePrivilegeMethods } from '@/entities/privileges/instance-privilege-methods'
import { PRIVILEGES as P } from '@/entities/privileges/privileges'
import { advancedSidebarItems, type AdvancedSidebarSource } from './advanced-sidebar-items'

// The privilege methods are the real ones: they read `privileges` through `this`, as on the resource.
function source (privileges: string[], overrides: Partial<AdvancedSidebarSource> = {}): AdvancedSidebarSource {
  return {
    id: 7,
    type: 'wordpress',
    plan_settings: { copy_instance_allowed: true, wordpress_mcp_enabled: true },
    cdn_enabled: true,
    service_has_dns_cloudflare: true,
    domain_has_dns_zone: true,
    hasWpCloudServer: () => false,
    isContainer: false,
    ...createInstancePrivilegeMethods('wordpress'),
    ...overrides,
    privileges,
  } as AdvancedSidebarSource
}

function list (instance: AdvancedSidebarSource, base: '/instances' | '/projects' = '/instances', singleServer = false) {
  return advancedSidebarItems(instance, base, singleServer)
}
const keys = (items: ReturnType<typeof list>) => items.map(item => item.key)

describe('advancedSidebarItems', () => {
  it('shows only Details and Security without privileges', () => {
    expect(keys(list(source([])))).toEqual(['details', 'security'])
  })

  it('lists all 15 WordPress pages in legacy order with every privilege, without env-file', () => {
    const all = [
      P.COPY_INSTANCE,
      P.MANAGE_CLOUDFLARE,
      P.MANAGE_EDGE_CACHE,
      P.MANAGE_CDN,
      P.MANAGE_AUTO_UPDATE,
      P.MANAGE_DEBUG_MODE,
      P.MANAGE_MCP,
      P.MANAGE_GIT,
      P.MANAGE_CONFIG,
      P.MANAGE_WORDPRESS_USERS,
      P.MANAGE_GENERAL_USERS,
      P.MANAGE_THEMES,
      P.VIEW_LOGS,
    ]
    const instance = source(all, { hasWpCloudServer: () => true, cdn_enabled: true })
    expect(keys(list(instance))).toEqual([
      'details',
      'cloudflare',
      'edge-cache',
      'cdn',
      'security',
      'auto-updates',
      'developer-settings',
      'wordpress-mcp',
      'git',
      'wordpress-config',
      'wordpress-users',
      'themes',
      'logs',
    ])
  })

  it('hides copy-instance even with the plan flag and the privilege (lite `advancedHiddenPages.js`)', () => {
    expect(keys(list(source([P.COPY_INSTANCE])))).not.toContain('copy-instance')
  })

  it('shows cloudflare only with the privilege, a Cloudflare DNS service and a DNS zone', () => {
    const withAll = [P.MANAGE_CLOUDFLARE]
    expect(keys(list(source(withAll)))).toContain('cloudflare')
    expect(keys(list(source(withAll, { service_has_dns_cloudflare: false })))).not.toContain('cloudflare')
    expect(keys(list(source(withAll, { domain_has_dns_zone: false })))).not.toContain('cloudflare')
    expect(keys(list(source([], { service_has_dns_cloudflare: true, domain_has_dns_zone: true })))).not.toContain('cloudflare')
  })

  it('shows edge-cache only on a WP Cloud server with the privilege', () => {
    expect(keys(list(source([P.MANAGE_EDGE_CACHE], { hasWpCloudServer: () => true })))).toContain('edge-cache')
    expect(keys(list(source([P.MANAGE_EDGE_CACHE])))).not.toContain('edge-cache')
    expect(keys(list(source([], { hasWpCloudServer: () => true })))).not.toContain('edge-cache')
  })

  it('shows cdn with the privilege and cdn_enabled, and links it on the resource base (app-lite, D1)', () => {
    expect(keys(list(source([P.MANAGE_CDN])))).toContain('cdn')
    expect(keys(list(source([P.MANAGE_CDN], { cdn_enabled: false })))).not.toContain('cdn')
    expect(keys(list(source([], { cdn_enabled: true })))).not.toContain('cdn')

    const onInstances = list(source([P.MANAGE_CDN]), '/instances')
    expect(onInstances.find(item => item.key === 'cdn')?.to).toBe('/instances/7/advanced/cdn')
    const onProjects = list(source([P.MANAGE_CDN]), '/projects')
    expect(onProjects.find(item => item.key === 'cdn')?.to).toBe('/projects/7/advanced/cdn')
    expect(onProjects.find(item => item.key === 'details')?.to).toBe('/projects/7/advanced/details')
  })

  it('shows developer settings with a debug or maintenance privilege, and a classic PHP project with a PHP one', () => {
    expect(keys(list(source([P.MANAGE_DEBUG_MODE])))).toContain('developer-settings')
    expect(keys(list(source([P.MANAGE_MAINTENANCE_MODE])))).toContain('developer-settings')
    expect(keys(list(source([])))).not.toContain('developer-settings')
  })

  it('offers developer settings to a classic PHP project and never to a container project', () => {
    const classic = { type: 'custom', isContainer: false }
    expect(keys(list(source([P.PHPMYADMIN_SSO], classic)))).toContain('developer-settings')
    expect(keys(list(source([P.CHANGE_PHP_VERSION], classic)))).toContain('developer-settings')
    expect(keys(list(source([P.MANAGE_PHP_SETTINGS], classic)))).toContain('developer-settings')

    const php = [P.PHPMYADMIN_SSO, P.CHANGE_PHP_VERSION, P.MANAGE_PHP_SETTINGS]
    expect(keys(list(source(php, { type: 'custom', isContainer: true })))).not.toContain('developer-settings')
    expect(keys(list(source([P.MANAGE_DEBUG_MODE], { type: 'custom', isContainer: true })))).toContain('developer-settings')
  })

  it('shows wordpress-mcp with the privilege, the plan flag and a WordPress type (a missing type counts as WordPress)', () => {
    expect(keys(list(source([P.MANAGE_MCP])))).toContain('wordpress-mcp')
    expect(keys(list(source([P.MANAGE_MCP], { plan_settings: { wordpress_mcp_enabled: false } })))).not.toContain('wordpress-mcp')
    expect(keys(list(source([P.MANAGE_MCP], { type: 'custom' })))).not.toContain('wordpress-mcp')
    expect(keys(list(source([P.MANAGE_MCP], { type: undefined })))).toContain('wordpress-mcp')
  })

  it('shows env-file with the privilege on a non-WordPress type', () => {
    const custom = source([P.MANAGE_ENV_FILE], { type: 'custom' })
    expect(keys(list(custom))).toContain('env-file')
    const wordpress = source([P.MANAGE_ENV_FILE])
    expect(keys(list(wordpress))).not.toContain('env-file')
  })

  it('uses the WordPress users privilege for wordpress-users', () => {
    const wpUsers = source([P.MANAGE_WORDPRESS_USERS])
    expect(keys(list(wpUsers))).toContain('wordpress-users')

    const generalUsers = source([P.MANAGE_GENERAL_USERS])
    expect(keys(list(generalUsers))).not.toContain('wordpress-users')
  })

  it('hides users even with the general users privilege (lite `advancedHiddenPages.js`)', () => {
    expect(keys(list(source([P.MANAGE_GENERAL_USERS])))).not.toContain('users')
    expect(keys(list(source([P.MANAGE_WORDPRESS_USERS, P.MANAGE_GENERAL_USERS])))).toContain('wordpress-users')
  })

  it('shows logs with any of the three log privileges', () => {
    expect(keys(list(source([P.VIEW_LOGS])))).toContain('logs')
    expect(keys(list(source([P.VIEW_PHP_LOGS])))).toContain('logs')
    expect(keys(list(source([P.VIEW_WEBSERVER_LOGS])))).toContain('logs')
    expect(keys(list(source([])))).not.toContain('logs')
  })

  it('shows security without any privilege, whatever the type', () => {
    expect(keys(list(source([])))).toContain('security')
    expect(keys(list(source([], { type: 'custom' })))).toContain('security')
  })

  it('shows auto-updates only with its privilege', () => {
    expect(keys(list(source([P.MANAGE_AUTO_UPDATE])))).toContain('auto-updates')
    expect(keys(list(source([])))).not.toContain('auto-updates')
  })

  it('shows git only with its privilege', () => {
    expect(keys(list(source([P.MANAGE_GIT])))).toContain('git')
    expect(keys(list(source([])))).not.toContain('git')
  })

  it('shows themes only with its privilege', () => {
    expect(keys(list(source([P.MANAGE_THEMES])))).toContain('themes')
    expect(keys(list(source([])))).not.toContain('themes')
  })

  it('shows wordpress-config only with its privilege', () => {
    expect(keys(list(source([P.MANAGE_CONFIG])))).toContain('wordpress-config')
    expect(keys(list(source([])))).not.toContain('wordpress-config')
  })

  it('builds the links on the resource base and keeps the legacy title keys', () => {
    const items = list(source([P.MANAGE_THEMES, P.MANAGE_GIT]), '/projects')
    expect(items.find(item => item.key === 'git')).toEqual({
      key: 'git',
      to: '/projects/7/advanced/git',
      titleKey: 'heading.instance.advanced.git.title',
    })
    expect(items.find(item => item.key === 'themes')?.titleKey).toBe('heading.instance.advanced.theme.title')
    expect(items.find(item => item.key === 'edge-cache')).toBeUndefined()
  })
})

describe('advancedSidebarItems on single-server (hosting items)', () => {
  it('puts ftp between themes and logs on single-server with the privilege (desktop and tabs)', () => {
    const items = list(source([P.MANAGE_FTP, P.MANAGE_THEMES, P.VIEW_LOGS]), '/projects', true)
    const listed = keys(items)
    expect(listed.indexOf('ftp')).toBe(listed.indexOf('themes') + 1)
    expect(listed.indexOf('logs')).toBe(listed.indexOf('ftp') + 1)
    expect(items.find(item => item.key === 'ftp')).toEqual({
      key: 'ftp',
      to: '/projects/7/advanced/ftp',
      titleKey: 'heading.hosting.ftp.title',
    })
  })

  it('puts databases right after ftp and before logs on single-server with the MySQL privilege (desktop and tabs)', () => {
    const instance = source([P.MANAGE_FTP, P.MANAGE_MYSQL, P.VIEW_LOGS])
    const items = list(instance, '/projects', true)
    const listed = keys(items)
    expect(listed.indexOf('databases')).toBe(listed.indexOf('ftp') + 1)
    expect(listed.indexOf('logs')).toBe(listed.indexOf('databases') + 1)
    expect(items.find(item => item.key === 'databases')).toEqual({
      key: 'databases',
      to: '/projects/7/advanced/databases',
      titleKey: 'heading.hosting.databases.title',
    })
  })

  it('shows databases with the phpMyAdmin SSO privilege alone', () => {
    expect(keys(list(source([P.PHPMYADMIN_SSO]), '/projects', true))).toContain('databases')
  })

  it('has no databases on multi-server or without a MySQL privilege', () => {
    expect(keys(list(source([P.MANAGE_MYSQL, P.PHPMYADMIN_SSO]), '/projects', false))).not.toContain('databases')
    expect(keys(list(source([]), '/projects', true))).not.toContain('databases')
  })

  it('has no ftp on multi-server or without the privilege', () => {
    expect(keys(list(source([P.MANAGE_FTP]), '/projects', false))).not.toContain('ftp')
    expect(keys(list(source([]), '/projects', true))).not.toContain('ftp')
  })

  it('puts file-manager first of the hosting sections, before ftp, between themes and logs (desktop and tabs)', () => {
    const items = list(source([P.MANAGE_FILE_MANAGER, P.MANAGE_FTP, P.MANAGE_THEMES, P.VIEW_LOGS]), '/projects', true)
    const listed = keys(items)
    expect(listed.indexOf('file-manager')).toBe(listed.indexOf('themes') + 1)
    expect(listed.indexOf('ftp')).toBe(listed.indexOf('file-manager') + 1)
    expect(items.find(item => item.key === 'file-manager')).toEqual({
      key: 'file-manager',
      to: '/projects/7/advanced/file-manager',
      titleKey: 'heading.hosting.fileManager.title',
    })
  })

  it('has no file-manager on multi-server or without the privilege', () => {
    expect(keys(list(source([P.MANAGE_FILE_MANAGER]), '/projects', false))).not.toContain('file-manager')
    expect(keys(list(source([]), '/projects', true))).not.toContain('file-manager')
  })

  it('puts cron after ftp and before logs on single-server with the privilege (desktop and tabs)', () => {
    const instance = source([P.MANAGE_FTP, P.MANAGE_CRON, P.VIEW_LOGS])
    const items = list(instance, '/projects', true)
    const listed = keys(items)
    expect(listed.indexOf('cron')).toBe(listed.indexOf('ftp') + 1)
    expect(listed.indexOf('logs')).toBe(listed.indexOf('cron') + 1)
    expect(items.find(item => item.key === 'cron')).toEqual({
      key: 'cron',
      to: '/projects/7/advanced/cron',
      titleKey: 'heading.hosting.cron.title',
    })
  })

  it('has no cron on multi-server or without the privilege', () => {
    expect(keys(list(source([P.MANAGE_CRON]), '/projects', false))).not.toContain('cron')
    expect(keys(list(source([]), '/projects', true))).not.toContain('cron')
  })

  it('puts ftp, then sftp between themes and logs on single-server with both privileges (desktop and tabs)', () => {
    const instance = source([P.MANAGE_FTP, P.MANAGE_SFTP, P.MANAGE_THEMES, P.VIEW_LOGS])
    const items = list(instance, '/projects', true)
    const listed = keys(items)
    expect(listed.indexOf('ftp')).toBe(listed.indexOf('themes') + 1)
    expect(listed.indexOf('sftp')).toBe(listed.indexOf('ftp') + 1)
    expect(listed.indexOf('logs')).toBe(listed.indexOf('sftp') + 1)
    expect(items.find(item => item.key === 'sftp')).toEqual({
      key: 'sftp',
      to: '/projects/7/advanced/sftp',
      titleKey: 'heading.hosting.sftp.title',
    })
  })

  it('has no sftp without manage_sftp', () => {
    const instance = source([P.MANAGE_FTP, P.MANAGE_THEMES])
    expect(keys(list(instance, '/projects', true))).not.toContain('sftp')
  })

  it('puts domains between themes and ftp on single-server with the privilege', () => {
    const instance = source([P.MANAGE_DOMAINS, P.MANAGE_FTP, P.MANAGE_THEMES, P.VIEW_LOGS])
    const items = list(instance, '/projects', true)
    const listed = keys(items)
    expect(listed.indexOf('domains')).toBe(listed.indexOf('themes') + 1)
    expect(listed.indexOf('ftp')).toBe(listed.indexOf('domains') + 1)
    expect(listed.indexOf('logs')).toBe(listed.indexOf('ftp') + 1)
    expect(items.find(item => item.key === 'domains')).toEqual({
      key: 'domains',
      to: '/projects/7/advanced/domains',
      titleKey: 'heading.hosting.domains.title',
    })
  })

  it('has no domains on multi-server or without the privilege', () => {
    expect(keys(list(source([P.MANAGE_DOMAINS]), '/projects', false))).not.toContain('domains')
    expect(keys(list(source([]), '/projects', true))).not.toContain('domains')
  })

  it('puts containers after ftp and before logs on single-server with the privilege and isContainer', () => {
    const instance = source([P.MANAGE_FTP, P.MANAGE_CONTAINERS, P.MANAGE_THEMES, P.VIEW_LOGS], { isContainer: true })
    const items = list(instance, '/projects', true)
    const listed = keys(items)
    expect(listed.slice(listed.indexOf('themes'))).toEqual(['themes', 'ftp', 'containers', 'logs'])
    expect(items.find(item => item.key === 'containers')).toEqual({
      key: 'containers',
      to: '/projects/7/advanced/containers',
      titleKey: 'heading.hosting.containers.title',
    })
  })

  it('has no containers without isContainer, without the privilege or on multi-server', () => {
    expect(keys(list(source([P.MANAGE_CONTAINERS]), '/projects', true))).not.toContain('containers')
    expect(keys(list(source([], { isContainer: true }), '/projects', true))).not.toContain('containers')
    expect(keys(list(source([P.MANAGE_CONTAINERS], { isContainer: true }), '/projects', false))).not.toContain('containers')
  })
})
