import type { RawInstance } from './instance-resource'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { collectInstanceIssues } from '@/entities/project/ui/status-issues/collect-instance-issues'
import { buildScreenshotUrl, planHasCdn, toInstanceResource } from './instance-resource'

const NOW = new Date('2026-10-05T12:00:00.000Z')
const UNIX_NOW = Math.floor(NOW.getTime() / 1000)

function raw (overrides: Partial<RawInstance> = {}): RawInstance {
  return {
    id: 7,
    type: 'wordpress',
    name: 'Acme',
    url: 'https://acme.example.com',
    domain: 'acme.example.com',
    service_status: 'active',
    service_created_at: '2026-06-01T00:00:00.000Z',
    staging: false,
    staging_apps: [],
    labels: [{ title: 'Prod', color: '#07C07E' }],
    screenshot_time: UNIX_NOW - 60,
    stats: {
      visitors: { unique: 1280, unique_lastmonth: 1000 },
      bandwidth: { usage: 5_368_709_120, maximum: 107_374_182_400 },
      storage: { usage: 1_073_741_824, maximum: -1 },
    },
    created_at: '2026-08-26T12:00:00.000Z',
    version: '6.5.0',
    update_details: { available_updates: [] },
    backup_details: [],
    plugin_details: [],
    has_automatic_backup: true,
    status: 'active',
    async_status: { installation: 'finished' },
    privileges: ['general.manage_labels', 'wordpress.update'],
    shared_access: [],
    server_settings: { uses_own_backup_system: false },
    details: { dns_alerts_enabled: true },
    plan_settings: {},
    ...overrides,
  }
}

describe('toInstanceResource', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('maps the legacy fields', () => {
    const instance = toInstanceResource(raw(), null, { apiBase: '/api' })

    expect(instance.title).toBe('Acme')
    expect(instance.isActive).toBe(true)
    expect(instance.colorScheme).toBe('primary')
    expect(instance.subinstanceLabel).toBe('live')
    expect(instance.labels).toEqual([{ title: 'Prod', color: '#07C07E' }])
    expect(instance.screenshot_url).toBe(`/api/instances/7/screenshot.jpg?time=${UNIX_NOW - 60}`)
    expect(instance.ssl_order_status).toBe('none')
    expect(instance.info.ssl).toBe(true)
  })

  it('has no screenshot url without screenshot_time', () => {
    expect(toInstanceResource(raw({ screenshot_time: null })).screenshot_url).toBe('')
  })

  it('rewrites the screenshot path to projects under single server', () => {
    const home = { app: { single_server: { active: true } } }
    expect(toInstanceResource(raw(), home).screenshot_url).toBe(`/api/projects/7/screenshot.jpg?time=${UNIX_NOW - 60}`)
    expect(buildScreenshotUrl('/api', 3, 9)).toBe('/api/instances/3/screenshot.jpg?time=9')
  })

  it('formats the stats like legacy', () => {
    const { info } = toInstanceResource(raw())
    expect(info.visitors).toEqual({ current: 1280, delta: '28%' })
    expect(info.bandwidth).toEqual({ current: '5 GB', max: '100 GB' })
    expect(info.storage).toEqual({ current: '1 GB', max: '∞' })
  })

  it('shows dashes without stats', () => {
    const { info } = toInstanceResource(raw({ stats: null }))
    expect(info.visitors).toEqual({ current: '-', delta: '-' })
    expect(info.bandwidth).toEqual({ current: '-', max: '-' })
    expect(info.storage).toEqual({ current: '-', max: '-' })
  })

  it('computes the "newest" text from the clock', () => {
    expect(toInstanceResource(raw()).created_at_from_now).toBe('a month ago')
    expect(toInstanceResource(raw({ created_at: '2026-09-25T12:00:00.000Z' })).created_at_from_now).toBe('10 days ago')
  })

  it('maps staging apps and the parent', () => {
    const child = raw({ id: 8, staging: true, name: 'Acme staging', url: 'https://staging.acme.example.com' })
    const instance = toInstanceResource(raw({ staging_apps: [child] }))

    expect(instance.hasStaging()).toBe(true)
    expect(instance.subInstances[0]!.subinstanceLabel).toBe('staging')
    expect(instance.subInstances[0]!.colorScheme).toBe('info')
    expect(instance.hasActiveStaging()).toBe(true)
    expect(toInstanceResource(raw({ parent_app: child })).parentInstance?.id).toBe(8)
  })

  describe('async status', () => {
    it('tells install progress, failure and other actions apart', () => {
      expect(toInstanceResource(raw({ async_status: { installation: 'in_progress' } })).hasInstallInProgress()).toBe(true)
      expect(toInstanceResource(raw({ async_status: { installation: 'pending' } })).hasInstallStatus()).toBe(true)
      expect(toInstanceResource(raw({ async_status: { installation: 'failed' } })).hasInstallFailed()).toBe(true)
      expect(toInstanceResource(raw({ async_status: { installation: 'failed' } })).hasInstallInProgress()).toBe(false)
      expect(toInstanceResource(raw()).hasInstallStatus()).toBe(false)
      expect(toInstanceResource(raw({ async_status: { push_to_live: 'pending' } })).hasActionInProgress()).toBe(true)
      expect(toInstanceResource(raw({ async_status: { update: 'in_progress' } })).hasUpdateInProgress()).toBe(true)
      expect(toInstanceResource(raw({ async_status: null })).hasActionInProgress()).toBe(false)
    })
  })

  describe('backup and status', () => {
    it('is healthy with automatic backup, a recent backup and the latest version', () => {
      const instance = toInstanceResource(raw({ backup_details: [{ id: 1, type: 'automatic' }] }))
      expect(instance.hasAutomaticBackup()).toBe(true)
      expect(instance.hasRecentBackup()).toBe(true)
      expect(instance.status.value).toBe(true)
      expect(collectInstanceIssues(instance)).toEqual([])
    })

    it('counts a finished manual backup from the last day', () => {
      const recent = toInstanceResource(raw({ backup_details: [{ id: 1, type: 'manual', date: UNIX_NOW - 3600, async_status: { create: 'finished' } }] }))
      const old = toInstanceResource(raw({ backup_details: [{ id: 1, type: 'manual', date: UNIX_NOW - 3 * 86_400, async_status: { create: 'finished' } }] }))
      expect(recent.hasRecentBackup()).toBe(true)
      expect(old.hasRecentBackup()).toBe(false)
    })

    it('treats an own backup system as backed up', () => {
      const instance = toInstanceResource(raw({ has_automatic_backup: false, server_settings: { uses_own_backup_system: true } }))
      expect(instance.hasAutomaticBackup()).toBe(true)
      expect(instance.hasRecentBackup()).toBe(true)
    })

    it('reports the backup issue when automatic backup is off', () => {
      const instance = toInstanceResource(raw({ has_automatic_backup: false }))
      expect(instance.status.value).toBe(false)
      expect(collectInstanceIssues(instance).map(issue => issue.code)).toEqual(['backup.attention'])
    })

    it('treats an unknown automatic backup schedule as on (legacy app-lite Instances.js:326-334)', () => {
      const recent = [{ id: 1, type: 'manual', date: UNIX_NOW - 3600, async_status: { create: 'finished' } }]
      const unknown = toInstanceResource(raw({ has_automatic_backup: null, backup_details: recent }))
      expect(unknown.hasAutomaticBackup()).toBe(true)
      expect(unknown.status.backup).toBe(true)
      expect(collectInstanceIssues(unknown).map(issue => issue.code)).not.toContain('backup.attention')

      const { has_automatic_backup: _omit, ...withoutField } = raw()
      expect(toInstanceResource(withoutField as RawInstance).hasAutomaticBackup()).toBe(true)
      expect(toInstanceResource(raw({ has_automatic_backup: true })).hasAutomaticBackup()).toBe(true)
      expect(toInstanceResource(raw({ has_automatic_backup: false })).hasAutomaticBackup()).toBe(false)
    })

    it('reports the backup issue after setAutomaticBackup(false) on an unknown schedule', () => {
      const instance = toInstanceResource(raw({ has_automatic_backup: null, service_created_at: '2026-10-05T10:00:00.000Z' }))
      instance.setAutomaticBackup(false)
      expect(instance.hasAutomaticBackup()).toBe(false)
      expect(collectInstanceIssues(instance).map(issue => issue.code)).toContain('backup.attention')
    })

    it('takes the highest available update as the available version', () => {
      const instance = toInstanceResource(raw({ version: '6.4.0', update_details: { available_updates: ['6.5.0', '6.5.1'] } }))
      expect(instance.status.wordpress).toBe('6.4.0')
      expect(instance.status.wordpress_available).toBe('6.5.1')
      expect(collectInstanceIssues(instance).map(issue => issue.code)).toContain('wordpress.core_outdated')
    })

    it('takes the highest available version by numeric compare across a digit-count boundary', () => {
      const instance = toInstanceResource(raw({ version: '9.9.0', update_details: { available_updates: ['9.9.0', '10.0.0'] } }))
      expect(instance.status.wordpress_available).toBe('10.0.0')
      expect(instance.status.value).toBe(false)

      const reversed = toInstanceResource(raw({ version: '9.0.0', update_details: { available_updates: ['11.3.0', '9.0.0'] } }))
      expect(reversed.status.wordpress_available).toBe('11.3.0')
    })

    it('reads woocommerce and plugin updates from plugin_details', () => {
      const instance = toInstanceResource(raw({
        plugin_details: [
          { name: 'woocommerce', version: '9.0', update_version: '9.1', update: 'available' },
          { name: 'akismet', version: '5', update: 'available' },
        ],
      }))
      expect(instance.status.woocommerce).toBe('9.0')
      expect(instance.status.woocommerce_available).toBe('9.1')
      expect(instance.info.plugins.errors).toBe(2)
    })

    it('follows needs_recent_backup_warning when the API sends it (app-lite)', () => {
      const warned = toInstanceResource(raw({ needs_recent_backup_warning: true }))
      const fine = toInstanceResource(raw({ needs_recent_backup_warning: false }))
      expect(warned.hasRecentBackup()).toBe(false)
      expect(warned.shouldHaveRecentBackup()).toBe(true)
      expect(fine.hasRecentBackup()).toBe(true)
      expect(fine.shouldHaveRecentBackup()).toBe(false)
    })

    it('does not warn about a backup for a service younger than a day (app)', () => {
      const instance = toInstanceResource(raw({ has_automatic_backup: true, service_created_at: '2026-10-05T10:00:00.000Z' }))
      expect(instance.shouldHaveRecentBackup()).toBe(false)
      expect(instance.status.value).toBe(true)
    })
  })

  describe('app-lite fields', () => {
    it('reads app_type before type and keeps source and ssl order status', () => {
      const instance = toInstanceResource(raw({
        type: 'wordpress',
        app_type: 'custom',
        ssl_order_status: 'pending',
        source: { type: 'git' },
        privileges: ['general.redeploy'],
      }))
      expect(instance.type).toBe('custom')
      expect(instance.ssl_order_status).toBe('pending')
      expect(instance.hasRedeployPrivilege()).toBe(true)
      expect(collectInstanceIssues(instance).map(issue => issue.code)).not.toContain('deploy.missing_index')
    })
  })

  describe('isContainer', () => {
    it('is true for a truthy is_container', () => {
      expect(toInstanceResource(raw({ is_container: true })).isContainer).toBe(true)
      expect(toInstanceResource(raw({ is_container: 1 })).isContainer).toBe(true)
    })

    it('is false when is_container is missing, false or null', () => {
      expect(toInstanceResource(raw()).isContainer).toBe(false)
      expect(toInstanceResource(raw({ is_container: false })).isContainer).toBe(false)
      expect(toInstanceResource(raw({ is_container: null })).isContainer).toBe(false)
    })
  })

  describe('privileges', () => {
    it('reads the privilege strings', () => {
      const instance = toInstanceResource(raw())
      expect(instance.hasManageLabelsPrivilege()).toBe(true)
      expect(instance.hasWordPressUpdatePrivilege()).toBe(true)
      expect(instance.hasDeleteInstancePrivilege()).toBe(false)
      expect(toInstanceResource(raw({ privileges: undefined })).hasManageLabelsPrivilege()).toBe(false)
    })
  })

  describe('url and dns helpers', () => {
    it('detects an IP address in the url', () => {
      expect(toInstanceResource(raw({ url: 'http://203.0.113.10' })).hasIpAddressInUrl()).toBe(true)
      expect(toInstanceResource(raw({ url: 'http://[2001:db8::1]' })).hasIpAddressInUrl()).toBe(false)
      expect(toInstanceResource(raw()).hasIpAddressInUrl()).toBe(false)
      expect(toInstanceResource(raw({ url: 'not a url' })).hasIpAddressInUrl()).toBe(false)
    })

    it('prefers CDN A records, then an empty list for a CDN plan, then the host addresses', () => {
      const host = ['203.0.113.10']
      expect(toInstanceResource(raw({ host_ipv4_addresses: host })).getDnsIpv4Addresses()).toEqual(host)
      expect(toInstanceResource(raw({ host_ipv4_addresses: host, plan_settings: { cdn: { provider_slug: 'bunny' } } })).getDnsIpv4Addresses()).toEqual([])
      expect(toInstanceResource(raw({
        host_ipv4_addresses: host,
        plan_settings: { cdn: { provider_slug: 'bunny' } },
        cdn_dns_records: [{ type: 'A', value: '198.51.100.1' }],
      })).getDnsIpv4Addresses()).toEqual(['198.51.100.1'])
      expect(planHasCdn({ plan_settings: { cdn: { provider_slug: 'none' } } })).toBe(false)
    })

    it('stores the detected certificate with the current time', () => {
      const instance = toInstanceResource(raw({ domain_ssl_details: null }))
      instance.setDetectedSslCert({ not_before: '2026-01-01', name_match: true })
      expect(instance.domain_ssl_details?.detected_ssl_cert_checked_time).toBe(UNIX_NOW)
      expect(instance.domain_ssl_details?.detected_ssl_cert?.name_match).toBe(true)
    })

    it('reads and writes the dns alert and resolve flags', () => {
      const instance = toInstanceResource(raw())
      expect(instance.getDnsAlertsEnabled()).toBe(true)
      instance.setDnsAlertsEnabled(false)
      expect(instance.details.dns_alerts_enabled).toBe(false)
      expect(instance.getDnsResolveStatus()).toBeNull()
      instance.setDnsResolveStatus(true)
      expect(instance.getDnsResolveStatus()).toBe(true)
    })
  })

  describe('mutators', () => {
    it('refreshes the screenshot with the current time', () => {
      const instance = toInstanceResource(raw({ screenshot_time: null }))
      instance.refreshScreenshot()
      expect(instance.screenshot_time).toBe(UNIX_NOW)
      expect(instance.screenshot_url).toBe(`/api/instances/7/screenshot.jpg?time=${UNIX_NOW}`)
    })

    it('replaces and removes backups and sub-instances', () => {
      const child = raw({ id: 8, staging: true, url: 'https://s.example.com' })
      const instance = toInstanceResource(raw({ staging_apps: [child], backup_details: [{ id: 1, type: 'manual' }, { id: 2, type: 'manual' }] }))

      instance.setBackupItem({ id: 2, type: 'automatic' })
      expect(instance.backup_details[1]!.type).toBe('automatic')
      instance.unsetBackupItem({ id: 1 })
      expect(instance.backup_details.map(item => item.id)).toEqual([2])
      instance.unsetSubinstance(8)
      expect(instance.hasStaging()).toBe(false)
    })

    it('is new for five minutes', () => {
      expect(toInstanceResource(raw({ created_at: '2026-10-05T11:57:00.000Z' })).isNew()).toBe(true)
      expect(toInstanceResource(raw({ created_at: '2026-10-05T11:50:00.000Z' })).isNew()).toBe(false)
    })
  })
})
