import { describe, expect, it } from 'vitest'
import { instanceRoutes } from '@/views/projects/project/instance.routes'
import { PRIVILEGES as P } from '@/entities/privileges/privileges'
import { type RawInstance, toInstanceResource } from '@/entities/project/instance-resource'
import { hiddenInstancePageRedirect } from './advanced-instance-pages'
import { advancedSidebarItems } from './advanced-sidebar-items'
import { hiddenHostingSectionRedirect } from './hosting-context/advanced-hosting-sections'

function rawInstance (privileges: string[], overrides: Partial<RawInstance> = {}): RawInstance {
  return {
    id: 7,
    type: 'custom',
    name: 'Project 7',
    url: 'https://203.0.113.20',
    domain: 'project.example.com',
    service_status: 'active',
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    service_created_at: '2026-01-01T00:00:00.000Z',
    async_status: { installation: 'finished' },
    labels: [],
    privileges,
    plan_settings: {},
    shared_access: [],
    staging_apps: [],
    details: {},
    server_settings: {},
    ...overrides,
  }
}

const instance = (privileges: string[], overrides: Partial<RawInstance> = {}) => toInstanceResource(rawInstance(privileges, overrides))

/** The WordPress-only privileges the panel grants a detected WordPress project and withholds from every other one (`Privileges::WORDPRESS_ONLY`). */
const WORDPRESS_ONLY = [
  P.MANAGE_AUTO_UPDATE,
  P.MANAGE_DEBUG_MODE,
  P.MANAGE_MAINTENANCE_MODE,
  P.MANAGE_MCP,
  P.MANAGE_CONFIG,
  P.MANAGE_WORDPRESS_USERS,
  P.MANAGE_THEMES,
]

/** What any project of the Free edition has: the hosting and general privileges, the git page and env-file. */
const COMMON = [
  P.MANAGE_GIT,
  P.MANAGE_ENV_FILE,
  P.VIEW_LOGS,
  P.MANAGE_FILE_MANAGER,
  P.MANAGE_DOMAINS,
  P.MANAGE_FTP,
  P.MANAGE_SFTP,
  P.MANAGE_MYSQL,
  P.MANAGE_CRON,
]

const DETAILS = '/projects/7/advanced/details'

function redirect (segment: string, target = instance(COMMON), base = '/projects'): string | null {
  return hiddenInstancePageRedirect(`${base}/7/advanced/${segment}`, '7', target, true)
}

describe('hiddenInstancePageRedirect: the sidebar decides every Advanced page', () => {
  it('redirects the WordPress-only pages on a project that is not WordPress (the panel withholds their privileges)', () => {
    for (const segment of ['wordpress-config', 'wordpress-users', 'themes', 'auto-updates', 'developer-settings', 'wordpress-mcp']) {
      expect([segment, redirect(segment)]).toEqual([segment, DETAILS])
    }
  })

  it('keeps the WordPress pages a WordPress project offers', () => {
    const wordpress = instance([...COMMON, ...WORDPRESS_ONLY], { type: 'wordpress', plan_settings: { wordpress_mcp_enabled: true } })
    for (const segment of ['wordpress-config', 'wordpress-users', 'themes', 'auto-updates', 'developer-settings', 'wordpress-mcp']) {
      expect([segment, redirect(segment, wordpress)]).toEqual([segment, null])
    }
  })

  it('redirects wordpress-mcp when the plan does not offer it and keeps it when it does', () => {
    const withoutFlag = instance([...COMMON, ...WORDPRESS_ONLY], { type: 'wordpress', plan_settings: { wordpress_mcp_enabled: false } })
    const withFlag = instance([...COMMON, ...WORDPRESS_ONLY], { type: 'wordpress', plan_settings: { wordpress_mcp_enabled: true } })
    expect(redirect('wordpress-mcp', withoutFlag)).toBe(DETAILS)
    expect(redirect('wordpress-mcp', withFlag)).toBeNull()
  })

  it('redirects env-file on a WordPress project even though it has the privilege, and keeps it on a container one', () => {
    const wordpress = instance([...COMMON, ...WORDPRESS_ONLY], { type: 'wordpress' })
    expect(redirect('env-file', wordpress)).toBe(DETAILS)
    expect(redirect('env-file')).toBeNull()
  })

  it('redirects a page whose privilege the project does not have', () => {
    expect(redirect('git', instance([]))).toBe(DETAILS)
    expect(redirect('logs', instance([]))).toBe(DETAILS)
    expect(redirect('cloudflare')).toBe(DETAILS)
  })

  it('keeps Details and Security for every project', () => {
    for (const segment of ['details', 'security']) {
      expect([segment, redirect(segment, instance([]))]).toEqual([segment, null])
    }
  })

  it('leaves the hosting sections to their own rule', () => {
    for (const segment of ['domains', 'ftp', 'file-manager', 'cron', 'databases', 'sftp', 'containers']) {
      expect([segment, redirect(segment, instance([]))]).toEqual([segment, null])
    }
  })

  it('redirects under the /instances base to the same base', () => {
    expect(redirect('wordpress-config', instance([]), '/instances')).toBe('/instances/7/advanced/details')
  })

  it('does not touch a path that is no page of the frame', () => {
    expect(redirect('wordpress-config/extra', instance([]))).toBeNull()
    expect(hiddenInstancePageRedirect('/projects/7/general', '7', instance([]), true)).toBeNull()
  })
})

function advancedChildren () {
  const frame = instanceRoutes.find(route => route.name === 'project')!
  const advanced = frame.children!.find(route => route.path === '/projects/:id/advanced')!
  return advanced.children!
}

describe('the Advanced frame gates every page it registers', () => {
  it('redirects every registered page the sidebar does not offer, and keeps only Details and Security without privileges', () => {
    const bare = instance([])
    const alwaysOffered = new Set(['details', 'security'])
    const ungated: string[] = []
    for (const child of advancedChildren()) {
      const path = String(child.path).replace(':id', '7')
      const segment = path.slice(path.lastIndexOf('/') + 1)
      const section = typeof child.meta?.advancedHostingSection === 'string' ? child.meta.advancedHostingSection : undefined
      const target = hiddenInstancePageRedirect(path, '7', bare, true) ?? hiddenHostingSectionRedirect(path, '7', section, bare, true)
      const expected = alwaysOffered.has(segment) ? null : DETAILS
      if (target !== expected) {
        ungated.push(segment)
      }
    }
    expect(ungated).toEqual([])
  })

  it('names every sidebar item after its route segment, so the guard compares the same key the route carries', () => {
    const wordpress = instance(
      [P.COPY_INSTANCE, P.MANAGE_CLOUDFLARE, P.MANAGE_EDGE_CACHE, P.MANAGE_CDN, P.MANAGE_AUTO_UPDATE, P.MANAGE_DEBUG_MODE, P.MANAGE_MCP,
        P.MANAGE_GIT, P.MANAGE_CONFIG, P.MANAGE_WORDPRESS_USERS, P.MANAGE_GENERAL_USERS, P.MANAGE_THEMES, P.VIEW_LOGS,
        P.MANAGE_FILE_MANAGER, P.MANAGE_DOMAINS, P.MANAGE_FTP, P.MANAGE_SFTP, P.MANAGE_MYSQL, P.MANAGE_CRON],
      { type: 'wordpress', hosting_server_type: 'wp-cloud', cdn_enabled: true, service_has_dns_cloudflare: true, domain_has_dns_zone: true },
    )
    const container = instance([P.MANAGE_GIT, P.MANAGE_ENV_FILE, P.VIEW_LOGS, P.MANAGE_CONTAINERS], { is_container: true })
    const segments = new Set(advancedChildren().map(child => String(child.path).replace(':id', '7').slice('/projects/7/advanced/'.length)))
    const mismatched = [wordpress, container]
      .flatMap(source => advancedSidebarItems(source, '/projects', true))
      .filter(item => item.to.split('/').pop() !== item.key || !segments.has(item.key))
      .map(item => item.key)
    expect(mismatched).toEqual([])
  })
})
