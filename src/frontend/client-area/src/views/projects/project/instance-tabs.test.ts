import type { InstanceTabsSource } from './instance-tabs'
import { describe, expect, it } from 'vitest'
import { PRIVILEGES } from '@/entities/privileges/privileges'
import {
  activeInstanceTab,
  advancedChip,
  backupChip,
  buildInstanceTabs,
  hostingLinkTo,
  pluginsChip,
  showHostingLink,
} from './instance-tabs'

/** A healthy live WordPress instance: a recent automatic backup, no plugin updates, no maintenance. */
function source (overrides: Partial<InstanceTabsSource> = {}): InstanceTabsSource {
  return {
    id: 1,
    staging: false,
    debugMode: false,
    maintenanceMode: false,
    backup_details: [{ id: 1 }],
    info: { plugins: { errors: 0 } },
    health_checks: { report_provider: { status: 'ok', message: null } },
    hasAutomaticBackup: () => true,
    hasRecentBackup: () => true,
    shouldHaveRecentBackup: () => true,
    ...overrides,
  }
}

const instance = source()
const live = { spaBase: '/instances', reportProviderEnabled: true } as const
function keys (privileges: readonly string[], src: InstanceTabsSource = instance) {
  return buildInstanceTabs(src, privileges, live).map(tab => tab.key)
}
function chipOf (privileges: readonly string[], key: string, src: InstanceTabsSource = instance) {
  return buildInstanceTabs(src, privileges, live).find(tab => tab.key === key)?.chip
}

describe('buildInstanceTabs', () => {
  it('always has Site details and Advanced', () => {
    expect(keys([])).toEqual(['general', 'advanced'])
  })

  it('keeps legacy order with every privilege', () => {
    expect(keys([PRIVILEGES.VIEW_REPORTS, PRIVILEGES.MANAGE_BACKUPS, PRIVILEGES.MANAGE_PLUGINS]))
      .toEqual(['general', 'monitoring', 'backups', 'plugins', 'advanced'])
  })

  it('hides Monitoring without the report provider even with the privilege', () => {
    const tabs = buildInstanceTabs(instance, [PRIVILEGES.VIEW_REPORTS], { ...live, reportProviderEnabled: false })
    expect(tabs.map(tab => tab.key)).toEqual(['general', 'advanced'])
  })

  it('hides Monitoring without the view-reports privilege', () => {
    expect(keys([])).not.toContain('monitoring')
  })

  it('builds paths under the single-server base', () => {
    const tabs = buildInstanceTabs(source({ id: 41 }), [PRIVILEGES.MANAGE_BACKUPS], { spaBase: '/projects', reportProviderEnabled: false })
    expect(tabs.map(tab => tab.to)).toEqual(['/projects/41/general', '/projects/41/backups', '/projects/41/advanced'])
  })

  it('uses legacy label keys', () => {
    expect(buildInstanceTabs(instance, [], live)[0]?.labelKey).toBe('heading.instance.tab.siteDetails')
  })

  it('has no chip on Site details', () => {
    expect(buildInstanceTabs(instance, [], live)[0]?.chip).toBeUndefined()
  })
})

describe('monitoring chip', () => {
  const priv = [PRIVILEGES.VIEW_REPORTS]

  it('is absent while the report provider is ok', () => {
    expect(chipOf(priv, 'monitoring')).toBeUndefined()
  })

  it('warns on an unknown status without an action', () => {
    const chip = chipOf(priv, 'monitoring', source({ health_checks: { report_provider: { status: 'unknown' } } }))
    expect(chip).toMatchObject({ tone: 'warning', icon: '$alertwarning', action: undefined })
    expect(chip?.tooltip).toEqual([{ key: 'tooltip.instance.tab.monitoring.warning' }])
  })

  it('opens the tracking code on an error status, with the provider message', () => {
    const chip = chipOf(priv, 'monitoring', source({ health_checks: { report_provider: { status: 'error', message: 'Missing code' } } }))
    expect(chip?.action).toBe('report-provider-code')
    expect(chip?.tooltip).toEqual([{ text: 'Missing code' }])
  })
})

describe('backups chip', () => {
  const priv = [PRIVILEGES.MANAGE_BACKUPS]

  it('is success with a recent backup and an automatic schedule', () => {
    expect(chipOf(priv, 'backups')).toMatchObject({ tone: 'success', icon: '$alertok' })
    expect(chipOf(priv, 'backups')?.tooltip).toEqual([{ key: 'tooltip.instance.tab.backup.recent' }])
  })

  it('says scheduled when no backup exists yet', () => {
    const chip = backupChip(source({ backup_details: [] }))
    expect(chip.tooltip).toEqual([{ key: 'tooltip.instance.tab.backup.scheduled' }])
  })

  it('is an error when a recent backup is due and missing', () => {
    const chip = backupChip(source({ hasAutomaticBackup: () => true, hasRecentBackup: () => false, shouldHaveRecentBackup: () => true }))
    expect(chip).toMatchObject({ tone: 'error', icon: '$alertwarning' })
    expect(chip.tooltip).toEqual([{ key: 'tooltip.instance.tab.backup.empty' }])
  })

  it('is a warning with both lines when automatic backup is off and none is recent', () => {
    const chip = backupChip(source({ hasAutomaticBackup: () => false, hasRecentBackup: () => false, shouldHaveRecentBackup: () => false }))
    expect(chip.tone).toBe('warning')
    expect(chip.tooltip).toEqual([
      { key: 'tooltip.instance.tab.backup.empty' },
      { key: 'tooltip.instance.tab.backup.disabled' },
    ])
  })

  it('says no backup store is set up, with the Settings line on a Free panel, instead of "enable automatic backups"', () => {
    const off = source({ hasAutomaticBackup: () => false, hasRecentBackup: () => false, shouldHaveRecentBackup: () => true })
    const chip = backupChip(off, { missing: true, freePanel: true })
    expect(chip).toMatchObject({ tone: 'error', icon: '$alertwarning' })
    expect(chip.tooltip.map(line => 'key' in line && line.key)).toEqual(['message.backup.noStore.tabTitle', 'message.backup.noStore.tabSettings'])
    expect(chip.tooltip[0]).toMatchObject({ strong: true })
  })

  it('points to the provider without a backup store when the panel is not Free', () => {
    const off = source({ hasAutomaticBackup: () => false, hasRecentBackup: () => false, shouldHaveRecentBackup: () => false })
    const chip = backupChip(off, { missing: true })
    expect(chip.tone).toBe('warning')
    expect(chip.tooltip.map(line => 'key' in line && line.key)).toEqual(['message.backup.noStore.tabTitle', 'message.backup.noStore.contactProvider'])
  })

  it('passes the missing store from the flags to the Backups tab', () => {
    const off = source({ hasAutomaticBackup: () => false, hasRecentBackup: () => false })
    const tab = buildInstanceTabs(off, priv, { spaBase: '/instances', reportProviderEnabled: false, backupStoreMissing: true, freePanel: true })
      .find(item => item.key === 'backups')
    expect(tab?.chip?.tooltip[0]).toMatchObject({ key: 'message.backup.noStore.tabTitle' })
  })
})

describe('plugins chip', () => {
  it('is success without updates', () => {
    expect(pluginsChip(source())).toMatchObject({ tone: 'success', icon: '$alertok' })
  })

  it('counts the updates in error', () => {
    const chip = pluginsChip(source({ info: { plugins: { errors: 3 } } }))
    expect(chip).toMatchObject({ tone: 'error', icon: '$alertwarning', count: 3 })
    expect(chip.tooltip).toEqual([{ key: 'tooltip.instance.tab.plugins.update', params: { count: 3 } }])
  })
})

describe('advanced chip', () => {
  it('is absent in the normal mode', () => {
    expect(advancedChip(source())).toBeUndefined()
  })

  it('names the debug and maintenance modes', () => {
    expect(advancedChip(source({ debugMode: true }))?.tooltip).toEqual([
      { key: 'tooltip.instance.tab.advanced.mode', paramKeys: { mode: 'tooltip.instance.tab.advanced.mode.debug' } },
    ])
    expect(advancedChip(source({ maintenanceMode: true }))?.tooltip).toEqual([
      { key: 'tooltip.instance.tab.advanced.mode', paramKeys: { mode: 'tooltip.instance.tab.advanced.mode.maintenance' } },
    ])
    expect(advancedChip(source({ debugMode: true, maintenanceMode: true }))?.tooltip).toEqual([
      { key: 'tooltip.instance.tab.advanced.mode', paramKeys: { mode: 'tooltip.instance.tab.advanced.mode.debugAndMaintenance' } },
    ])
  })

  it('is absent on a staging copy even in maintenance mode', () => {
    expect(advancedChip(source({ maintenanceMode: true, staging: true }))).toBeUndefined()
    expect(buildInstanceTabs(source({ maintenanceMode: true, staging: true }), [], live).find(tab => tab.key === 'advanced')?.chip).toBeUndefined()
  })

  it('is attached to the Advanced tab on a live instance', () => {
    expect(chipOf([], 'advanced', source({ maintenanceMode: true }))?.tone).toBe('error')
  })
})

describe('hosting link gates', () => {
  it('is shown only with the privilege and above the small breakpoint', () => {
    expect(showHostingLink(false, true)).toBe(true)
    expect(showHostingLink(true, true)).toBe(false)
    expect(showHostingLink(false, false)).toBe(false)
    expect(showHostingLink(false, true, true)).toBe(false)
  })

  it('links to the hosting summary by service id', () => {
    expect(hostingLinkTo(77)).toBe('/hosting/summary?id=77')
  })
})

describe('activeInstanceTab', () => {
  const tabs = buildInstanceTabs(instance, [PRIVILEGES.MANAGE_BACKUPS], live)

  it('matches the tab path and everything below it', () => {
    expect(activeInstanceTab('/instances/1/general', tabs)).toBe('general')
    expect(activeInstanceTab('/instances/1/backups/42', tabs)).toBe('backups')
  })

  it('does not match a sibling that only shares a prefix', () => {
    expect(activeInstanceTab('/instances/10/general', tabs)).toBeNull()
    expect(activeInstanceTab('/instances/1/generalx', tabs)).toBeNull()
  })

  it('ignores a trailing slash', () => {
    expect(activeInstanceTab('/instances/1/advanced/', tabs)).toBe('advanced')
  })
})
