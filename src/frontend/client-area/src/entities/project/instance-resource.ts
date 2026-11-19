/* eslint-disable unicorn/no-this-outside-of-class -- legacy resource methods read `this`: they must stay bound to the (reactive, cloneable) resource object */
import type { InstanceLike } from '@/entities/project/ui/status-issues/issue-registry'
import type { SslCertStatusValue } from '@/entities/ssl/ssl-order-status'
import {
  createInstancePrivilegeMethods,
  type InstancePrivilegeMethods,
} from '@/entities/privileges/instance-privilege-methods'
import { formatBytes } from '@/shared/format/format-bytes'
import { fromNow } from '@/shared/time/from-now'
import { highestVersion } from '@/shared/version/compare-versions'

// Port of the legacy `instanceResource` as a pure mapper. It keeps every
// field and method the list, the kit `StatusIndicator` and the follow-up screens read. Differences from legacy:
// - no `Api.instances().cached` writes (the setters only mutate the resource) and no `$root.$emit('instance-updated')`
//   in `setSharedAccessData` (the caller emits it);
// - `updateSiteName` (an API call) lives in the API module of the screen that uses it;
// - `moment().fromNow()` is `fromNow` from `src/shared/time/from-now.ts`;
// - the lite fields (`ssl_order_status`, `needs_recent_backup_warning`, `needs_backup_attention`, `source`, `app_type`)
//   are read as they come: app payloads do not carry them, so the app behaviour is unchanged.

export type InstanceLabel = {
  title: string
  color?: string
}

export interface SharedAccessEntry {
  email: string
  name?: string
  role: string
  custom_privileges?: string[]
  wordpress_user_id?: number | null
  accepted_at?: string | null
  invited_at?: string | null
  notification_sent_at?: string | null
  resend_available_at?: string | null
}

export interface InstanceOwner {
  name?: string
  email?: string
}

export interface InstanceStats {
  visitors?: { unique?: number | null, unique_lastmonth?: number | null } | null
  bandwidth?: { usage?: number | null, maximum?: number | null } | null
  storage?: { usage?: number | null, maximum?: number | null } | null
}

/** The six limits a client may change: memory in MB, CPU in cores, disk in MB, inodes as a count, device speeds in bytes a second. */
export interface ProjectLimitValues {
  memory_limit: number | null
  cpu_limit: number | null
  disk_space_limit: number | null
  inodes_limit: number | null
  device_read_bps: number | null
  device_write_bps: number | null
}

/** The `resources` block of the project payload: the latest usage sample, the disk measurement, the limits (-1 unlimited, null not set) and the plan ceilings (null no ceiling). */
export interface ProjectResources {
  usage: {
    cpu_percent: number | null
    memory_bytes: number | null
    memory_limit_bytes: number | null
    sampled_at: string | null
  } | null
  disk: {
    total_bytes: number | null
    limit_bytes: number | null
    measured_at: string | null
  } | null
  limits: ProjectLimitValues
  ceilings: ProjectLimitValues
}

export type RawProjectResources = ProjectResources

export interface BackupDetail {
  [key: string]: unknown
  id?: number | string
  type?: string
  date?: number
  async_status?: { create?: string | null, restore?: string | null } | null
}

export interface PluginDetail {
  [key: string]: unknown
  name: string
  version?: string
  update?: string | null
  update_version?: string | null
}

export interface DomainSslDetails {
  detected_ssl_cert: {
    [key: string]: unknown
    not_before?: string | number
    status?: SslCertStatusValue
    self_signed?: boolean
    name_match?: boolean
    issuer_name?: string
  } | null
  detected_ssl_cert_checked_time: number
  installed_ssl_cert: unknown
  installed_ssl_cert_checked_time: number
}

/** Fractions 0..1 per strategy; `null` when the report is missing (`LoadingSpeedInfoCard`). */
export interface PerformanceScore {
  desktop: number | null
  mobile: number | null
}

export interface CdnDnsRecord {
  [key: string]: unknown
  type?: string
  value?: string
}

/** `health_checks` of an instance: the report provider (Monitoring tab chip, tracking code modal); the rest passes untouched. */
export interface InstanceHealthChecks {
  [key: string]: unknown
  report_provider?: {
    [key: string]: unknown
    status?: string | null
    message?: string | null
    code?: string | null
  } | null
}

export interface AsyncStatus {
  installation: string | null
  update: string | null
  push_to_live: string | null
  pull_from_staging: string | null
  push_to_staging: string | null
}

/** `plan_settings` of an instance: the fields the screens read; the rest of the plan passes untouched. */
export interface PlanSettings {
  [key: string]: unknown
  copy_instance_allowed?: boolean
  /** Raw API flag: the plan allows the WordPress MCP page (`advanced/wordpress-mcp`). */
  wordpress_mcp_enabled?: boolean
  /** Raw API flag read by the change-domain modal (`SetYourDomainModal`, step 2 transfer). */
  domain_transfer_enabled?: boolean
  /** Raw API flag read by the change-domain modal (`SetYourDomainModal`, step 3 eager DNS verification). */
  eager_domain_dns_verification_enabled?: boolean
}

/** `dns_settings` of an instance: `DnsSslIndicator` reads `display_options`; the rest passes untouched. */
export interface DnsSettings {
  [key: string]: unknown
  display_options?: unknown
}

export type InstanceStatus = {
  value: boolean
  wordpress: string | null | undefined
  wordpress_available: string | null | undefined
  woocommerce: string | null
  woocommerce_available: string | null
  /** A queued install the card shows instead of "Not Installed" until it ends. */
  woocommerce_installing: boolean
  backup: boolean
  backup_recent: boolean
}

/** app-lite `source` of a custom project (`GitSourceInfoCard.vue` / `FilesSourceInfoCard.vue` read these keys). */
export interface InstanceSource {
  type?: string
  repo_name?: string | null
  branch?: string | null
  database?: { present?: boolean, label?: string | null } | null
  last_deploy?: { status?: string | null, finished_at?: string | null, waiting_for_files?: boolean } | null
}

/** The git repository of an instance; `gitPair` reads `connected` of the pair. */
export interface InstanceGitRepository {
  connected: boolean
  id: number
  repo_url: string
  branch: string
  commits_behind: number
  last_deployed_commit_hash: string | null
}

/** The `GET /instances` item as the API sends it. Only the keys the mapper reads are listed; the rest passes untouched. */
export interface RawInstance {
  [key: string]: unknown
  id: number
  type?: string
  app_type?: string
  name?: string
  url: string
  domain?: string
  staging_apps?: RawInstance[] | null
  parent_app?: RawInstance | null
  shared_access?: SharedAccessEntry[]
  owner?: InstanceOwner | null
  owned?: boolean
  privileges?: string[]
  labels?: InstanceLabel[] | null
  screenshot_time?: number | null
  stats?: InstanceStats | null
  resources?: RawProjectResources | null
  created_at?: string
  service_created_at?: string
  backup_details?: BackupDetail[] | null
  plugin_details?: PluginDetail[] | null
  has_automatic_backup?: boolean | null
  automatic_backups_editable?: boolean
  status?: string
  version?: string
  update_details?: { available_updates?: string[] } | null
  async_status?: Partial<AsyncStatus> | null
  details?: Record<string, unknown> | null
  server_settings?: { uses_own_backup_system?: boolean, domain_transfer_allowed?: boolean } | null
  plan_settings?: PlanSettings | null
  dns_settings?: DnsSettings | null
  cdn_enabled?: boolean
  cdn_dns_records?: CdnDnsRecord[] | null
  domain_ssl_details?: DomainSslDetails | null
  domain_zone?: { details?: { configuration_records?: unknown[] } | null } | null
  health_checks?: InstanceHealthChecks | null
  performance_score?: PerformanceScore | null
  host_ipv4_addresses?: string[]
  needs_recent_backup_warning?: boolean
  needs_backup_attention?: boolean
  ssl_order_status?: string | null
  supports_admin_sso?: boolean
  source?: InstanceSource | null
  git_repository?: InstanceGitRepository | null
}

/** What the mapper reads from `/home`: only the single-server flag (app-lite rewrites the screenshot path to `projects`). */
export interface HomeLike {
  app?: { single_server?: { active?: boolean } | null } | null
}

export interface ToInstanceResourceOptions {
  /** The API base URL. */
  apiBase?: string
}

export interface InstanceResource extends InstancePrivilegeMethods, Omit<InstanceLike, keyof InstancePrivilegeMethods> {
  id: number
  type: string | undefined
  title: string | undefined
  url: string
  domain: string | undefined
  ssl_order_status: string
  cdn_enabled: boolean
  cdn_dns_records: CdnDnsRecord[]
  domain_ssl_details: DomainSslDetails | null | undefined
  domain_zone_details: unknown
  dir: unknown
  subInstances: InstanceResource[]
  parentInstance: InstanceResource | null
  sharedAccess: SharedAccessEntry[] | undefined
  owner: InstanceOwner | null | undefined
  owned: boolean | undefined
  privileges: string[] | undefined
  service_id: unknown
  service_status: string | undefined
  service_is_trial: unknown
  service_trial_expiry_at: unknown
  service_created_at: string | undefined
  diagnostic_mode: unknown
  hostingId: unknown
  hostingStatus: unknown
  hostingAccountDetails: unknown
  hostingName: unknown
  /** The project is container-based; only the visibility of the Containers section reads it. */
  isContainer: boolean
  hostingServerType: string | undefined
  staging: boolean | undefined
  colorScheme: 'info' | 'primary'
  subinstanceLabel: 'staging' | 'live'
  labels: InstanceLabel[]
  screenshot_url: string
  screenshot_time: number | null | undefined
  resources: ProjectResources | null
  info: {
    ssl: boolean
    plugins: { errors: number }
    visitors: { current: number | string, delta: string }
    bandwidth: { current: string, max: string }
    storage: { current: string, max: string }
  }
  created_at: string | undefined
  created_at_from_now: string
  theme_details: unknown
  performance_score: PerformanceScore | null | undefined
  backup_details: BackupDetail[]
  plugin_details: PluginDetail[]
  has_automatic_backup: boolean | null | undefined
  isActive: boolean
  service_has_dns: unknown
  service_has_dns_cloudflare: unknown
  install_details: unknown
  import_details: unknown
  details: Record<string, unknown>
  async_status: AsyncStatus
  host_ip_address: string | null | undefined
  host_ipv4_addresses: string[] | undefined
  host_c_names: string[] | undefined
  dns_nameservers: string[] | undefined
  server_settings: { uses_own_backup_system?: boolean, domain_transfer_allowed?: boolean } | null | undefined
  dns_settings: DnsSettings | null | undefined
  dns_resolved_correctly: boolean | null
  onboarding_subdomain: string | null | undefined
  debugMode: boolean
  maintenanceMode: boolean
  /** The API says whether the user may change the automatic backup schedule. */
  automatic_backups_editable: boolean | undefined
  domain_has_dns_zone: unknown
  health_checks: InstanceHealthChecks | null | undefined
  plan_settings: PlanSettings | null | undefined
  plan_name: unknown
  plan_upgrade_link: unknown
  /** `wordpress` says whether the WordPress auto-updates card is shown. */
  auto_updates: { wordpress?: boolean } | null | undefined
  temp_url: unknown
  preview_site: unknown
  service_nameservers: unknown
  /** The engine can open an admin SSO session (the top bar's Admin Area; kebab item). */
  supports_admin_sso: boolean
  git_repository?: InstanceGitRepository | null
  needs_recent_backup_warning: boolean | undefined
  needs_backup_attention: boolean | undefined
  source: InstanceSource | null
  status: InstanceStatus

  hasInstallInProgress: () => boolean
  hasInstallFailed: () => boolean
  hasUpdateInProgress: () => boolean
  hasActionInProgress: () => boolean
  hasInstallStatus: () => boolean
  setSharedAccessData: (data: SharedAccessEntry[]) => void
  setDebugMode: (status: boolean) => void
  setMaintenanceMode: (status: boolean) => void
  unsetSubinstance: (id: number) => void
  setPluginsData: (data: PluginDetail[]) => void
  setWoocommerceInstalling: (installing: boolean) => void
  isNew: () => boolean
  hasAutomaticBackup: () => boolean
  setAutomaticBackup: (enabled: boolean) => void
  hasRecentBackup: () => boolean
  shouldHaveRecentBackup: () => boolean
  setBackupDetails: (data: BackupDetail[]) => void
  setBackupItem: (item: BackupDetail) => void
  unsetBackupItem: (item: BackupDetail) => void
  setPluginItem: (item: PluginDetail) => void
  hasWpCloudServer: () => boolean
  hasStaging: () => boolean
  hasActiveStaging: () => boolean
  refreshScreenshot: () => void
  setDetectedSslCert: (cert: DomainSslDetails['detected_ssl_cert']) => void
  hasIpAddressInUrl: () => boolean
  getDnsIpv4Addresses: () => string[] | undefined
  getDnsAlertsEnabled: () => unknown
  setDnsAlertsEnabled: (value: boolean) => void
  getDnsResolveStatus: () => boolean | null
  setDnsResolveStatus: (value: boolean | null) => void
}

const IN_PROGRESS = new Set(['pending', 'in_progress'])

const IPV4 = /^(?:25[0-5]|2[0-4]\d|1?\d{1,2})(?:\.(?:25[0-5]|2[0-4]\d|1?\d{1,2})){3}$/
const IPV6 = /^(?:(?:[A-F0-9]{1,4}:){7}[A-F0-9]{1,4}|(?:[A-F0-9]{1,4}:){1,7}:|:(?::[A-F0-9]{1,4}){1,7})$/i

const DAY_MS = 24 * 60 * 60 * 1000

export function planHasCdn (instance: { plan_settings?: Record<string, unknown> | null }): boolean {
  const slug = (instance.plan_settings?.cdn as { provider_slug?: unknown } | undefined)?.provider_slug
  return typeof slug === 'string' && slug !== '' && slug !== 'none'
}

/** The CDN records of an instance whose plan has a CDN. */
export function cdnDnsRecords (instance: { plan_settings?: Record<string, unknown> | null, cdn_dns_records?: CdnDnsRecord[] | null }): CdnDnsRecord[] {
  if (!planHasCdn(instance)) {
    return []
  }
  return Array.isArray(instance.cdn_dns_records) ? instance.cdn_dns_records : []
}

/** The plan has a CDN but its DNS records are not there yet. */
export function cdnDnsPending (instance: { plan_settings?: Record<string, unknown> | null, cdn_dns_records?: CdnDnsRecord[] | null }): boolean {
  return planHasCdn(instance) && cdnDnsRecords(instance).length === 0
}

/** `moment().diff(date, unit)`, truncated toward zero like moment. */
function diffIn (from: string | undefined, unit: 'minutes' | 'hours'): number {
  const ms = Date.now() - new Date(from as string).getTime()
  return Math.trunc(ms / (unit === 'minutes' ? 60_000 : 3_600_000))
}

/** app-lite rewrites `instances` to `projects` in API paths under single server. */
export function resourceSegment (singleServer: boolean): 'instances' | 'projects' {
  return singleServer ? 'projects' : 'instances'
}

/** `${apiBase}/instances/{id}/screenshot.jpg?time=…` (`/projects/…` under app-lite single server). */
export function buildScreenshotUrl (apiBase: string, id: number, time: number, singleServer = false): string {
  return `${apiBase}/${resourceSegment(singleServer)}/${id}/screenshot.jpg?time=${time}`
}

function statValue (stat: { usage?: number | null, maximum?: number | null } | null | undefined, field: 'usage' | 'maximum'): number | null | undefined {
  return stat?.[field]
}

function computeInfo (app: RawInstance): InstanceResource['info'] {
  const stats = app.stats
  const maxOf = (stat: { maximum?: number | null } | null | undefined): string => stat
    ? (stat.maximum === null || stat.maximum === -1 ? '∞' : formatBytes(stat.maximum as number))
    : '-'
  const unique = stats?.visitors?.unique
  const lastMonth = stats?.visitors?.unique_lastmonth
  return {
    ssl: app.url.startsWith('https://'),
    plugins: { errors: 0 },
    visitors: {
      current: stats && unique ? unique : '-',
      delta: stats && lastMonth ? `${Math.round((-1 + (unique as number) / lastMonth) * 100)}%` : '-',
    },
    bandwidth: {
      current: stats && statValue(stats.bandwidth, 'usage') ? formatBytes(statValue(stats.bandwidth, 'usage') as number) : '-',
      max: stats ? maxOf(stats.bandwidth) : '-',
    },
    storage: {
      current: stats && statValue(stats.storage, 'usage') ? formatBytes(statValue(stats.storage, 'usage') as number) : '-',
      max: stats ? maxOf(stats.storage) : '-',
    },
  }
}

// eslint-disable-next-line complexity -- field-by-field port of the legacy mapper
export function toInstanceResource (
  app: RawInstance,
  home?: HomeLike | null,
  options: ToInstanceResourceOptions = {},
): InstanceResource {
  const apiBase = options.apiBase ?? '/api'
  const singleServer = !!home?.app?.single_server?.active

  const stagingApps = Array.isArray(app?.staging_apps) ? app.staging_apps : []
  const subInstances = stagingApps.map(subInstance => toInstanceResource(subInstance, home, options))
  const parentInstance = app.parent_app ? toInstanceResource(app.parent_app, home, options) : null

  const instance: InstanceResource = {
    id: app.id,
    type: app.app_type ?? app.type,
    title: app.name,
    url: app.url,
    domain: app.domain,
    ssl_order_status: app.ssl_order_status ?? 'none',
    cdn_enabled: app.cdn_enabled ?? false,
    cdn_dns_records: app.cdn_dns_records || [],
    domain_ssl_details: app.domain_ssl_details,
    domain_zone_details: app.domain_zone?.details ?? [],
    dir: app.dir,
    subInstances,
    parentInstance,
    sharedAccess: app.shared_access,
    owner: app.owner,
    owned: app.owned,
    privileges: app.privileges,
    service_id: app.service_id,
    service_status: app.service_status as string | undefined,
    service_is_trial: app.service_is_trial,
    service_trial_expiry_at: app.service_trial_expiry_at,
    service_created_at: app.service_created_at,
    diagnostic_mode: app.diagnostic_mode,
    hostingId: app.server_account_id,
    hostingStatus: app.server_account_status,
    hostingAccountDetails: app.server_account_details,
    isContainer: !!app.is_container,
    hostingName: app['plans.name'],
    hostingServerType: app.hosting_server_type as string | undefined,
    staging: app.staging as boolean | undefined,
    colorScheme: app.staging ? 'info' : 'primary',
    subinstanceLabel: app.staging ? 'staging' : 'live',
    labels: app.labels || [],
    screenshot_url: app.screenshot_time ? buildScreenshotUrl(apiBase, app.id, app.screenshot_time, singleServer) : '',
    screenshot_time: app.screenshot_time,
    resources: app.resources ?? null,
    info: computeInfo(app),
    created_at: app.created_at,
    created_at_from_now: fromNow(app.created_at as string),
    theme_details: app.theme_details,
    performance_score: app.performance_score,
    backup_details: app.backup_details || [],
    plugin_details: app.plugin_details || [],
    has_automatic_backup: app.has_automatic_backup,
    isActive: app.status === 'active',
    service_has_dns: app.service_has_dns,
    service_has_dns_cloudflare: app.service_has_dns_cloudflare,
    install_details: app.install_details,
    import_details: app.import_details,
    details: (app.details || []) as Record<string, unknown>,
    async_status: {
      installation: app.async_status ? app.async_status.installation ?? null : null,
      update: app.async_status ? app.async_status.update ?? null : null,
      push_to_live: app.async_status ? app.async_status.push_to_live ?? null : null,
      pull_from_staging: app.async_status ? app.async_status.pull_from_staging ?? null : null,
      push_to_staging: app.async_status ? app.async_status.push_to_staging ?? null : null,
    },
    host_ip_address: app.host_ip_address as string | null | undefined,
    host_ipv4_addresses: app.host_ipv4_addresses,
    host_c_names: app.host_c_names as string[] | undefined,
    dns_nameservers: app.dns_nameservers as string[] | undefined,
    server_settings: app.server_settings,
    dns_settings: app.dns_settings,
    dns_resolved_correctly: null,
    onboarding_subdomain: app.onboarding_subdomain as string | null | undefined,
    debugMode: false,
    maintenanceMode: false,
    automatic_backups_editable: app.automatic_backups_editable,
    domain_has_dns_zone: app.domain_has_dns_zone,
    health_checks: app.health_checks,
    plan_settings: app.plan_settings,
    plan_name: app.plan_name,
    plan_upgrade_link: app.plan_upgrade_link,
    auto_updates: app.can_auto_updates as { wordpress?: boolean } | null | undefined,
    temp_url: app.temp_url,
    preview_site: app.preview_site,
    service_nameservers: app.service_nameservers,
    supports_admin_sso: !!app.supports_admin_sso,
    git_repository: app.git_repository,
    needs_recent_backup_warning: app.needs_recent_backup_warning,
    needs_backup_attention: app.needs_backup_attention,
    source: app.source ?? null,
    // Overwritten below, once the backup methods exist.
    status: undefined as unknown as InstanceStatus,

    hasInstallInProgress () {
      return IN_PROGRESS.has(this.async_status.installation as string)
    },
    hasInstallFailed () {
      return this.async_status.installation === 'failed'
    },
    hasUpdateInProgress () {
      return IN_PROGRESS.has(this.async_status.update as string)
    },
    hasActionInProgress () {
      return (
        this.hasInstallInProgress()
        || this.hasUpdateInProgress()
        || IN_PROGRESS.has(this.async_status.push_to_live as string)
        || IN_PROGRESS.has(this.async_status.pull_from_staging as string)
        || IN_PROGRESS.has(this.async_status.push_to_staging as string)
      )
    },
    hasInstallStatus () {
      return this.hasInstallInProgress() || this.hasInstallFailed()
    },
    setSharedAccessData (data) {
      this.sharedAccess = data
    },
    setDebugMode (status) {
      this.debugMode = status
    },
    setMaintenanceMode (status) {
      this.maintenanceMode = status
    },
    unsetSubinstance (id) {
      this.subInstances = this.subInstances.filter(item => item.id !== id)
    },
    setPluginsData (data) {
      this.status.woocommerce = null
      this.status.woocommerce_available = null
      for (const plugin of data) {
        if (plugin.name === 'woocommerce') {
          this.status.woocommerce = plugin.version ?? null
          this.status.woocommerce_available = plugin.update_version || plugin.version || null
          break
        }
      }
      let pluginErrors = 0
      for (const plugin of data) {
        if (plugin.update === 'available') {
          pluginErrors++
        }
      }
      this.info.plugins.errors = pluginErrors
      if (this.status.woocommerce !== null) {
        this.status.woocommerce_installing = false
      }
    },
    setWoocommerceInstalling (installing) {
      this.status.woocommerce_installing = installing
    },
    isNew () {
      return diffIn(this.created_at, 'minutes') <= 5
    },
    hasAutomaticBackup () {
      if (this.server_settings?.uses_own_backup_system) {
        return true
      }
      // null/undefined = schedule unknown (Engine 2.2.0), not "off": the app-lite behaviour, chosen over app (where null warns).
      // Only an explicit false means no backups.
      return this.has_automatic_backup !== false
    },
    setAutomaticBackup (enabled) {
      this.has_automatic_backup = enabled
    },
    hasRecentBackup () {
      if (typeof this.needs_recent_backup_warning === 'boolean') {
        return !this.needs_recent_backup_warning
      }
      if (this.server_settings?.uses_own_backup_system) {
        return true
      }

      const minDate = Date.now() - DAY_MS
      for (const backup of this.backup_details) {
        if (backup.type === 'automatic') {
          return true
        }
        if (backup?.async_status?.create !== 'finished') {
          continue
        }
        if ((backup.date as number) * 1000 > minDate) {
          return true
        }
      }
      return false
    },
    shouldHaveRecentBackup () {
      if (typeof this.needs_recent_backup_warning === 'boolean') {
        return this.needs_recent_backup_warning
      }
      return diffIn(this.service_created_at, 'hours') > 24
    },
    setBackupDetails (data) {
      this.backup_details = data
    },
    setBackupItem (item) {
      for (const [key, i] of this.backup_details.entries()) {
        if (i.id === item.id) {
          this.backup_details[key] = item
          break
        }
      }
      this.setBackupDetails([...this.backup_details])
    },
    unsetBackupItem (item) {
      for (const [key, i] of this.backup_details.entries()) {
        if (i.id === item.id) {
          this.backup_details.splice(key, 1)
          break
        }
      }
    },
    setPluginItem (item) {
      for (const [key, i] of this.plugin_details.entries()) {
        if (i.name === item.name) {
          this.plugin_details[key] = item
          break
        }
      }
      this.setPluginsData([...this.plugin_details])
    },
    hasWpCloudServer () {
      return this.hostingServerType === 'wp-cloud'
    },
    hasStaging () {
      return this.subInstances.length > 0
    },
    hasActiveStaging () {
      return this.hasStaging() && this.subInstances[0]!.isActive
    },
    refreshScreenshot () {
      this.screenshot_time = Math.floor(Date.now() / 1000)
      this.screenshot_url = buildScreenshotUrl(apiBase, this.id, this.screenshot_time, singleServer)
    },
    setDetectedSslCert (cert) {
      if (this.domain_ssl_details === null || this.domain_ssl_details === undefined) {
        this.domain_ssl_details = {
          detected_ssl_cert: null,
          detected_ssl_cert_checked_time: 0,
          installed_ssl_cert: null,
          installed_ssl_cert_checked_time: 0,
        }
      }
      this.domain_ssl_details.detected_ssl_cert_checked_time = Math.floor(Date.now() / 1000)
      this.domain_ssl_details.detected_ssl_cert = cert
    },
    hasIpAddressInUrl () {
      try {
        const { hostname } = new URL(this.url)
        return IPV4.test(hostname) || IPV6.test(hostname)
      } catch {
        // Invalid URL string
        return false
      }
    },
    getDnsIpv4Addresses () {
      const fromCdn = (this.cdn_dns_records || [])
        .filter(record => record.type === 'A' && record.value)
        .map(record => record.value as string)
      if (fromCdn.length > 0) {
        return fromCdn
      }
      if (planHasCdn(this)) {
        return []
      }
      return this.host_ipv4_addresses
    },
    getDnsAlertsEnabled () {
      return this.details.dns_alerts_enabled
    },
    setDnsAlertsEnabled (value) {
      this.details.dns_alerts_enabled = value
    },
    getDnsResolveStatus () {
      return this.dns_resolved_correctly
    },
    setDnsResolveStatus (value) {
      this.dns_resolved_correctly = value
    },
    ...createInstancePrivilegeMethods(app.type),
  }

  let wordpressAvailable = app.version
  const available = app.update_details?.available_updates
  if (available && available.length > 0) {
    // Legacy `.sort().reverse()[0]` (string order); here the highest by numeric version compare.
    wordpressAvailable = highestVersion(available)
  }

  instance.status = {
    value: instance.hasAutomaticBackup()
      && (instance.hasRecentBackup() || !instance.shouldHaveRecentBackup())
      && app.version === wordpressAvailable,
    wordpress: app.version,
    wordpress_available: wordpressAvailable,
    woocommerce: null,
    woocommerce_available: null,
    woocommerce_installing: false,
    backup: instance.hasAutomaticBackup(),
    backup_recent: instance.hasRecentBackup(),
  }

  if (app.plugin_details) {
    instance.setPluginsData(app.plugin_details)
  }

  return instance
}
