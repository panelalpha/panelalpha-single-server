import type { InstanceHealthChecks } from '@/entities/project/instance-resource'
import { checkPrivilege, PRIVILEGES } from '@/entities/privileges/privileges'
import { backupStoreMissingTooltip } from '@/entities/project/ui/backups/backup-store-missing'

// The tabs of the instance page. The gates are the legacy `v-if`s, in their order. The chips are computed here from the instance data, so the gates are testable without mounting the view.

export type InstanceTabKey = 'general' | 'monitoring' | 'backups' | 'plugins' | 'advanced'

export type InstanceTabChipTone = 'success' | 'warning' | 'error'

/**
 * One line of a chip tooltip: a legacy i18n key (`paramKeys` names the params that are i18n keys, translated before interpolation),
 * or a raw text (the report provider message).
 */
export type InstanceTabTooltipLine
  = | { key: string, params?: Record<string, number | string>, paramKeys?: Record<string, string>, strong?: boolean }
    | { text: string }

export interface InstanceTabChip {
  tone: InstanceTabChipTone
  icon: '$alertok' | '$alertwarning'
  /** Shown before the icon: the plugin update count, with the error tone. */
  count?: number
  tooltip: InstanceTabTooltipLine[]
  /** The Monitoring chip opens the tracking code modal, and only when the report provider is in error. */
  action?: 'report-provider-code'
}

export interface InstanceTab {
  key: InstanceTabKey
  /** A path (`/instances/:id/backups`, `/projects/:id/backups` under single server), not a route name: `router.resolve` throws on an unknown name. */
  to: string
  /** Legacy i18n key of the label. */
  labelKey: string
  chip?: InstanceTabChip
}

export interface InstanceTabsFlags {
  /** `/projects` under single server (app-lite, `preferredSpaBase`), `/instances` otherwise. */
  spaBase: '/projects' | '/instances'
  /** `home.app.integrations.report_provider_enabled`. */
  reportProviderEnabled: boolean
  /** No backup store is set up (`isBackupStoreMissing`); unknown or not asked is `false`. */
  backupStoreMissing?: boolean
  /** `home.app.community_panel`: only a Free panel sets the backup store in Settings. */
  freePanel?: boolean
}

/** What the tabs read from the instance; `InstanceResource` satisfies it. */
export interface InstanceTabsSource {
  id: number | string
  staging?: boolean
  debugMode: boolean
  maintenanceMode: boolean
  backup_details: ArrayLike<unknown>
  info: { plugins: { errors: number } }
  health_checks?: InstanceHealthChecks | null
  hasAutomaticBackup: () => boolean
  hasRecentBackup: () => boolean
  shouldHaveRecentBackup: () => boolean
}

/** The report provider is in error or unknown. */
export function hasReportProviderWarning (health: InstanceHealthChecks | null | undefined): boolean {
  const status = health?.report_provider?.status
  return status === 'error' || status === 'unknown'
}

/** The Monitoring chip: a warning with the report provider message, or the generic one. */
export function monitoringChip (health: InstanceHealthChecks | null | undefined): InstanceTabChip {
  const provider = health?.report_provider
  const message = provider?.message
  return {
    tone: 'warning',
    icon: '$alertwarning',
    tooltip: [message ? { text: message } : { key: 'tooltip.instance.tab.monitoring.warning' }],
    action: provider?.status === 'error' ? 'report-provider-code' : undefined,
  }
}

/**
 * The Backups chip: success when an automatic backup is on and a recent one exists; else error or warning by the rule. Without a backup
 * store the tooltip says so instead of the legacy lines, whose advice (enable automatic backups) cannot be followed then.
 */
export function backupChip (instance: InstanceTabsSource, store: { missing?: boolean, freePanel?: boolean } = {}): InstanceTabChip {
  if (instance.hasAutomaticBackup() && instance.hasRecentBackup()) {
    return {
      tone: 'success',
      icon: '$alertok',
      tooltip: [{ key: instance.backup_details.length > 0 ? 'tooltip.instance.tab.backup.recent' : 'tooltip.instance.tab.backup.scheduled' }],
    }
  }
  const tone = instance.shouldHaveRecentBackup() ? 'error' : 'warning'
  if (store.missing) {
    return {
      tone,
      icon: '$alertwarning',
      tooltip: backupStoreMissingTooltip('tab', store.freePanel === true)
        .map(line => ({ key: line.key, params: { defaultValue: line.defaultValue }, strong: line.strong })),
    }
  }
  const tooltip: InstanceTabTooltipLine[] = []
  if (!instance.hasRecentBackup()) {
    tooltip.push({ key: 'tooltip.instance.tab.backup.empty' })
  }
  if (!instance.hasAutomaticBackup()) {
    tooltip.push({ key: 'tooltip.instance.tab.backup.disabled' })
  }
  return { tone, icon: '$alertwarning', tooltip }
}

/** The Plugins chip: the update count with the error tone, else the success mark. */
export function pluginsChip (instance: InstanceTabsSource): InstanceTabChip {
  const errors = instance.info.plugins.errors
  if (errors) {
    return {
      tone: 'error',
      icon: '$alertwarning',
      count: errors,
      tooltip: [{ key: 'tooltip.instance.tab.plugins.update', params: { count: errors } }],
    }
  }
  return { tone: 'success', icon: '$alertok', tooltip: [{ key: 'tooltip.instance.tab.plugins.noUpdate' }] }
}

/** The Advanced chip: debug and/or maintenance mode on, and never on a staging copy. */
export function advancedChip (instance: InstanceTabsSource): InstanceTabChip | undefined {
  if (!(instance.debugMode || instance.maintenanceMode) || instance.staging) {
    return undefined
  }
  let modeKey = 'tooltip.instance.tab.advanced.mode.maintenance'
  if (instance.debugMode && instance.maintenanceMode) {
    modeKey = 'tooltip.instance.tab.advanced.mode.debugAndMaintenance'
  } else if (instance.debugMode) {
    modeKey = 'tooltip.instance.tab.advanced.mode.debug'
  }
  return {
    tone: 'error',
    icon: '$alertwarning',
    tooltip: [{ key: 'tooltip.instance.tab.advanced.mode', paramKeys: { mode: modeKey } }],
  }
}

/**
 * The tabs of the instance page for the privileges of the instance, each with its chip. Site details and Advanced are always there;
 * Monitoring needs the report provider and `general.view_reports`; Backups and Plugins need their own privilege. A page that is not
 * ported yet answers 404 until its slice lands; that is an accepted transition state.
 */
export function buildInstanceTabs (
  instance: InstanceTabsSource,
  privileges: readonly string[] | null | undefined,
  flags: InstanceTabsFlags,
): InstanceTab[] {
  const base = `${flags.spaBase}/${instance.id}`
  const tabs: InstanceTab[] = [
    { key: 'general', to: `${base}/general`, labelKey: 'heading.instance.tab.siteDetails' },
  ]
  if (flags.reportProviderEnabled && checkPrivilege(privileges, PRIVILEGES.VIEW_REPORTS)) {
    const monitoring: InstanceTab = { key: 'monitoring', to: `${base}/monitoring`, labelKey: 'heading.instance.tab.monitoring' }
    if (hasReportProviderWarning(instance.health_checks)) {
      monitoring.chip = monitoringChip(instance.health_checks)
    }
    tabs.push(monitoring)
  }
  if (checkPrivilege(privileges, PRIVILEGES.MANAGE_BACKUPS)) {
    tabs.push({ key: 'backups', to: `${base}/backups`, labelKey: 'heading.instance.tab.backups', chip: backupChip(instance, { missing: flags.backupStoreMissing, freePanel: flags.freePanel }) })
  }
  if (checkPrivilege(privileges, PRIVILEGES.MANAGE_PLUGINS)) {
    tabs.push({ key: 'plugins', to: `${base}/plugins`, labelKey: 'heading.instance.tab.plugins', chip: pluginsChip(instance) })
  }
  const advanced: InstanceTab = { key: 'advanced', to: `${base}/advanced`, labelKey: 'heading.instance.tab.advanced' }
  const advancedWarning = advancedChip(instance)
  if (advancedWarning) {
    advanced.chip = advancedWarning
  }
  tabs.push(advanced)
  return tabs
}

/**
 * The Hosting link after the tabs: shown below `md` only when the screen is not small and the instance has any hosting privilege.
 * Hidden on single-server: My server
 * there is not a per-project hosting page, so the link is only noise.
 */
export function showHostingLink (smAndDown: boolean, hasAnyHostingPrivilege: boolean, singleServer = false): boolean {
  return !singleServer && !smAndDown && hasAnyHostingPrivilege
}

/** The Hosting link target. The legacy tabs read `service_id` here; the desktop top bar reads `hostingId`, kept as in legacy. */
export function hostingLinkTo (serviceId: unknown): string {
  return `/hosting/summary?id=${serviceId}`
}

/**
 * The tab the page is on, for `v-tabs :model-value` (V4 force-selects the first tab without a model).
 * A tab matches its own path and everything below it, as the legacy `router-link` active class did.
 */
export function activeInstanceTab (path: string, tabs: InstanceTab[]): InstanceTabKey | null {
  const normalized = path.length > 1 ? path.replace(/\/+$/, '') : path
  for (const tab of tabs) {
    if (normalized === tab.to || normalized.startsWith(`${tab.to}/`)) {
      return tab.key
    }
  }
  return null
}
