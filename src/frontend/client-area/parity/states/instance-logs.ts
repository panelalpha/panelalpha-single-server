import type { FulfillSpec, Handler, Probe } from './state'
import type { Locator, Page } from '@playwright/test'
import { INSTANCE_PAGE_PRIVILEGES, instancePageRaw } from './instance'
import { screenshotHandlers } from './instances'
import { liteAppUsers, liteAppUsersHandler } from './instances-lite'
import { inDays, isDesktop, shellHandlers } from './shell'

// S-95 ui-instance-logs: the Logs page of a project inside the Advanced frame, measured on app-lite (`/projects/:id/advanced/logs`,
// `target: 'lite'`). Not a spec file (testMatch is `*.parity.ts`). States and their registration: `instance-logs.parity.ts`.
// Plan: context/changes/ui-instance-logs/plan.md.

export const LOGS_PROJECT_ID = 41

/** The privileges of the four tabs a WordPress project can show (the deploy tab needs a `custom` project on top). */
export const LOGS_PRIVILEGES = [...INSTANCE_PAGE_PRIVILEGES, 'wordpress.view_logs', 'general.view_php_logs', 'general.view_webserver_logs']

/** `GET /projects/41` of the Logs page: a WordPress project with every log privilege. `overrides` add fields. */
export function logsInstance (overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return instancePageRaw(LOGS_PROJECT_ID, { type: 'wordpress', app_type: 'wordpress', privileges: LOGS_PRIVILEGES, ...overrides })
}

/** A project of `type: 'custom'`: the Deploy Logs tab shows (`canViewDeployLogs`). */
export const logsCustomInstance = logsInstance({ type: 'custom', app_type: 'custom' })

/** A project without any log privilege (`tabs.length === 0`: the frame renders no tab and no card). */
export const logsNoPrivilegesInstance = logsInstance({ privileges: INSTANCE_PAGE_PRIVILEGES.filter(privilege => !privilege.includes('logs')) })

interface LogUser { email: string, first_name: string | null, last_name: string | null, role: string | null }

const OWNER: LogUser = { email: 'jan.kowalski@example.com', first_name: 'Jan', last_name: 'Kowalski', role: null }
const ADMIN: LogUser = { email: 'anna.nowak@example.com', first_name: 'Anna', last_name: 'Nowak', role: 'admin' }
const COLLABORATOR: LogUser = { email: 'piotr.zielinski@example.com', first_name: null, last_name: null, role: 'full_access_collaborator' }

/** Ten rows, newest first: POST (green chip), DELETE (red chip), PUT (orange chip), the three user shapes (owner, role, bare e-mail). */
export function logRows (): Array<Record<string, unknown>> {
  const rows: Array<[LogUser, string, string, number, Record<string, unknown>?]> = [
    [OWNER, 'user.instance.plugin.install', 'POST', -0.02, { 'App\\Http\\Resources\\PluginResource:1': { title: 'Contact Form 7' } }],
    [ADMIN, 'user.instance.backup.delete', 'DELETE', -0.1],
    [COLLABORATOR, 'user.instance.update_site_name', 'PUT', -0.5],
    [OWNER, 'user.instance.clear_cache', 'POST', -1],
    [ADMIN, 'user.instance.plugin.deactivate', 'PUT', -2],
    [OWNER, 'user.instance.theme.install', 'POST', -3],
    [COLLABORATOR, 'user.instance.wordpress_user.delete', 'DELETE', -5],
    [ADMIN, 'user.instance.backup.create', 'POST', -8],
    [OWNER, 'user.instance.maintenance_mode.update', 'PUT', -13],
    [OWNER, 'user.instance.wordpress.update', 'POST', -21],
  ]
  return rows.map(([user, action, request_method, days, payload]) => ({ user, action, request_method, payload: payload ?? null, date: inDays(days) }))
}

/** `GET /projects/41/logs` answer: the ten rows and a total of 24 (three pages of ten, so the footer shows its pager). */
export const LOGS_PAGE: Handler = { json: { data: logRows(), meta: { total: 24 } } }

/** No rows at all (empty) and a search with no match (the term comes back in the no-results container). */
export const LOGS_EMPTY: FulfillSpec = { json: { data: [], meta: { total: 0 } } }

export const WORDPRESS_LOG = [
  '[27-Oct-2026 08:11:02 UTC] PHP Notice:  Undefined index: title in /var/www/html/wp-content/themes/studio/functions.php on line 42',
  '[27-Oct-2026 08:11:05 UTC] PHP Warning:  Invalid argument supplied for foreach() in /var/www/html/wp-content/plugins/form/form.php on line 118',
  '[27-Oct-2026 08:12:40 UTC] WordPress database error Table \'wp_options\' doesn\'t exist for query SELECT option_value FROM wp_options',
  '[27-Oct-2026 08:14:09 UTC] PHP Deprecated:  Function create_function() is deprecated in /var/www/html/wp-content/plugins/legacy/legacy.php on line 7',
].join('\n').repeat(6)

export const PHP_LOG = [
  '[27-Oct-2026 07:58:11 UTC] PHP Fatal error:  Uncaught Error: Call to undefined function studio_boot() in /var/www/html/index.php:12',
  '[27-Oct-2026 07:58:11 UTC] Stack trace:',
  '[27-Oct-2026 07:58:11 UTC] #0 {main}',
  '[27-Oct-2026 07:58:11 UTC]   thrown in /var/www/html/index.php on line 12',
].join('\n').repeat(6)

export const WEBSERVER_FILES = [
  { name: 'access.log', size: 18_432, plain_text: true },
  { name: 'error.log', size: 2048, plain_text: true },
  { name: 'access.log.1.gz', size: 104_857, plain_text: false },
]

export const WEBSERVER_LOG = [
  '203.0.113.7 - - [27/Oct/2026:08:01:12 +0000] "GET / HTTP/1.1" 200 5123 "-" "Mozilla/5.0"',
  '203.0.113.7 - - [27/Oct/2026:08:01:13 +0000] "GET /wp-content/themes/studio/style.css HTTP/1.1" 200 8120 "https://studio.example.com/" "Mozilla/5.0"',
  '198.51.100.23 - - [27/Oct/2026:08:02:40 +0000] "POST /wp-login.php HTTP/1.1" 302 0 "-" "curl/8.4.0"',
].join('\n').repeat(8)

/** Deploy logs of a custom project (legacy `LITE apis/Instances.js:31-55`): one finished run and one failed run. */
export const DEPLOY_LOG_LIST: Handler = {
  json: {
    data: [
      { id: 12, status: 'failed', source_type: 'git', started_at: inDays(-1), finished_at: inDays(-0.99), created_at: inDays(-1) },
      { id: 11, status: 'success', source_type: 'files', started_at: inDays(-3), finished_at: inDays(-2.99), created_at: inDays(-3) },
    ],
  },
}

/**
 * Handlers of the Logs page on lite: the shell, the project GET and the project calls the frame makes (as `advancedFrameHandlers`),
 * plus the five log endpoints. `overrides` replace any key, so a state changes one call without losing the rest.
 */
export function logsHandlers (overrides: Record<string, Handler> = {}, instance: Record<string, unknown> = logsInstance()): Record<string, Handler> {
  const base = `/projects/${LOGS_PROJECT_ID}`
  return {
    ...shellHandlers([], 'projects'),
    [`GET ${base}`]: { json: { data: instance } },
    [`GET ${base}/app-health`]: { json: { data: { available: true, healthy: true, serving: 'ok', ports: [], checks: [] } } },
    ...screenshotHandlers([instance], 'projects'),
    [`GET ${base}/source`]: { json: { data: null } },
    [`GET ${base}/wordpress/maintenance-mode`]: { json: { status: false } },
    [`GET ${base}/wordpress/debug-mode`]: { json: { status: false } },
    [`GET ${base}/wordpress/automatic-backup`]: { json: { data: { enabled: false } } },
    'GET /server-accounts/1/ssl/certificate/detected': { json: { data: null } },
    ...liteAppUsersHandler(LOGS_PROJECT_ID, liteAppUsers),
    [`GET ${base}/logs`]: LOGS_PAGE,
    [`GET ${base}/wordpress/logs`]: { json: { data: WORDPRESS_LOG } },
    [`GET ${base}/php-logs`]: { json: { data: PHP_LOG } },
    [`GET ${base}/webserver-logs`]: { json: { data: WEBSERVER_FILES } },
    [`GET ${base}/webserver-logs/access.log`]: { json: { data: WEBSERVER_LOG } },
    [`GET ${base}/deploy-logs`]: { json: { data: [] } },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------------------------
// Probes. Both apps keep the legacy classes of the page (`page-title__title-box`, `.data-table`, `.custom-sort`, `.action-name`,
// `.data-iterator-footer`, `.nodata-container`); the active tab is `.v-tab--active` on legacy and `.v-tab--selected` on next.
// ---------------------------------------------------------------------------------------------

const both = (locator: (page: Page) => Locator): Pick<Probe, 'legacy' | 'next'> => ({ legacy: locator, next: locator })

/** The title container, its row and the title box (the frame of the tab strip: padding and margins decide where the strip starts). */
export const logsTitleContainerProbe: Probe = { key: 'logs-title-container', ...both(page => page.locator('.page-title').first()) }
export const logsTitleRowProbe: Probe = { key: 'logs-title-row', ...both(page => page.locator('.page-title > .v-row, .page-title > .row').first()) }
export const logsTitleBoxProbe: Probe = { key: 'logs-title-box', ...both(page => page.locator('.page-title__title-box').first()) }
export const logsTabProbes: Probe[] = [0, 1, 2, 3].map(index => ({ key: `logs-tab-${index}`, ...both(page => page.locator('.page-title__title-box .v-tab').nth(index)) }))
export const logsPhpIconProbe: Probe = { key: 'logs-php-icon', ...both(page => page.locator('.page-title__title-box .v-tab').nth(2).locator('svg, .v-icon').first()) }
export const logsSearchProbe: Probe = { key: 'logs-search', ...both(page => page.locator('.page-title__filter-controls .v-field, .page-title__filter-controls .v-input__slot').first()) }

export const logsTableElementProbe: Probe = { key: 'logs-table-element', ...both(page => page.locator('.data-table table').first()) }
export const logsHeadCellProbes: Probe[] = [0, 1, 2].map(index => ({ key: `logs-head-cell-${index}`, ...both(page => page.locator('tr.custom-sort td').nth(index)) }))
export const logsBodyCellProbes: Probe[] = [0, 1, 2].map(index => ({ key: `logs-body-cell-${index}`, ...both(page => page.locator('.data-table tbody tr').first().locator('td').nth(index)) }))

/** The tab strip (the readiness anchor of every state). */
export const logsTabsProbe: Probe = { key: 'logs-tabs', ...both(page => page.locator('.page-title__title-box .v-tabs').first()) }

/** The selected tab. */
export const logsSelectedTabProbe: Probe = {
  key: 'logs-selected-tab',
  legacy: page => page.locator('.page-title__title-box .v-tab--active').first(),
  next: page => page.locator('.page-title__title-box .v-tab--selected').first(),
}

/** The filter controls of the title row (the search field of the Instance Logs tab). */
export const logsFilterProbe: Probe = { key: 'logs-filter', ...both(page => page.locator('.page-title__filter-controls').first()) }

/** The table card of the Instance Logs tab. */
export const logsTableProbe: Probe = { key: 'logs-table', ...both(page => page.locator('.data-table').first()) }

/** The sort header row (desktop only: below 1400 px legacy has no header). */
export const logsSortRowProbe: Probe = { key: 'logs-sort-row', when: isDesktop, ...both(page => page.locator('tr.custom-sort').first()) }

/** The first body row, its user cell, action chip and date. */
export const logsFirstRowProbe: Probe = { key: 'logs-first-row', ...both(page => page.locator('.data-table tbody tr').first()) }
export const logsUserChipProbe: Probe = { key: 'logs-user-chip', ...both(page => page.locator('.data-table tbody tr').first().locator('.v-chip').first()) }
export const logsActionChipProbe: Probe = { key: 'logs-action-chip', ...both(page => page.locator('.data-table .action-name').first()) }
export const logsDeleteChipProbe: Probe = { key: 'logs-delete-chip', ...both(page => page.locator('.data-table .action-name--delete, .data-table .action-name.red').first()) }
export const logsInformationProbe: Probe = { key: 'logs-information', ...both(page => page.locator('.data-table .information').first()) }
export const logsDateProbe: Probe = { key: 'logs-date', when: isDesktop, ...both(page => page.locator('.data-table tbody tr').first().locator('td').last().locator('span').first()) }

/** The pager and the per-page switch. */
export const logsFooterProbe: Probe = { key: 'logs-footer', ...both(page => page.locator('.data-iterator-footer').first()) }

export const logsDefaultProbes: Probe[] = [
  logsTabsProbe,
  logsTitleContainerProbe,
  logsTableElementProbe,
  ...logsHeadCellProbes,
  ...logsBodyCellProbes,
  logsTitleRowProbe,
  logsTitleBoxProbe,
  ...logsTabProbes,
  logsPhpIconProbe,
  logsSearchProbe,
  logsSelectedTabProbe,
  logsFilterProbe,
  logsTableProbe,
  logsSortRowProbe,
  logsFirstRowProbe,
  logsUserChipProbe,
  logsActionChipProbe,
  logsInformationProbe,
  logsDateProbe,
  logsFooterProbe,
]

// ---------------------------------------------------------------------------------------------
// Probes of the other tabs and states.
// ---------------------------------------------------------------------------------------------

/** The card of the active tab (`.v-window-item--active` on both: V2 `v-tabs-items`, V4 `v-window`). */
export const logsPanelCardProbe: Probe = { key: 'logs-panel-card', ...both(page => page.locator('.v-window-item--active .v-card').first()) }
export const logsInfoRowProbe: Probe = { key: 'logs-info-row', ...both(page => page.locator('.v-window-item--active .border-bottom-gray').first()) }
export const logsDownloadProbe: Probe = { key: 'logs-download', ...both(page => page.locator('.v-window-item--active .border-bottom-gray .v-btn').first()) }
export const logsDownloadIconProbe: Probe = { key: 'logs-download-icon', ...both(page => page.locator('.v-window-item--active .border-bottom-gray .v-btn .v-icon').first()) }
export const logsDownloadContentProbe: Probe = { key: 'logs-download-content', ...both(page => page.locator('.v-window-item--active .border-bottom-gray .v-btn .v-btn__content').first()) }
export const logsPreProbe: Probe = { key: 'logs-pre', ...both(page => page.locator('.v-window-item--active pre').first()) }
export const logsNoDataProbe: Probe = { key: 'logs-no-data', ...both(page => page.locator('.v-window-item--active .nodata-container').first()) }
export const logsNoDataTitleProbe: Probe = { key: 'logs-no-data-title', ...both(page => page.locator('.v-window-item--active .nodata-container__title').first()) }
export const logsNoDataButtonProbe: Probe = { key: 'logs-no-data-button', ...both(page => page.locator('.v-window-item--active .nodata-container .v-btn').first()) }
export const logsLoaderProbe: Probe = { key: 'logs-loader', ...both(page => page.locator('.v-window-item--active .loader').first()) }
export const logsSkeletonProbe: Probe = { key: 'logs-skeleton', ...both(page => page.locator('.data-table tbody.item').first()) }
export const logsNoResultsProbe: Probe = { key: 'logs-no-results', ...both(page => page.locator('.no-results-container').first()) }
export const logsNoRowsProbe: Probe = { key: 'logs-no-rows', ...both(page => page.locator('.data-table tbody tr').first()) }
export const logsFileSelectProbe: Probe = { key: 'logs-file-select', ...both(page => page.locator('.page-title__filter-controls .v-select').first()) }
export const logsDeployConsoleProbe: Probe = { key: 'logs-deploy-console', ...both(page => page.locator('.v-window-item--active .deploy-console').first()) }

/** The tab strip and its selected tab only: the readiness anchor of every non-default state. */
export const logsFrameProbes: Probe[] = [logsTabsProbe, logsSelectedTabProbe]

/** The tab `index` of the strip (instance 0, wordpress 1, php 2, webserver 3 on a WordPress project; deploy sits at 1 on a custom one). */
export const logsTab = (index: number) => (page: Page) => page.locator('.page-title__title-box .v-tab').nth(index)
