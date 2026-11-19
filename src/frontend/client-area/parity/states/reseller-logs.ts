import type { Handler, ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { tr } from './auth'
import { waitFor } from './hosting'
import { hoverResellerErrorAlert, RESELLER_HOME, resellerAlertProbe, resellerDividerProbe, resellerSidebarActiveProbe, resellerTitleProbe } from './reseller-users'
import { inDays, isDesktop, liteTabs, NOW, shellHandlers, shellState } from './shell'

// S-125 ui-reseller-logs: the Reseller Area frame and the Logs page on app-lite (`/reseller-area/logs`, `target: 'lite'`, M-2 default).
// Not a spec file (testMatch is `*.parity.ts`). States: `reseller-logs.parity.ts`. Plan: context/changes/ui-reseller-logs/plan.md.
// The frame probes and the home fixture come from `reseller-users.ts` (S-122), the same Reseller Area shell.

/** The page path of the states. */
export const RESELLER_LOGS_PATH = '/reseller-area/logs'

type LogUser = { email: string, first_name: string | null, last_name: string | null, role: string | null }

const OWNER: LogUser = { email: 'jan.kowalski@example.com', first_name: 'Jan', last_name: 'Kowalski', role: null }
const ADMIN: LogUser = { email: 'anna.nowak@example.com', first_name: 'Anna', last_name: 'Nowak', role: 'admin' }
const COLLABORATOR: LogUser = { email: 'piotr.zielinski@example.com', first_name: null, last_name: null, role: 'full_access_collaborator' }

/**
 * Ten rows, newest first: POST (green chip), DELETE (red chip), PUT (orange chip), the three user shapes (owner, role, bare e-mail), and one
 * long project name (the link ellipsis). Each row names its project in the `App\Models\Application:<id>` payload key (`logInstance`).
 * The actions read only that key: legacy `LogItem` throws on an action whose resource is missing from the payload (plugin, backup, theme),
 * which blanks its whole cell, so the fixture uses the actions that render with an Application payload alone.
 * The request method is the chip colour and does not have to match the action (`DELETE` on a clear-cache row).
 */
export function resellerLogRows (): Array<Record<string, unknown>> {
  const rows: Array<[LogUser, string, string, number, string, string]> = [
    [OWNER, 'user.instance.backup.create', 'POST', -0.02, 'Studio Site', 'https://studio.example.com'],
    [ADMIN, 'user.instance.clear_cache', 'DELETE', -0.1, 'Shop', 'https://shop.example.com'],
    [COLLABORATOR, 'user.instance.update_site_name', 'PUT', -0.5, 'Portfolio', 'https://portfolio.example.com'],
    [OWNER, 'user.instance.clear_cache', 'POST', -1, 'A very long project name that needs the ellipsis', 'https://long.example-company-name.example.com'],
    [ADMIN, 'user.instance.maintenance_mode.update', 'PUT', -2, 'Blog', 'https://blog.example.com'],
    [OWNER, 'user.instance.backup.create', 'POST', -3, 'Studio Site', 'https://studio.example.com'],
    [COLLABORATOR, 'user.instance.clear_cache', 'DELETE', -5, 'Shop', 'https://shop.example.com'],
    [ADMIN, 'user.instance.backup.create', 'POST', -8, 'Blog', 'https://blog.example.com'],
    [OWNER, 'user.instance.maintenance_mode.update', 'PUT', -13, 'Portfolio', 'https://portfolio.example.com'],
    [OWNER, 'user.instance.wordpress.update', 'POST', -21, 'Studio Site', 'https://studio.example.com'],
  ]
  return rows.map(([user, action, requestMethod, days, name, url], index) => ({
    id: index + 1,
    user,
    action,
    request_method: requestMethod,
    payload: { [String.raw`App\Models\Application:${index + 1}`]: { name, url } },
    date: inDays(days),
  }))
}

/** `GET /reseller/instances-logs` answer: the rows and a total (the footer pages from it; the default per-page is 50). */
export function resellerLogsPage (rows: Array<Record<string, unknown>>, total: number): { json: { data: Array<Record<string, unknown>>, meta: { total: number } } } {
  return { json: { data: rows, meta: { total } } }
}

/** No rows at all: the empty copy. */
export const RESELLER_LOGS_EMPTY = resellerLogsPage([], 0)

/** The page shell handlers plus the logs endpoint (ten rows, total 120: three pages). `overrides` replace any key. */
export function resellerLogsHandlers (overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    ...shellHandlers([], 'projects'),
    'GET /reseller/instances-logs': resellerLogsPage(resellerLogRows(), 120),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------------------------
// Probes. The Logs page keeps the legacy classes (`.logs-table__instance`, `.user-item`, `.action-name`, `.data-iterator-footer`),
// so both apps share one locator per probe.
// ---------------------------------------------------------------------------------------------

const both = (locator: (page: Page) => Locator): Pick<Probe, 'legacy' | 'next'> => ({ legacy: locator, next: locator })

export const resellerLogsTitleProbe: Probe = { key: 'reseller-logs-title', ...both(page => page.locator('.title-row h4')) }

export const resellerLogsSearchProbe: Probe = { key: 'reseller-logs-search', ...both(page => page.locator('.data-iterator-filter-controls').first()) }

export const resellerLogsTableProbe: Probe = { key: 'reseller-logs-table', ...both(page => page.locator('.v-card.data-table').first()) }

/** The sort header row (`TableCustomSort`), desktop only: the mobile cards carry the labels. */
export const resellerLogsHeaderProbe: Probe = { key: 'reseller-logs-header', when: isDesktop, ...both(page => page.locator('tr.custom-sort').first()) }

/** The first data row: a table row on desktop, a `.mobile-table-item` card below 1400 px (skeleton rows excluded). */
export const resellerLogsRowProbe: Probe = { key: 'reseller-logs-row', ...both(page => page.locator('tbody tr:not(.skeleton), .mobile-table-item').first()) }

export const resellerLogsUserProbe: Probe = { key: 'reseller-logs-user', ...both(page => page.locator('.user-item').first()) }

export const resellerLogsProjectProbe: Probe = { key: 'reseller-logs-project', ...both(page => page.locator('.logs-table__instance').first()) }

export const resellerLogsActionProbe: Probe = { key: 'reseller-logs-action', ...both(page => page.locator('.action-name').first()) }

export const resellerLogsInformationProbe: Probe = { key: 'reseller-logs-information', ...both(page => page.locator('.logs-table__log-item .information').first()) }

/** The relative date of the first row (the tooltip activator span; legacy `gray--text text--darken-1`, next `text--gray-darken1`). */
export const resellerLogsDateProbe: Probe = { key: 'reseller-logs-date', ...both(page => page.locator('span.mb-0.text-right').first()) }

export const resellerLogsFooterProbe: Probe = { key: 'reseller-logs-footer', ...both(page => page.locator('.data-iterator-footer').first()) }

/** The footer's previous-page button. V2 `.v-pagination__navigation` is prev then next; V4 the `.v-btn` inside `li.v-pagination__prev`. Disabled on page 1. */
export const resellerLogsPagerPrevProbe: Probe = {
  key: 'reseller-logs-pager-prev',
  legacy: page => page.locator('.data-iterator-footer .v-pagination__navigation').nth(0),
  next: page => page.locator('.data-iterator-footer .v-pagination__prev .v-btn'),
}

/** The footer's next-page button (V2 second `.v-pagination__navigation`; V4 the `.v-btn` inside `li.v-pagination__next`). Disabled on the last page. */
export const resellerLogsPagerNextProbe: Probe = {
  key: 'reseller-logs-pager-next',
  legacy: page => page.locator('.data-iterator-footer .v-pagination__navigation').nth(1),
  next: page => page.locator('.data-iterator-footer .v-pagination__next .v-btn'),
}

/** The Date header item of the sort row (`TableCustomSort`, the only sortable column). Desktop only: the mobile cards have no header. */
export const sortDateHeader = (page: Page): Locator => page.locator('tr.custom-sort .custom-sort__item--sortable').filter({ hasText: tr('table.header.date', 'lite') }).first()

/** The first row's project link under the pointer: its colour moves to primary (`LogsTable.scss`, `.logs-table__instance:hover`). */
export const resellerLogsProjectHoverProbe: Probe = { key: 'reseller-logs-project-hover', ...both(page => page.locator('.logs-table__instance').first()) }

/** The first row's project link with keyboard focus (`:focus-visible`): the link is the only focusable element of the row (`LogsTableCell.vue:6-12`). */
export const resellerLogsProjectFocusProbe: Probe = { key: 'reseller-logs-project-focus', ...both(page => page.locator('.logs-table__instance').first()) }

/** The Date sort header under the pointer (hover colour and the sort arrow). Desktop only. */
export const resellerLogsSortItemHoverProbe: Probe = { key: 'reseller-logs-sort-item-hover', when: isDesktop, ...both(sortDateHeader) }

/** The arrow of the Date sort header: `up` for ascending, `down` for descending (`.custom-sort__arrow-up` on both). Desktop only. */
export const resellerLogsSortArrowProbe: Probe = { key: 'reseller-logs-sort-arrow', when: isDesktop, ...both(page => sortDateHeader(page).locator('.custom-sort__arrow-up').first()) }

/** The active page size in the footer (`.active` on the size button, both apps). Desktop only: the mobile footer has no size switch. */
export const resellerLogsPerPageActiveProbe: Probe = { key: 'reseller-logs-per-page-active', when: isDesktop, ...both(page => page.locator('.data-iterator-page-number .active').first()) }

/** The fixed `YYYY-MM-DD HH:mm` text of the date tooltip (`formatDateTime`, local time). */
const DATE_TOOLTIP_TEXT = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/

/** The date tooltip under the pointer, once open: legacy `.menuable__content__active`, next the overlay of `v-tooltip`. */
export const resellerLogsDateTooltipProbe: Probe = {
  key: 'reseller-logs-date-tooltip',
  legacy: page => page.locator('.v-tooltip__content.menuable__content__active').filter({ hasText: DATE_TOOLTIP_TEXT }).first(),
  next: page => page.locator('.v-tooltip > .v-overlay__content').filter({ hasText: DATE_TOOLTIP_TEXT }).first(),
  internal: true,
}

/** The page probes after the frame probes (title, divider, active sidebar item). */
export const resellerLogsProbes: Probe[] = [
  resellerTitleProbe,
  resellerDividerProbe,
  resellerSidebarActiveProbe,
  resellerLogsTitleProbe,
  resellerLogsSearchProbe,
  resellerLogsTableProbe,
  resellerLogsHeaderProbe,
  resellerLogsRowProbe,
  resellerLogsUserProbe,
  resellerLogsProjectProbe,
  resellerLogsActionProbe,
  resellerLogsInformationProbe,
  resellerLogsDateProbe,
  resellerLogsFooterProbe,
]

// Phase 7: hover of the first row's date (the relative time, `LogsTableCell.vue`); the tooltip opens after `open-delay` 150 ms.
function hoverDate (next: boolean): StateAction {
  const locate = (page: Page) => (next ? resellerLogsDateProbe.next : resellerLogsDateProbe.legacy)(page)
  const tooltip = (page: Page) => (next ? resellerLogsDateTooltipProbe.next : resellerLogsDateTooltipProbe.legacy)(page)
  return async page => {
    const element = locate(page)
    await expect(async () => {
      await page.mouse.move(0, 0)
      await element.hover()
      await expect(tooltip(page)).toBeVisible({ timeout: 2500 })
    }).toPass({ timeout: 15_000 })
  }
}

function stillHoveredDate (next: boolean): StateAction {
  const locate = (page: Page) => (next ? resellerLogsDateProbe.next : resellerLogsDateProbe.legacy)(page)
  const tooltip = (page: Page) => (next ? resellerLogsDateTooltipProbe.next : resellerLogsDateTooltipProbe.legacy)(page)
  return async page => {
    expect(await locate(page).evaluate(element => element.matches(':hover')), 'pointer on the date after the capture').toBe(true)
    await expect(tooltip(page), 'date tooltip still open after the capture').toBeVisible()
  }
}

/** `reseller-logs-date-tooltip`: the pointer rests on the first row's date, so the tooltip with the exact date and time shows. */
export function resellerLogsDateTooltipState (): Omit<ParityState, 'id'> {
  const base = resellerLogsState({ probes: [resellerLogsDateTooltipProbe] })
  return {
    ...base,
    pointer: 'keep',
    actions: {
      legacy: [...base.actions.legacy, hoverDate(false)],
      next: [...base.actions.next, hoverDate(true)],
    },
    afterCapture: {
      legacy: [stillHoveredDate(false)],
      next: [stillHoveredDate(true)],
    },
  }
}

/** The no-data copy (`no-data-container`), shown when there are no rows, with or without an error. */
export const resellerLogsEmptyTitleProbe: Probe = { key: 'reseller-logs-empty-title', ...both(page => page.locator('.no-data-container__title').first()) }

/** The probes that need a row: the header, the rows, the footer. With no rows both apps drop them (legacy `logs.length`, next `logs.length > 0`). */
const resellerLogsRowOnlyProbes = new Set<Probe>([
  resellerLogsHeaderProbe,
  resellerLogsRowProbe,
  resellerLogsUserProbe,
  resellerLogsProjectProbe,
  resellerLogsActionProbe,
  resellerLogsInformationProbe,
  resellerLogsDateProbe,
  resellerLogsFooterProbe,
])

// Phase 10: `GET /reseller/instances-logs` answers 500. Both apps keep the empty copy (no rows, no header, no footer) and show the error
// alert. The page title is the readiness anchor (no row link exists), and the alert is hovered before the capture so its timer stops.
export function resellerLogsErrorState (): Omit<ParityState, 'id'> {
  const base = resellerLogsState({
    handlers: { 'GET /reseller/instances-logs': { status: 500, json: { message: 'Server Error' } } },
    ready: resellerLogsTitleProbe.legacy,
    legacy: [hoverResellerErrorAlert],
    next: [hoverResellerErrorAlert],
    probes: [resellerLogsEmptyTitleProbe, resellerAlertProbe],
  })
  return {
    ...base,
    pointer: 'keep',
    probes: base.probes.filter(probe => !resellerLogsRowOnlyProbes.has(probe)),
  }
}

/** The illustration of the no-data block (`NoDataTableLogs`, the svg directly under `.no-data-container`). */
export const resellerLogsEmptyIllustrationProbe: Probe = { key: 'reseller-logs-empty-illustration', ...both(page => page.locator('.no-data-container > svg').first()) }

/** The description under the no-data title (`reseller.logs.noLogsDesc`). */
export const resellerLogsEmptyDescriptionProbe: Probe = { key: 'reseller-logs-empty-description', ...both(page => page.locator('.no-data-container__description').first()) }

/** The no-results container of a search that finds nothing (`DataIteratorNoResultsContainer`, with the clear button). */
export const resellerLogsNoResultsProbe: Probe = { key: 'reseller-logs-no-results', ...both(page => page.locator('.no-results-container').first()) }

/** Phase 11: no rows at all (`RESELLER_LOGS_EMPTY`): the no-data block, no sort header, no footer (legacy `logs.length`, next `logs.length > 0`). */
export function resellerLogsEmptyState (): Omit<ParityState, 'id'> {
  const base = resellerLogsState({
    handlers: { 'GET /reseller/instances-logs': RESELLER_LOGS_EMPTY },
    ready: resellerLogsEmptyTitleProbe.legacy,
    probes: [resellerLogsEmptyIllustrationProbe, resellerLogsEmptyTitleProbe, resellerLogsEmptyDescriptionProbe],
  })
  return {
    ...base,
    probes: base.probes.filter(probe => !resellerLogsRowOnlyProbes.has(probe)),
  }
}

/** Phase 11: a search that finds nothing: the no-results container replaces the no-data block; the header and the footer go (no rows). */
export function resellerLogsSearchEmptyState (actions: { legacy: StateAction[], next: StateAction[] }): Omit<ParityState, 'id'> {
  const base = resellerLogsState({
    handlers: { 'GET /reseller/instances-logs': [resellerLogsPage(resellerLogRows(), 120), RESELLER_LOGS_EMPTY] },
    legacy: actions.legacy,
    next: actions.next,
    probes: [resellerLogsNoResultsProbe],
  })
  return {
    ...base,
    probes: base.probes.filter(probe => !resellerLogsRowOnlyProbes.has(probe)),
  }
}

/** The skeleton of the logs table while `GET /reseller/instances-logs` is pending: five text rows (desktop) or five cards (below `lg`). */
export const resellerLogsSkeletonProbe: Probe = { key: 'reseller-logs-skeleton', ...both(page => page.locator('.v-card.data-table .v-skeleton-loader').first()) }

/** The animated bones of the skeleton are masked (same masks as the Users skeleton, `reseller-users.ts`). */
export const resellerLogsSkeletonMasks = {
  legacy: [(page: Page) => page.locator('.v-card.data-table .v-skeleton-loader')],
  next: [(page: Page) => page.locator('.v-card.data-table .v-skeleton-loader')],
}

/** Phase 12: the logs request hangs (`'hold'`). Legacy `LogsTable.vue` `fetchingLogs` renders the skeleton in the body (`:76-82`), and the
 * footer and header wait for rows (`logs.length`), so they are dropped. */
export function resellerLogsLoadingState (): Omit<ParityState, 'id'> {
  const base = resellerLogsState({
    handlers: { 'GET /reseller/instances-logs': 'hold' },
    ready: resellerLogsSkeletonProbe.legacy,
    probes: [resellerLogsSkeletonProbe],
  })
  return {
    ...base,
    masks: resellerLogsSkeletonMasks,
    probes: base.probes.filter(probe => !resellerLogsRowOnlyProbes.has(probe)),
  }
}

// ---------------------------------------------------------------------------------------------
// State skeleton
// ---------------------------------------------------------------------------------------------

export interface ResellerLogsStateOptions {
  /** Overrides keyed by `METHOD /path`, applied after the defaults. */
  handlers?: Record<string, Handler>
  /** The readiness anchor (the first wait). Default: the first row's project link. */
  ready?: (page: Page) => Locator
  /** Steps after the anchor is visible, before the state's probes. */
  legacy?: StateAction[]
  next?: StateAction[]
  probes?: Probe[]
}

/** Everything a reseller logs state shares: signed in, single server with the reseller tab, `/reseller-area/logs`, a fixed clock. */
export function resellerLogsState (options: ResellerLogsStateOptions = {}): Omit<ParityState, 'id'> {
  const ready = options.ready ?? (page => page.locator('.logs-table__instance').first())
  const base = shellState({
    target: 'lite',
    path: RESELLER_LOGS_PATH,
    home: RESELLER_HOME,
    tabs: [liteTabs[0], { key: 'reseller-area' }],
    activeTab: 'reseller-area',
    clock: NOW,
    probes: [...resellerLogsProbes, ...(options.probes ?? [])],
  })
  return {
    ...base,
    handlers: {
      ...resellerLogsHandlers(),
      ...options.handlers,
    },
    actions: {
      legacy: [waitFor(ready), ...(options.legacy ?? [])],
      next: [waitFor(ready), ...(options.next ?? [])],
    },
  }
}
