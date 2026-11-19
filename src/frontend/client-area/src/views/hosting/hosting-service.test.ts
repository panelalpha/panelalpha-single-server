import { describe, expect, it } from 'vitest'
import { hasAnyHostingPrivilege, hasPrivilege } from './hosting-privileges'
import { hiddenHostingPageRedirect, isServiceServerPage, needsSummaryRedirect, needsUsageRedirect, resolveRequestedService, selectService, sortServices } from './hosting-service'
import { sidebarItems } from './hosting-sidebar-items'
import { makeService } from './hosting.fixtures'
import { hostingRoutes } from './hosting.routes'

describe('hosting-privileges', () => {
  it('reads privileges from the holder, a missing list is empty', () => {
    expect(hasPrivilege({ privileges: ['hosting.manage_ftp'] }, 'hosting.manage_ftp')).toBe(true)
    expect(hasPrivilege({ privileges: ['hosting.manage_ftp'] }, 'hosting.manage_cron')).toBe(false)
    expect(hasPrivilege({}, 'hosting.manage_ftp')).toBe(false)
    expect(hasPrivilege(null, 'hosting.manage_ftp')).toBe(false)
  })

  it('hasAnyHostingPrivilege needs one hosting.* entry', () => {
    expect(hasAnyHostingPrivilege({ privileges: ['general.manage_labels', 'hosting.manage_dns'] })).toBe(true)
    expect(hasAnyHostingPrivilege({ privileges: ['general.manage_labels'] })).toBe(false)
    expect(hasAnyHostingPrivilege({})).toBe(false)
  })
})

describe('sortServices', () => {
  it('maps server accounts and names the service', () => {
    const { services } = sortServices([
      makeService({
        server_accounts: [{
          id: 11,
          domain: 'example.com',
          details: { homedir: '/home/example', mysql_db_prefix: 'example_', ip_address: '192.0.2.1' },
          main_domain_nameservers: ['ns1.example.com'],
        }],
      }),
    ])

    expect(services[0]!.name).toBe('Pro - example.com')
    expect(services[0]!.server_accounts[0]).toMatchObject({
      homedir: '/home/example/',
      mysql_db_prefix: 'example_',
      nameservers: ['ns1.example.com'],
      ip_address: '192.0.2.1',
    })
  })

  it('keeps only active services with accounts and a hosting privilege; the last suspended or cancelled one wins', () => {
    const sorted = sortServices([
      makeService({ id: 1 }),
      makeService({ id: 2, status: 'suspended' }),
      makeService({ id: 3, status: 'cancelled' }),
      makeService({ id: 4, server_accounts: [] }),
      makeService({ id: 5, status: 'pending' }),
      makeService({ id: 6, privileges: ['general.manage_labels'] }),
      makeService({ id: 7 }),
    ])

    expect(sorted.services.map(service => service.id)).toEqual([1, 7])
    expect(sorted.suspended?.id).toBe(3)
    expect(sorted.all).toHaveLength(7)
  })
})

describe('selectService', () => {
  const sorted = sortServices([
    makeService({ id: 1 }),
    makeService({ id: 2, status: 'suspended' }),
    makeService({ id: 3 }),
  ])

  it('selects the first service without a requested id', () => {
    expect(selectService(sorted, null)?.id).toBe(1)
    expect(selectService(sorted, '')?.id).toBe(1)
  })

  it('selects the requested one, comparing ids loosely', () => {
    expect(selectService(sorted, 3)?.id).toBe(3)
    expect(selectService(sorted, '3')?.id).toBe(3)
  })

  it('falls back to the first service for an unknown id', () => {
    expect(selectService(sorted, 99)?.id).toBe(1)
  })

  it('searches the unfiltered list (quirk: a suspended id selects the suspended service)', () => {
    expect(selectService(sorted, 2)?.id).toBe(2)
  })

  it('selects nothing when no service is offered', () => {
    expect(selectService(sortServices([makeService({ status: 'suspended' })]), 1)).toBeNull()
  })
})

describe('resolveRequestedService', () => {
  it('prefers params, then session, then the query', () => {
    expect(resolveRequestedService({ fromParams: 5, fromSession: 6, fromQuery: '7' })).toEqual({ id: 5, consumeQuery: false })
    expect(resolveRequestedService({ fromSession: 6, fromQuery: '7' })).toEqual({ id: 6, consumeQuery: false })
    expect(resolveRequestedService({ fromQuery: '7' })).toEqual({ id: '7', consumeQuery: true })
    expect(resolveRequestedService({})).toEqual({ id: null, consumeQuery: false })
  })
})

describe('needsSummaryRedirect', () => {
  const service = makeService({
    privileges: ['hosting.manage_domains', 'hosting.phpmyadmin_sso'],
    plan_settings: { dns_management_enabled: true },
  })

  it('does not redirect on pages without a rule (Summary, Usage)', () => {
    expect(needsSummaryRedirect('/hosting/summary', makeService({ privileges: [] }))).toBe(false)
    expect(needsSummaryRedirect('/hosting/usage', makeService({ privileges: [] }))).toBe(false)
  })

  it('redirects from a page the new service has no privilege for', () => {
    expect(needsSummaryRedirect('/hosting/domains', service)).toBe(false)
    expect(needsSummaryRedirect('/hosting/ftp', service)).toBe(true)
    expect(needsSummaryRedirect('/hosting/sftp', service)).toBe(true)
    expect(needsSummaryRedirect('/hosting/cron', service)).toBe(true)
    expect(needsSummaryRedirect('/hosting/file-manager', service)).toBe(true)
  })

  it('databases need MySQL or phpMyAdmin SSO', () => {
    expect(needsSummaryRedirect('/hosting/databases', service)).toBe(false)
    expect(needsSummaryRedirect('/hosting/databases', makeService({ privileges: ['hosting.manage_ftp'] }))).toBe(true)
  })

  it('DNS needs the DNS server, the privilege and plan DNS management', () => {
    const dns = makeService({ privileges: ['hosting.manage_dns'], dns_server_enabled: true, plan_settings: { dns_management_enabled: true } })
    expect(needsSummaryRedirect('/hosting/dns', dns)).toBe(false)
    expect(needsSummaryRedirect('/hosting/dns', { ...dns, dns_server_enabled: false })).toBe(true)
    expect(needsSummaryRedirect('/hosting/dns', { ...dns, plan_settings: { dns_management_enabled: false } })).toBe(true)
    expect(needsSummaryRedirect('/hosting/dns', { ...dns, privileges: [] })).toBe(true)
  })

  it('both email pages need the email server and the privilege', () => {
    const email = makeService({ privileges: ['hosting.manage_email'], email_server_enabled: true })
    expect(needsSummaryRedirect('/hosting/email-addresses', email)).toBe(false)
    expect(needsSummaryRedirect('/hosting/email-forwarders', email)).toBe(false)
    expect(needsSummaryRedirect('/hosting/email-addresses', { ...email, email_server_enabled: false })).toBe(true)
    expect(needsSummaryRedirect('/hosting/email-forwarders', { ...email, privileges: [] })).toBe(true)
  })
})

describe('needsSummaryRedirect, email addresses page', () => {
  it('redirects from /hosting/email-addresses when the service has no hosting privilege', () => {
    const email = makeService({ privileges: ['hosting.manage_email'], email_server_enabled: true })
    expect(needsSummaryRedirect('/hosting/email-addresses', { ...email, privileges: [] })).toBe(true)
  })
})

describe('needsUsageRedirect', () => {
  it('does not redirect on Usage and Summary', () => {
    expect(needsUsageRedirect('/hosting/usage')).toBe(false)
    expect(needsUsageRedirect('/hosting/summary')).toBe(false)
  })

  it('redirects from any other hosting page', () => {
    expect(needsUsageRedirect('/hosting/ftp')).toBe(true)
    expect(needsUsageRedirect('/hosting/domains')).toBe(true)
    expect(needsUsageRedirect('/hosting/containers')).toBe(true)
  })
})

describe('isServiceServerPage', () => {
  it('is true for the DNS and e-mail pages', () => {
    expect(isServiceServerPage('/hosting/dns')).toBe(true)
    expect(isServiceServerPage('/hosting/email-addresses')).toBe(true)
    expect(isServiceServerPage('/hosting/email-forwarders')).toBe(true)
  })

  it('is false for the other pages', () => {
    expect(isServiceServerPage('/hosting/ftp')).toBe(false)
    expect(isServiceServerPage('/hosting/usage')).toBe(false)
    expect(isServiceServerPage('/hosting/summary')).toBe(false)
  })
})

describe('needsSummaryRedirect: email-forwarders', () => {
  const email = makeService({ privileges: ['hosting.manage_email'], email_server_enabled: true })

  it('redirects to Summary when the email server is disabled', () => {
    expect(needsSummaryRedirect('/hosting/email-forwarders', { ...email, email_server_enabled: false })).toBe(true)
  })
})

describe('hiddenHostingPageRedirect: the sidebar decides every My Server page', () => {
  // What a single-server (Free) service answers: no DNS and no e-mail server, and no privilege for the sections that live in a project.
  const free = makeService({ privileges: [] })

  it('single-server: a page the menu does not offer goes to Usage', () => {
    for (const page of ['domains', 'cron', 'ftp', 'sftp', 'databases', 'file-manager', 'email-addresses', 'email-forwarders', 'dns']) {
      expect([page, hiddenHostingPageRedirect(`/hosting/${page}`, free, true)]).toEqual([page, '/hosting/usage'])
    }
  })

  it('single-server: keeps Usage and the pages with their own entry rule', () => {
    for (const path of ['/hosting/usage', '/hosting/usage/', '/hosting/summary', '/hosting/containers']) {
      expect([path, hiddenHostingPageRedirect(path, free, true)]).toEqual([path, null])
    }
  })

  it('single-server: keeps the server pages the service offers, with or without a trailing slash', () => {
    const email = makeService({ privileges: ['hosting.manage_email'], email_server_enabled: true })
    expect(hiddenHostingPageRedirect('/hosting/email-addresses/', email, true)).toBeNull()
    expect(hiddenHostingPageRedirect('/hosting/email-forwarders', email, true)).toBeNull()
    const dns = makeService({ privileges: ['hosting.manage_dns'], dns_server_enabled: true, plan_settings: { dns_management_enabled: true } })
    expect(hiddenHostingPageRedirect('/hosting/dns', dns, true)).toBeNull()
    // The plan has no DNS management: the sidebar drops the page, so the redirect does too.
    expect(hiddenHostingPageRedirect('/hosting/dns', makeService({ privileges: ['hosting.manage_dns'], dns_server_enabled: true }), true)).toBe('/hosting/usage')
  })

  it('multi-server keeps the service privilege rule', () => {
    expect(hiddenHostingPageRedirect('/hosting/ftp', makeService({ privileges: [] }), false)).toBe('/hosting/summary')
    expect(hiddenHostingPageRedirect('/hosting/ftp', makeService({ privileges: ['hosting.manage_ftp'] }), false)).toBeNull()
  })

  it('does not touch a path that is no page of the frame', () => {
    expect(hiddenHostingPageRedirect('/hosting/', free, true)).toBeNull()
    expect(hiddenHostingPageRedirect('/hosting/ftp/extra', free, true)).toBeNull()
    expect(hiddenHostingPageRedirect('/projects/1/general', free, true)).toBeNull()
  })
})

describe('the My Server frame gates every page it registers', () => {
  it('redirects every page the single-server sidebar does not offer, and only those', () => {
    const free = makeService({ privileges: [] })
    const owned = new Set(['usage', 'summary', 'containers'])
    const offered = new Set(sidebarItems(free, { singleServer: true, emailRecordsDot: false }).map(item => item.to))
    const wrong: string[] = []
    const children = hostingRoutes.find(route => route.name === 'hosting')!.children!
    for (const child of children) {
      const path = String(child.path)
      const segment = path.slice(path.lastIndexOf('/') + 1)
      const expected = owned.has(segment) || offered.has(path) ? null : '/hosting/usage'
      const target = hiddenHostingPageRedirect(path, free, true)
      if (target !== expected) {
        wrong.push(`${segment}: ${String(target)}`)
      }
    }
    expect(wrong).toEqual([])
  })
})
