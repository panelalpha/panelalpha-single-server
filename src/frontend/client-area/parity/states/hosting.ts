import type { Handler, ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { settled, tr } from './auth'
import { liteShellHome } from './instances'
import { appBarProbe, NOW, openLegacyMenu, shellHandlers, shellHome, tabProbe } from './shell'

// Shared building blocks of the hosting states (S-30: frame + Summary). Not a spec file (testMatch is `*.parity.ts`).
//
// A hosting state is signed in on `/hosting/summary` with `has_hosting_access`, one active service `Pro` / `example.com` with one
// server account (11) and the full set of `hosting.*` privileges, no DNS verification and no email server (so neither app asks
// dns.google), instances without `host_ip_address` (so no SSL detection call) and a frozen clock. A state sets only what differs.
// Fixtures follow the legacy deploy run of 2026-10-06 (`context/changes/hosting-summary/evidence/`).

export const GB = 1_073_741_824

export const allHostingPrivileges = [
  'hosting.manage_email',
  'hosting.manage_dns',
  'hosting.manage_domains',
  'hosting.manage_ssl',
  'hosting.manage_ftp',
  'hosting.manage_sftp',
  'hosting.manage_mysql',
  'hosting.manage_cron',
  'hosting.manage_file_manager',
  'hosting.control_panel_sso',
  'hosting.phpmyadmin_sso',
  'hosting.change_php_version',
  'hosting.manage_php_settings',
]

export function serverAccount (overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    domain: 'example.com',
    additional_domains: [],
    main_domain_nameservers: ['ns1.example.com', 'ns2.example.com'],
    username: 'example',
    service_id: 1,
    server_id: 1,
    server_name: 'Server 1',
    server_type: 'cpanel',
    ipv4_addresses: ['192.0.2.10'],
    host_c_names: [],
    details: { homedir: '/home/example', mysql_db_prefix: 'example_' },
    status: 'active',
    diagnostic_mode: false,
    diagnostic_mode_details: null,
    owned: true,
    privileges: allHostingPrivileges,
    ...overrides,
  }
}

export function hostingService (overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    domain: 'example.com',
    instances: [],
    instances_count: 3,
    is_trial: false,
    trial_expiry_at: null,
    plan_name: 'Pro',
    plan_upgrade_link: 'https://example.com/upgrade',
    plan_settings: {
      instance_limit: 10,
      dns_management_enabled: true,
      domain_transfer_enabled: false,
      allow_user_enable_ssh_access: false,
      default_ssh_access_enabled: false,
      eager_domain_dns_verification_enabled: false,
    },
    server_settings: { domain_transfer_allowed: false },
    dns_settings: { verification_methods: [], display_options: [], valid_cname_addresses: [] },
    server_accounts: [serverAccount()],
    hosting_server_type: 'cpanel',
    dns_server_enabled: false,
    dns_server_internal: true,
    dns_server_type: null,
    email_server_enabled: false,
    email_server_internal: true,
    email_server_type: null,
    status: 'active',
    owned: true,
    privileges: allHostingPrivileges,
    ...overrides,
  }
}

/** A service with DNS and e-mail on: single-server next shows the hosting sidebar only for such a service (usage-redesign, D1). */
export const dnsEmailService = hostingService({ dns_server_enabled: true, email_server_enabled: true })

interface Metric { usage: number, maximum: number | null }

export function usageBody (overrides: { data?: Record<string, Metric>, supported?: Record<string, boolean> } = {}) {
  return {
    data: {
      instances: { usage: 3, maximum: 10 },
      disk_usage: { usage: GB, maximum: 5 * GB },
      bandwidth: { usage: 2 * GB, maximum: 100 * GB },
      addon_domains: { usage: 1, maximum: 5 },
      subdomains: { usage: 2, maximum: null },
      aliases: { usage: 0, maximum: null },
      email_accounts: { usage: 0, maximum: null },
      mailing_lists: { usage: 0, maximum: null },
      autoresponders: { usage: 0, maximum: null },
      forwarders: { usage: 0, maximum: null },
      email_filters: { usage: 0, maximum: null },
      ftp_accounts: { usage: 1, maximum: 10 },
      sftp_accounts: { usage: 0, maximum: null },
      mysql_databases: { usage: 2, maximum: 20 },
      ...overrides.data,
    },
    supported_metrics: {
      bandwidth: true,
      addon_domains: true,
      subdomains: true,
      aliases: true,
      email_accounts: false,
      email_storage: false,
      ftp_accounts: true,
      sftp_accounts: false,
      mysql_databases: true,
      ...overrides.supported,
    },
  }
}

/**
 * One `/instances` item as the Summary rows read it. No `host_ip_address`, so the DNS/SSL icon asks nothing; a recent automatic
 * backup and an up-to-date version, so the status indicator has no issue to show unless a state asks for one.
 */
export function instanceItem (id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: 'wordpress',
    name: `Site ${id}`,
    url: `https://site${id}.example.com`,
    domain: `site${id}.example.com`,
    status: 'active',
    privileges: ['general.manage_shared_access'],
    shared_access: [],
    owner: { name: 'Jane Doe', email: 'jane@example.com' },
    owned: true,
    server_account_id: 11,
    server_account_status: 'active',
    service_id: 1,
    service_status: 'active',
    service_created_at: '2026-01-01T00:00:00.000Z',
    created_at: '2026-09-01T00:00:00.000Z',
    version: '6.8',
    server_settings: {},
    has_automatic_backup: true,
    backup_details: [{ type: 'automatic' }],
    plugin_details: [],
    async_status: {},
    details: { dns_alerts_enabled: true },
    domain_ssl_details: null,
    dns_settings: { verification_methods: [] },
    host_ipv4_addresses: ['192.0.2.10'],
    host_c_names: [],
    plan_settings: {},
    screenshot_time: null,
    ...overrides,
  }
}

export function instancesBody (items: unknown[], total = items.length) {
  return { data: items, meta: { total, current_page: 1, per_page: 5 } }
}

/** One `GET /server-accounts/{id}/ftp-accounts` item (`FtpAccountController`): sizes in MB, `diskquota` `"unlimited"` for no limit. */
export function ftpAccount (overrides: Record<string, unknown> = {}) {
  return {
    user: 'shop@example.com',
    directory: '/home/example/shop',
    diskused: 120,
    diskquota: 1024,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-09-20T10:00:00.000Z',
    ...overrides,
  }
}

/** `GET /server-accounts/{id}/ftp-accounts`: the list and the `usage` flag (false on DirectAdmin and Plesk). */
export function ftpAccountsBody ({ items, usage }: { items: unknown[], usage: boolean }) {
  return { data: items, meta: { usage } }
}

/** `GET /server-accounts/{id}/ftp-accounts/server-info` (the Info modal, modal phase). */
export function ftpServerInfoBody () {
  return { data: { host: 'ftp.example.com', port: 21 } }
}

/** `GET /server-accounts/{id}/domains`: the Add modal's domain select reads only `domain`. */
export function domainsBody (domains: string[]) {
  return { data: domains.map(domain => ({ domain })), meta: { total: domains.length } }
}

/** One `GET /services/{id}/email/domains` item (`EmailDomainResource.php:15-20`): the records are read by the SPF/DKIM chip. */
export function emailDomain (overrides: Record<string, unknown> = {}) {
  return { id: 1, domain: 'example.com', dkim_records: [], spf_records: [], ...overrides }
}

/** One `GET /services/{id}/email/domains/{domainId}/accounts` item (`AccountCollection.php:22-28`): sizes in MB, `disk_quota` `"unlimited"` for no limit. */
export function emailAccount (overrides: Record<string, unknown> = {}) {
  return {
    email: 'info@example.com',
    disk_usage: 12,
    disk_quota: 512,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-09-20T10:00:00.000Z',
    ...overrides,
  }
}

/** `GET /services/{id}/email/domains/{domainId}/accounts`: the list of one domain. */
export function emailAccountsBody (items: unknown[]) {
  return { data: items }
}

/** `GET /services/{id}/email/domains/{domainId}/accounts/{email}` (the Details modal, phase 3). */
export function emailAccountDetails () {
  return {
    data: {
      smtp_username: 'info@example.com',
      inbox_host: 'mail.example.com',
      imap_port: 993,
      imap_insecure_port: 143,
      pop3_port: 995,
      pop3_insecure_port: 110,
      smtp_host: 'mail.example.com',
      smtp_port: 465,
      smtp_insecure_port: 587,
    },
  }
}

/**
 * Waits (up to 10 s) for the app bar avatar to be drawn. V4 `v-img` creates its `<img>` only when its intersection observer fires, so
 * the media tracker can see nothing pending and the shot showed an empty circle (hosting states, from 2026-10-12). Legacy paints a
 * background image. Gives up quietly: the pixel diff reports a missing avatar.
 */
export const waitForAvatar: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.waitForFunction(() => {
      const image = document.querySelector<HTMLElement>('.button-activator .user-avatar .v-image__image')
      return Boolean(image && getComputedStyle(image).backgroundImage.startsWith('url('))
    }, undefined, { timeout: 10_000 }).catch(() => undefined)
  },
  next: async page => {
    await page.waitForFunction(() => {
      const image = document.querySelector<HTMLImageElement>('[data-testid="shell-user-activator"] .user-avatar img.v-img__img')
      return Boolean(image?.complete && image.naturalWidth > 0)
    }, undefined, { timeout: 10_000 }).catch(() => undefined)
  },
}

/** One SFTP account (`GET /server-accounts/{id}/sftp-accounts`): no directory or quota, unlike FTP. */
export function sftpAccount (overrides: Record<string, unknown> = {}) {
  return {
    user: 'example_deploy',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-09-20T10:00:00.000Z',
    ...overrides,
  }
}

/** `GET /server-accounts/{id}/sftp-accounts`: the list, the access method of the page and the row actions the account supports. */
export function sftpAccountsBody ({ items, accessType = 'sftp', actions = ['edit_password'] }: { items: unknown[], accessType?: 'ssh' | 'sftp', actions?: string[] }) {
  return { data: items, meta: { access_type: accessType, actions } }
}

/** `GET /server-accounts/{id}/sftp-accounts/server-info` (the Info modal, modal phase). */
export function sftpServerInfoBody () {
  return { data: { host: 'sftp.example.com', port: 2222 } }
}

/** Waits (up to 20 s) until the locator is visible; absent in next (not ported yet) it gives up quietly and the probe reports `missing`. */
export function waitFor (locator: (page: Page) => Locator): StateAction {
  return async page => {
    try {
      await locator(page).first().waitFor({ state: 'visible', timeout: 20_000 })
    } catch {
      // the state's probes and pixel diff report what is not there
    }
  }
}

export interface HostingStateOptions {
  home?: Parameters<typeof shellHome>[0]
  /** Services of `GET /services`; default one active service. */
  services?: unknown[]
  /** Answer of `GET /server-accounts/{id}/usage` for every account of every service. */
  usage?: Handler
  /** Answer of `GET /instances` (every `server_account_id`: the key has no query). */
  instances?: Handler
  /** Answer of `GET /services/{id}/email/domains` per service id. */
  emailDomains?: Handler
  external?: ParityState['external']
  /** Extra `METHOD /path` handlers (a state that opens a modal answers its requests). */
  handlers?: Record<string, Handler>
  clock?: string
  /** Element both apps must show before capture (a state starts when it is there). Default: the frame title. */
  ready?: Pick<Probe, 'legacy' | 'next'>
  /** Steps after the page loaded (open a menu, wait for a spinner). */
  legacy?: StateAction[]
  next?: StateAction[]
  /** Probes after the frame ones. */
  probes?: Probe[]
  masks?: ParityState['masks']
  pointer?: ParityState['pointer']
  path?: string
  /** `false` for states without a selected service: no sidebar probes. */
  frame?: boolean
  /**
   * app-lite (S-31): measured against the lite legacy (`target: 'lite'`) with the single-server `/home` (`liteShellHome`), the
   * `projects` list segment and the "My Server" tab. `home` is merged over the lite base.
   * `'multi'` (S-114 ui-hosting-summary): the same lite target and copy, but `app.single_server.active: false` (the "My Hosting"
   * tab, the `instances` segment), so the Summary route does not redirect to Usage. Other states keep `true`.
   */
  lite?: boolean | 'multi'
  /** Answers of `GET /server/metrics/current` and `GET /server/metrics/{period}` (single-server only). */
  metrics?: {
    current?: Handler
    periods?: Partial<Record<MetricsPeriodKey, Handler>>
  }
}

export type MetricsPeriodKey = 'last-5-minutes' | 'last-hour' | 'last-12-hours'

// ---------------------------------------------------------------------------------------------
// Server metrics (S-31): `ServerMetricsController` of the engine, behind `/server/metrics/*`
// ---------------------------------------------------------------------------------------------

/** Bucket width in seconds per period (about 60 buckets; the window ends one bucket before "now"). */
const BUCKET_SECONDS: Record<MetricsPeriodKey, number> = { 'last-5-minutes': 5, 'last-hour': 60, 'last-12-hours': 720 }

const formatPeriod = (iso: string): string => iso.slice(0, 19).replace('T', ' ')

/** `GET /server/metrics/current`: RAM ~45 % of 8 GB (KB), CPU ~23 %, disk ~62 % of 100 GB (bytes). */
export function metricsCurrentBody (overrides: Record<string, unknown> = {}) {
  return {
    data: {
      cpu_usage_percent: 22.4,
      ram_total: 8 * 1024 * 1024,
      ram_free: 4.4 * 1024 * 1024,
      ram_used: 3.6 * 1024 * 1024,
      ram_usage_percent: 44.6,
      disk_total: 100 * GB,
      disk_free: 38 * GB,
      disk_used: 62 * GB,
      disk_usage_percent: 61.3,
      memory_budget: 8 * 1024 * 1024,
      ...overrides,
    },
  }
}

/**
 * `GET /server/metrics/{period}`: 60 deterministic buckets counted back from `NOW`, every field present. `gaps: n` leaves every
 * n-th bucket with only its `period` (the engine's empty bucket).
 */
export function metricsPeriodBody (period: MetricsPeriodKey, options: { gaps?: number } = {}) {
  const step = BUCKET_SECONDS[period] * 1000
  const end = Date.parse(NOW) - step
  const data = Array.from({ length: 60 }, (_, index) => {
    const bucket = { period: formatPeriod(new Date(end - (59 - index) * step).toISOString()) }
    if (options.gaps !== undefined && index % options.gaps === options.gaps - 1) {
      return bucket
    }
    const wave = Math.sin(index / 6)
    return {
      ...bucket,
      cpu_percent: Math.round((20 + wave * 10 + (index % 5)) * 100) / 100,
      cpu_load_avg_1: 0.4,
      cpu_load_avg_5: 0.35,
      cpu_load_avg_15: 0.3,
      ram_percent: 45,
      swap_percent: 0,
      disk_read_bps: Math.round(2_000_000 + wave * 900_000),
      disk_write_bps: Math.round(1_200_000 + wave * 600_000 + index * 5000),
      disk_read_iops: Math.round(120 + wave * 40),
      disk_write_iops: Math.round(80 + wave * 30),
      net_in_bps: Math.round(500_000 + wave * 200_000),
      net_out_bps: Math.round(900_000 + wave * 300_000),
      net_in_pps: Math.round(400 + wave * 100),
      net_out_pps: Math.round(700 + wave * 150),
    }
  })
  return { data }
}

// ---------------------------------------------------------------------------------------------
// Frame probes (views/hosting/index.vue, components/HostingPagesSidebar.vue)
// ---------------------------------------------------------------------------------------------

export const hostingTitleProbe: Probe = {
  key: 'hosting-title',
  legacy: page => page.locator('.v-main h1.font-weight-800'),
  next: page => page.getByTestId('hosting-title'),
}

/** Desktop: the left column; below 1200 px it holds the plan selector and the tabs. */
export const sidebarProbe: Probe = {
  key: 'sidebar',
  legacy: page => page.locator('.v-main .sticky-sidebar'),
  next: page => page.getByTestId('hosting-sidebar'),
}

export const sidebarActiveProbe: Probe = {
  key: 'sidebar-active',
  legacy: page => page.locator('.v-main .sticky-sidebar .v-list-item--active, .v-main .sticky-sidebar .v-tab--active, .v-main .sticky-sidebar .v-tab--selected'),
  next: page => page.getByTestId('hosting-sidebar').locator('.v-list-item--active, .v-tab--selected'),
  internal: true,
}

// ---------------------------------------------------------------------------------------------
// Summary probes (views/hosting/Summary.vue and the cards)
// ---------------------------------------------------------------------------------------------

const summaryColumns = (page: Page) => page.locator('.v-main .container.mt-3 > .row > .col-md-6')
const leftCard = (page: Page, index: number) => summaryColumns(page).first().locator(':scope > .v-card').nth(index)

export const summaryTitleProbe: Probe = {
  key: 'summary-title',
  legacy: page => page.locator('.v-main .title-column h4'),
  next: page => page.getByTestId('summary-title'),
}

export const summarySsoProbe: Probe = {
  key: 'summary-sso',
  legacy: page => page.locator('.v-main .title-column .v-btn'),
  next: page => page.getByTestId('summary-sso'),
}

/** The `$externallink` icon of the SSO button: its colour is under the pixel threshold. */
export const summarySsoIconProbe: Probe = {
  key: 'summary-sso-icon',
  legacy: page => page.locator('.v-main .title-column .v-btn .v-icon'),
  next: page => page.getByTestId('summary-sso').locator('.v-icon'),
  internal: true,
}

export const summarySelectorProbe: Probe = {
  key: 'summary-account-selector',
  legacy: page => page.locator('.v-main .acc-select-group'),
  next: page => page.getByTestId('summary-account-selector'),
}

export const summaryRightColumnProbe: Probe = {
  key: 'summary-right-column',
  legacy: page => summaryColumns(page).nth(1),
  next: page => page.getByTestId('summary-right-column'),
  internal: true,
}

/** The plan card of the right column, or its skeleton while loading (the legacy locator is the same card either way). */
export function summaryPlanProbe (kind: 'card' | 'skeleton'): Probe {
  return {
    key: kind === 'card' ? 'summary-plan-card' : 'summary-plan-skeleton',
    legacy: page => summaryColumns(page).nth(1).locator(':scope > .v-card'),
    next: page => page.getByTestId(kind === 'card' ? 'summary-plan-card' : 'summary-plan-skeleton'),
  }
}

export const summaryNsCardProbe: Probe = {
  key: 'summary-ns-card',
  legacy: page => leftCard(page, 0),
  next: page => page.getByTestId('summary-ns-card'),
}

export const summaryNsSpinnerProbe: Probe = {
  key: 'summary-ns-spinner',
  legacy: page => leftCard(page, 0).locator('.v-progress-circular'),
  next: page => page.getByTestId('summary-ns-spinner'),
  internal: true,
}

export const summaryInstancesCardProbe: Probe = {
  key: 'summary-instances-card',
  legacy: page => leftCard(page, 1),
  next: page => page.getByTestId('summary-instances-card'),
}

export const summaryChipProbe: Probe = {
  key: 'summary-instances-chip',
  legacy: page => leftCard(page, 1).locator('.v-card__title .v-chip'),
  next: page => page.getByTestId('summary-instances-chip'),
}

export const summaryEmptyProbe: Probe = {
  key: 'summary-instances-empty',
  legacy: page => leftCard(page, 1).locator('.no-data'),
  next: page => page.getByTestId('summary-instances-empty'),
}

export const summaryEmptyAddProbe: Probe = {
  key: 'summary-instances-add',
  legacy: page => leftCard(page, 1).locator('.no-data .v-btn'),
  next: page => page.getByTestId('summary-instances-add'),
}

/** The instance rows of the card (the legacy rows are `a.instance`). */
const instanceRows = (page: Page) => leftCard(page, 1).locator('a.instance')

export const summaryRowProbe: Probe = {
  key: 'summary-instance-row',
  legacy: page => instanceRows(page).first(),
  next: page => page.getByTestId('summary-instance-row').first(),
}

export const summaryRowAvatarProbe: Probe = {
  key: 'summary-instance-avatar',
  legacy: page => instanceRows(page).first().locator('.v-avatar'),
  next: page => page.getByTestId('summary-instance-row').first().locator('.v-avatar'),
  internal: true,
}

export const summaryRowSharesProbe: Probe = {
  key: 'summary-instance-shares',
  legacy: page => instanceRows(page).nth(1).locator('.v-chip'),
  next: page => page.getByTestId('summary-instance-row').nth(1).getByTestId('shares-label'),
}

export const summaryRowSuspendedProbe: Probe = {
  key: 'summary-instance-suspended',
  legacy: page => instanceRows(page).nth(2).locator('.suspend-chip'),
  next: page => page.getByTestId('summary-instance-row').nth(2).locator('.suspend-chip'),
  internal: true,
}

export const summaryLoadMoreProbe: Probe = {
  key: 'summary-load-more',
  legacy: page => leftCard(page, 1).locator('.load-more-btn'),
  next: page => page.getByTestId('summary-load-more'),
}

// ---------------------------------------------------------------------------------------------
// File Manager probes (views/hosting/FileManager.vue, S-37). The fm content is masked: legacy embeds the `/fm/` app (stubbed blank by
// the driver), next renders its native file manager.
// ---------------------------------------------------------------------------------------------

export const fileManagerTitleProbe: Probe = {
  key: 'file-manager-title',
  legacy: page => page.locator('.v-main .title-row h4'),
  next: page => page.getByTestId('file-manager-title'),
}

export const fileManagerSelectorProbe: Probe = {
  key: 'file-manager-account-selector',
  legacy: page => page.locator('.v-main .acc-select-group'),
  next: page => page.getByTestId('file-manager-account-selector'),
}

const legacyWpCloudAlert = (page: Page) => page.locator('.v-main .alert.alert--warning')
const nextWpCloudAlert = (page: Page) => page.getByTestId('file-manager-wp-cloud-alert')

export const fileManagerWpCloudProbes: Probe[] = [
  { key: 'file-manager-wp-cloud-alert', legacy: legacyWpCloudAlert, next: nextWpCloudAlert },
  {
    key: 'file-manager-wp-cloud-icon',
    legacy: page => legacyWpCloudAlert(page).locator('.alert__icon-box .v-icon'),
    next: page => nextWpCloudAlert(page).locator('.alert__icon-box .v-icon'),
    internal: true,
  },
  {
    key: 'file-manager-wp-cloud-text',
    legacy: page => legacyWpCloudAlert(page).locator('.alert__text-box p'),
    next: page => nextWpCloudAlert(page).locator('.alert__text-box p'),
  },
]

/** The fm box (legacy `iframe.file-manager`, next `div.file-manager`): size, border and the global shadow. */
export const fileManagerBoxProbe: Probe = {
  key: 'file-manager-box',
  legacy: page => page.locator('.v-main iframe.file-manager'),
  next: page => page.getByTestId('file-manager'),
}

/** The column around the box: 700px plus the descender of the inline iframe's line box. */
export const fileManagerColumnProbe: Probe = {
  key: 'file-manager-column',
  legacy: page => page.locator('.v-main .container.mt-3 > .row > .col-12'),
  next: page => page.getByTestId('file-manager').locator('xpath=..'),
  internal: true,
}

export const fileManagerMasks: NonNullable<ParityState['masks']> = {
  legacy: [page => page.locator('.v-main iframe.file-manager')],
  next: [page => page.getByTestId('file-manager')],
}

/**
 * The fm calls of a page load per account: `initialize` (no unsupported action, a 1 GB upload limit) and the empty home directory.
 * Legacy never sends them (its iframe is stubbed); next's native file manager does.
 */
export function fileManagerHandlers (accountIds: number[]): Record<string, Handler> {
  const handlers: Record<string, Handler> = {}
  for (const id of accountIds) {
    handlers[`GET /file-manager/initialize/${id}`] = {
      json: { result: { status: 'success', message: null }, config: { uploadMaxFilesize: GB, lang: 'en', unsupportedActions: [] } },
    }
    handlers[`GET /file-manager/content/${id}`] = {
      json: { result: { status: 'success', message: null }, directories: [], files: [] },
    }
  }
  return handlers
}

/** The alert stack (fixed, top right). Alerts close themselves after 5 s, so a state that checks them is captured before that. */
export const alertManagerProbe: Probe = {
  key: 'alerts',
  legacy: page => page.locator('.alert-manager'),
  next: page => page.getByTestId('shell-alert-manager'),
}

/** The infinite spinner of a state that never finishes loading (indeterminate animation: masked). */
export const nsSpinnerMasks: NonNullable<ParityState['masks']> = {
  legacy: [page => leftCard(page, 0).locator('.v-progress-circular')],
  next: [page => page.getByTestId('summary-ns-spinner')],
}

/**
 * The hosting tab: "My Hosting" on app and on multi-server app-lite. Single-server lite has none in next (decision of the user 2026-11-17,
 * usage-redesign: "My Server" moved to the user menu), so it has no probe; legacy still shows it.
 */
function hostingTab (lite: boolean | 'multi' | undefined): Probe[] {
  if (lite === true) {
    return []
  }
  if (lite === 'multi') {
    return [tabProbe('my-hosting', 'heading.navbar.tab.myHosting', 'lite')]
  }
  return [tabProbe('my-hosting')]
}

function frameProbes (lite: boolean | 'multi' | undefined): Probe[] {
  return [
    appBarProbe,
    ...hostingTab(lite),
    hostingTitleProbe,
    sidebarProbe,
    sidebarActiveProbe,
  ]
}

/** `home` of a state: the app one, or the single-server lite one with the state's differences merged over it. */
function hostingHome (options: HostingStateOptions): Record<string, unknown> {
  if (!options.lite) {
    return shellHome({ ...options.home, user: { has_hosting_access: true, ...options.home?.user } })
  }
  const base = liteShellHome() as { user: Record<string, unknown>, app: Record<string, unknown>, admin: Record<string, unknown> }
  const singleServer = options.lite === 'multi' ? { single_server: { active: false, has_running_tasks: false, has_uncompleted_imports: false } } : {}
  return {
    ...base,
    user: { ...base.user, has_hosting_access: true, ...options.home?.user },
    app: { ...base.app, ...singleServer, ...options.home?.app },
    admin: { ...base.admin, ...options.home?.admin },
  }
}

/** Waits for a visible locator and then acts; absent in next (not ported yet) it reports `missing` through its probe instead of hanging. */
export async function whenVisible (locator: Locator, action: () => Promise<void>): Promise<void> {
  try {
    await locator.waitFor({ state: 'visible', timeout: 3000 })
  } catch {
    return
  }
  await action()
}

export const waitForNetworkIdle: StateAction = async (page: Page) => {
  await page.waitForLoadState('networkidle')
}

export function hostingState (options: HostingStateOptions = {}): Omit<ParityState, 'id'> {
  const services = options.services ?? [hostingService()]
  const accountIds = [...new Set(services.flatMap(service => ((service as { server_accounts?: Array<{ id: number }> }).server_accounts ?? []).map(account => account.id)))]
  const handlers: Record<string, Handler> = {
    ...shellHandlers([], options.lite === true ? 'projects' : 'instances'),
    'GET /services': { json: { data: services } },
    'GET /instances': options.instances ?? { json: instancesBody([]) },
    ...options.handlers,
  }
  if (options.metrics !== undefined) {
    handlers['GET /server/metrics/current'] = options.metrics.current ?? { json: metricsCurrentBody() }
    for (const period of Object.keys(BUCKET_SECONDS) as MetricsPeriodKey[]) {
      handlers[`GET /server/metrics/${period}`] = options.metrics.periods?.[period] ?? { json: metricsPeriodBody(period) }
    }
  }
  for (const id of accountIds) {
    handlers[`GET /server-accounts/${id}/usage`] = options.usage ?? { json: usageBody() }
  }
  if (options.emailDomains !== undefined) {
    for (const service of services) {
      handlers[`GET /services/${(service as { id: number }).id}/email/domains`] = options.emailDomains
    }
  }
  return {
    path: options.path ?? '/hosting/summary',
    ...(options.lite ? { target: 'lite' as const } : {}),
    signedIn: true,
    clock: options.clock ?? NOW,
    home: hostingHome(options),
    handlers,
    ...(options.external === undefined ? {} : { external: options.external }),
    actions: {
      legacy: [waitFor((options.ready ?? hostingTitleProbe).legacy), waitForAvatar.legacy, ...(options.legacy ?? [])],
      next: [waitFor((options.ready ?? hostingTitleProbe).next), waitForAvatar.next, ...(options.next ?? [])],
    },
    ...(options.pointer === undefined ? {} : { pointer: options.pointer }),
    ...(options.masks === undefined ? {} : { masks: options.masks }),
    probes: [...(options.frame === false ? [appBarProbe, ...hostingTab(options.lite), hostingTitleProbe] : frameProbes(options.lite)), ...(options.probes ?? [])],
  }
}

export { NOW } from './shell'

const MB = 1024 ** 2

/** Usage of the full states: disk ~30 %, email storage ~60 %, every row supported (the email tile shows storage, not accounts). */
export const usageMixed = usageBody({
  data: {
    disk_usage: { usage: 1.5 * GB, maximum: 5 * GB },
    email_storage: { usage: 600 * MB, maximum: GB },
    email_accounts: { usage: 4, maximum: 50 },
  },
  supported: { email_accounts: true, email_storage: true },
})

/** Three rows: a plain one, one with shared access (the chip), one whose service is suspended. */
export const threeInstances = [
  instanceItem(101),
  instanceItem(102, { shared_access: [{ name: 'Sam Smith', email: 'sam@example.com', role: 'view_only', accepted_at: '2026-09-10T00:00:00.000Z', invited_at: '2026-09-09T00:00:00.000Z' }] }),
  instanceItem(103, { service_status: 'suspended' }),
]

/**
 * Types a search term into the list's search and waits for the "no results" container. Legacy debounces with lodash on
 * `Date.now()`, so the frozen clock moves on by a second between in-page sleeps (the same as `searchAction`, instances.ts).
 */
export function listSearch (term: string): StateAction {
  return async page => {
    // Below `md` the search is a 38px icon that opens the field on click (`DataIteratorSearch`, `smAndDown`).
    if ((page.viewportSize()?.width ?? 1440) < 768) {
      await page.locator('.data-iterator-filter-controls__item').last().locator('.v-input').click()
    }
    await page.getByPlaceholder(tr('form.placeholder.search')).fill(term)
    const base = Date.parse(NOW)
    for (let step = 1; step <= 20; step++) {
      await page.clock.setFixedTime(new Date(base + step * 1000))
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 350)))
      if (await page.locator('.no-results-container').count() > 0) {
        return
      }
    }
  }
}

/**
 * Opens the account selector (`ActiveServerAccountSelector`, next test id `selectorTestId`), as `hosting-summary.parity.ts` does
 * for its selector. Desktop only: below `lg` legacy's selector sits outside the viewport and cannot be clicked, so the mobile
 * variant keeps the closed selector.
 */
export function accountSelectorSteps (selectorTestId: string): { legacy: StateAction, next: StateAction } {
  return {
    legacy: async (page: Page) => {
      if ((page.viewportSize()?.width ?? 1440) < 976) {
        return
      }
      await openLegacyMenu(page => page.locator('.v-main .acc-select-group .v-select'))(page)
    },
    next: async (page: Page) => {
      if ((page.viewportSize()?.width ?? 1440) < 976) {
        return
      }
      const selector = page.getByTestId(selectorTestId).locator('.v-field')
      await whenVisible(selector, async () => {
        await selector.click()
        await settled(page.locator('.v-overlay--active .v-overlay__content'))
      })
    },
  }
}
