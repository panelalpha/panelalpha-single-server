import type { Handler, ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { settled } from './auth'
import { waitFor } from './hosting'
import { liteProject } from './instances'
import { isDesktop, liteTabs, NOW, shellHandlers, shellState, singleServerHome } from './shell'

// S-122 ui-reseller-users: the Reseller Area frame and the Users page on app-lite (`/reseller-area/users`, `target: 'lite'`, M-2 default).
// Not a spec file (testMatch is `*.parity.ts`). States: `reseller-users.parity.ts`. Plan: context/changes/ui-reseller-users/plan.md.

/**
 * The single-server `/home` with `reseller_settings` set and without the `admin` key: the style manager drawer would widen the
 * full-page shot (as `USERS_HOME` of `instance-users.ts` does). `shellState` adds `admin` only when it is given.
 */
const { admin: _styleManagerAdmin, ...liteSingleServer } = singleServerHome()
export const RESELLER_HOME: { app: Record<string, unknown>, user: Record<string, unknown> } = {
  app: liteSingleServer.app,
  user: { ...liteSingleServer.user, reseller_settings: {} },
}

/** The page path of the states. */
export const RESELLER_USERS_PATH = '/reseller-area/users'

export interface ResellerUserRow {
  id: number
  name: string
  email: string
  instances_count: number
}

/**
 * Nine users. Default sort is the name ascending, so `bob` is the first row (the readiness anchor). `nina@example.com` has the name
 * equal to the e-mail (the "not set" copy), one e-mail is long (the ellipsis), and the counts are 0, 1, 3 and 12 (chip values).
 */
export const resellerUsers: ResellerUserRow[] = [
  { id: 2, name: 'bob', email: 'bob@example.com', instances_count: 3 },
  { id: 3, name: 'carol', email: 'carol@example.com', instances_count: 1 },
  { id: 4, name: 'dave', email: 'dave.with.a.really.long.mailbox.name.for.ellipsis@subdomain.example-company-name.com', instances_count: 12 },
  { id: 5, name: 'erin', email: 'erin@example.com', instances_count: 0 },
  { id: 6, name: 'frank', email: 'frank@example.com', instances_count: 1 },
  { id: 7, name: 'grace', email: 'grace@example.com', instances_count: 0 },
  { id: 8, name: 'heidi', email: 'heidi@example.com', instances_count: 3 },
  { id: 9, name: 'ivan', email: 'ivan@example.com', instances_count: 0 },
  { id: 10, name: 'nina@example.com', email: 'nina@example.com', instances_count: 0 },
]

/** The e-mail of the first row after the default sort: the readiness anchor of the list states. */
export const FIRST_ROW_EMAIL = 'bob@example.com'

/** `GET /reseller/users`: `{ data: rows }`. */
export const usersList = (rows: ResellerUserRow[] = resellerUsers): Handler => ({ json: { data: rows } })

/** The projects a user's tooltip lists: up to three, the second one suspended (the suspended chip). Zero for a user with no instances. */
function userProjects (user: ResellerUserRow): Array<Record<string, unknown>> {
  return Array.from({ length: Math.min(user.instances_count, 3) }, (_, index) => liteProject(user.id * 10 + index + 1, {
    name: `Site ${user.id}-${index + 1}`,
    ...(index === 1 ? { service_status: 'suspended' } : {}),
  }))
}

/**
 * `GET /reseller/users/<id>/projects` for every row: the tooltip of each row fetches on mount, also for `instances_count = 0` (N+1 kept
 * 1:1). The single-server client rewrites `instances` to `projects` (`resource-paths.ts`). `override` answers every row (`'hold'`).
 */
export function userInstancesHandlers (users: ResellerUserRow[] = resellerUsers, override?: Handler): Record<string, Handler> {
  return Object.fromEntries(users.map(user => [
    `GET /reseller/users/${user.id}/projects`,
    override ?? { json: { data: userProjects(user) } },
  ]))
}

// ---------------------------------------------------------------------------------------------
// Probes. The frame first (title, divider, the active sidebar item), then the Users page (title, search, table card, sort row, first row,
// the not-set copy, the instances chip, the trash icon). Legacy and next keep the same classes, except where the mapping notes a V2 class.
// ---------------------------------------------------------------------------------------------

export const resellerTitleProbe: Probe = {
  key: 'reseller-title',
  legacy: page => page.locator('.top-title h1'),
  next: page => page.locator('.top-title h1'),
}

export const resellerDividerProbe: Probe = {
  key: 'reseller-divider',
  legacy: page => page.locator('.v-divider').first(),
  next: page => page.locator('.v-divider').first(),
}

/** The active item of the sidebar: a list item on desktop, a tab below `lg` (V2 `--active`, V4 `--selected`). */
export const resellerSidebarActiveProbe: Probe = {
  key: 'reseller-sidebar-active',
  legacy: page => page.locator('.sticky-sidebar .v-list-item--active, .sticky-sidebar .v-tab--active').first(),
  next: page => page.locator('.sticky-sidebar .v-list-item--active, .sticky-sidebar .v-tab--selected').first(),
}

export const resellerUsersTitleProbe: Probe = {
  key: 'reseller-users-title',
  legacy: page => page.locator('.title-row h4'),
  next: page => page.locator('.title-row h4'),
}

export const resellerUsersSearchProbe: Probe = {
  key: 'reseller-users-search',
  legacy: page => page.locator('.data-iterator-filter-controls').first(),
  next: page => page.locator('.data-iterator-filter-controls').first(),
}

export const resellerUsersTableProbe: Probe = {
  key: 'reseller-users-table',
  legacy: page => page.locator('.v-card.data-table').first(),
  next: page => page.locator('.v-card.data-table').first(),
}

/** The sort header row (`TableCustomSort`), desktop only: the mobile cards carry the labels. */
export const resellerUsersHeaderProbe: Probe = {
  key: 'reseller-users-header',
  when: isDesktop,
  legacy: page => page.locator('tr.custom-sort').first(),
  next: page => page.locator('tr.custom-sort').first(),
}

/** The first data row: a table row on desktop, a `.mobile-table-item` card below 1400 px (the skeleton rows are excluded). */
export const resellerUsersRowProbe: Probe = {
  key: 'reseller-users-row',
  legacy: page => page.locator('tbody tr:not(.skeleton), .mobile-table-item').first(),
  next: page => page.locator('tbody tr:not(.skeleton), .mobile-table-item').first(),
}

export const resellerUsersChipProbe: Probe = {
  key: 'reseller-users-chip',
  legacy: page => page.locator('.label-purple').first(),
  next: page => page.locator('.label-purple').first(),
}

/** The "not set" copy of a row whose name is its e-mail (the last row after the default sort). */
export const resellerUsersNotSetProbe: Probe = {
  key: 'reseller-users-not-set',
  legacy: page => page.locator('.font-italic').first(),
  next: page => page.locator('.font-italic').first(),
}

/** The trash icon of the first row: the `.actions-row` cell on desktop, the card's button on mobile. */
export const resellerUsersDeleteProbe: Probe = {
  key: 'reseller-users-delete',
  legacy: page => page.locator('.actions-row .v-btn, .mobile-table-item .v-btn').first(),
  next: page => page.locator('.actions-row .v-btn, .mobile-table-item .v-btn').first(),
}

/** The first row's Delete icon on one side: the `.actions-row` button on desktop, the card's button on mobile. */
export function resellerUsersDeleteButton (next: boolean): (page: Page) => Locator {
  return page => (next ? resellerUsersDeleteProbe.next(page) : resellerUsersDeleteProbe.legacy(page))
}

/** The first data row on desktop: the hover state reads its background (`tr.highlight` in `_pageTitle.scss` under `.page-frame`). */
export const resellerUsersRowHoverProbe: Probe = {
  key: 'reseller-users-row-hover',
  legacy: page => page.locator('tbody tr:not(.skeleton)').first(),
  next: page => page.locator('tbody tr:not(.skeleton)').first(),
  when: isDesktop,
}

/** The hover overlay of the first row's Delete icon: V2 `::before`, V4 `.v-btn__overlay`. Desktop only. */
export const resellerUsersDeleteOverlayProbe: Probe = {
  key: 'reseller-users-delete-overlay',
  legacy: resellerUsersDeleteProbe.legacy,
  next: page => resellerUsersDeleteProbe.next(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
  when: isDesktop,
}

/** The Delete tooltip of the first row (`button.deleteUser`, "Delete User" in the lite copy). Desktop only: the mobile card has none. */
export const resellerUsersDeleteTooltipProbe: Probe = {
  key: 'reseller-users-delete-tooltip',
  legacy: page => page.locator('.menuable__content__active').filter({ hasText: 'Delete User' }),
  next: page => page.locator('.v-overlay--active .v-overlay__content').filter({ hasText: 'Delete User' }),
  when: isDesktop,
}

/** The focus overlay of the first row's Delete icon: V2 `::before` on `:focus`, V4 `.v-btn__overlay` on `:focus-visible`. All variants. */
export const resellerUsersDeleteFocusProbe: Probe = {
  key: 'reseller-users-delete-focus',
  legacy: resellerUsersDeleteProbe.legacy,
  next: page => resellerUsersDeleteProbe.next(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

/** The probes of the Users page, after the shell probes; the frame probes come first. */
export const resellerUsersProbes: Probe[] = [
  resellerTitleProbe,
  resellerDividerProbe,
  resellerSidebarActiveProbe,
  resellerUsersTitleProbe,
  resellerUsersSearchProbe,
  resellerUsersTableProbe,
  resellerUsersHeaderProbe,
  resellerUsersRowProbe,
  resellerUsersChipProbe,
  resellerUsersNotSetProbe,
  resellerUsersDeleteProbe,
]

// ---------------------------------------------------------------------------------------------
// State skeleton
// ---------------------------------------------------------------------------------------------

export interface ResellerUsersStateOptions {
  /** The rows of `GET /reseller/users`. Default `resellerUsers`. */
  users?: ResellerUserRow[]
  /** Overrides keyed by `METHOD /path`, applied after the defaults. */
  handlers?: Record<string, Handler>
  /** The readiness anchor (the first wait). Default: the first row's e-mail. */
  ready?: (page: Page) => Locator
  /** Steps after the anchor is visible (open a modal, hover), before the state's probes. */
  legacy?: StateAction[]
  next?: StateAction[]
  probes?: Probe[]
}

/** Everything a reseller users state shares: signed in, single server with the reseller tab, `/reseller-area/users`, a fixed clock. */
export function resellerUsersState (options: ResellerUsersStateOptions = {}): Omit<ParityState, 'id'> {
  const users = options.users ?? resellerUsers
  const ready = options.ready ?? (page => page.getByText(FIRST_ROW_EMAIL, { exact: true }))
  const base = shellState({
    target: 'lite',
    path: RESELLER_USERS_PATH,
    home: RESELLER_HOME,
    tabs: [liteTabs[0], { key: 'reseller-area' }],
    activeTab: 'reseller-area',
    clock: NOW,
    probes: [...resellerUsersProbes, ...(options.probes ?? [])],
  })
  return {
    ...base,
    handlers: {
      ...shellHandlers([], 'projects'),
      'GET /reseller/users': usersList(users),
      ...userInstancesHandlers(users),
      ...options.handlers,
    },
    actions: {
      legacy: [waitFor(ready), ...(options.legacy ?? [])],
      next: [waitFor(ready), ...(options.next ?? [])],
    },
  }
}

/**
 * Hovers the first row's Delete icon and waits for its tooltip (`open-delay` 150 ms). The row can reflow once the pointer lands and close
 * the tooltip, so the pointer leaves and comes back until it shows (the pattern of `hoverRowEdit` in `hosting-email-addresses.parity.ts`).
 * Below 976 px the card's button has no tooltip: plain hover.
 */
export function hoverDeleteIcon (next: boolean): StateAction {
  return async page => {
    const element = resellerUsersDeleteButton(next)(page)
    if (await element.count() === 0) {
      return
    }
    if ((page.viewportSize()?.width ?? 1440) < 976) {
      await element.hover()
      return
    }
    const tooltip = next ? resellerUsersDeleteTooltipProbe.next : resellerUsersDeleteTooltipProbe.legacy
    await expect(async () => {
      await page.mouse.move(0, 0)
      await element.hover()
      await expect(tooltip(page)).toBeVisible({ timeout: 2500 })
    }).toPass({ timeout: 15_000 })
  }
}

// ---------------------------------------------------------------------------------------------
// Phase 8: the instances tooltip of a user (`UserInstancesTooltip.vue`, lite `content-class` `user-instances-tooltip`). The menu is teleported,
// and `eager` in next keeps every row's menu in the DOM, so the probes read the open card only.
// ---------------------------------------------------------------------------------------------

/** The instances chip of the first row (the menu activator; the chip is the hover target). */
export function resellerUsersChipButton (next: boolean): (page: Page) => Locator {
  return page => (next ? resellerUsersChipProbe.next(page) : resellerUsersChipProbe.legacy(page))
}

/** The open tooltip card: V2 `.menuable__content__active` with the content class, V4 `.v-overlay--active .v-overlay__content` with it. */
export function resellerUsersTooltipCard (next: boolean): (page: Page) => Locator {
  return page => (next
    ? page.locator('.v-overlay--active .v-overlay__content.user-instances-tooltip')
    : page.locator('.menuable__content__active.user-instances-tooltip'))
}

/** The tooltip card itself (its box, background and shadow). */
export const resellerUsersTooltipCardProbe: Probe = {
  key: 'reseller-users-tooltip-card',
  legacy: resellerUsersTooltipCard(false),
  next: resellerUsersTooltipCard(true),
}

/** The card title `reseller.user.sharedInstances` (`h5.user-instances-tooltip__title`). */
export const resellerUsersTooltipTitleProbe: Probe = {
  key: 'reseller-users-tooltip-title',
  legacy: page => resellerUsersTooltipCard(false)(page).locator('.user-instances-tooltip__title').first(),
  next: page => resellerUsersTooltipCard(true)(page).locator('.user-instances-tooltip__title').first(),
}

/** The first instance row of the card: the avatar, the name, the link and the created date. */
export const resellerUsersTooltipRowProbe: Probe = {
  key: 'reseller-users-tooltip-row',
  legacy: page => resellerUsersTooltipCard(false)(page).locator('.instance').first(),
  next: page => resellerUsersTooltipCard(true)(page).locator('.instance').first(),
}

/** The suspended chip of the second project (its row has the status tooltip activator). */
export const resellerUsersTooltipSuspendedProbe: Probe = {
  key: 'reseller-users-tooltip-suspended',
  legacy: page => resellerUsersTooltipCard(false)(page).locator('.suspend-chip').first(),
  next: page => resellerUsersTooltipCard(true)(page).locator('.suspend-chip').first(),
}

/** The first skeleton of the card while `GET /reseller/users/<id>/projects` is pending. */
export const resellerUsersTooltipSkeletonProbe: Probe = {
  key: 'reseller-users-tooltip-skeleton',
  legacy: page => resellerUsersTooltipCard(false)(page).locator('.v-skeleton-loader').first(),
  next: page => resellerUsersTooltipCard(true)(page).locator('.v-skeleton-loader').first(),
}

/**
 * Hovers the first row's instances chip and waits for the tooltip card, then for its content (`loading` waits for a skeleton, otherwise
 * for the first instance row). `open-delay` is 150 ms and `open-on-hover` keeps the card open while the pointer rests on the chip, so the
 * pointer stays where it is. The row can reflow once the pointer lands and close the card, so the pointer leaves and comes back until it
 * shows (the pattern of `hoverDeleteIcon`).
 */
export function hoverInstancesChip (next: boolean, loading = false): StateAction {
  return async page => {
    const element = resellerUsersChipButton(next)(page)
    if (await element.count() === 0) {
      return
    }
    const card = resellerUsersTooltipCard(next)
    await expect(async () => {
      await page.mouse.move(0, 0)
      await element.hover()
      await expect(card(page)).toBeVisible({ timeout: 2500 })
    }).toPass({ timeout: 15_000 })
    const content = loading ? resellerUsersTooltipSkeletonProbe : resellerUsersTooltipRowProbe
    await expect(content[next ? 'next' : 'legacy'](page)).toBeVisible({ timeout: 5000 })
  }
}

// ---------------------------------------------------------------------------------------------
// Phase 10: the delete modal of the first row (`UserDeleteModal.vue`; legacy `views/reseller-area/UserDeleteModal.vue`, same markup in lite).
// Delete stays disabled until the confirmation is ticked. The modal is one dialog on this page, but every probe is scoped to its card.
// ---------------------------------------------------------------------------------------------

/** The open modal card: legacy `.basic-modal` in the active dialog, next the card with the `reseller-user-delete-modal` test id. `.first()`: lesson on nested dialogs. */
export function resellerUsersModalCard (next: boolean): (page: Page) => Locator {
  return page => (next
    ? page.getByTestId('reseller-user-delete-modal')
    : page.locator('.v-dialog--active .basic-modal')).first()
}

/** The Delete button of the modal (first button of the actions block; disabled until the confirmation is ticked). */
export function resellerUsersModalSubmit (next: boolean): (page: Page) => Locator {
  return page => (next
    ? page.getByTestId('reseller-user-delete-submit')
    : resellerUsersModalCard(false)(page).locator('.v-card__actions .v-btn').first())
}

/** The confirmation checkbox row of the modal (`label.checkbox-label` on both sides). */
export function resellerUsersModalCheckbox (next: boolean): (page: Page) => Locator {
  return page => resellerUsersModalCard(next)(page).locator('label.checkbox-label').first()
}

export const resellerUsersModalCardProbe: Probe = {
  key: 'reseller-users-modal-card',
  legacy: resellerUsersModalCard(false),
  next: resellerUsersModalCard(true),
}

export const resellerUsersModalTitleProbe: Probe = {
  key: 'reseller-users-modal-title',
  legacy: page => resellerUsersModalCard(false)(page).locator('h6').first(),
  next: page => resellerUsersModalCard(true)(page).locator('h6').first(),
}

/** The close icon in the title row: hidden while the request is pending, shown here. */
export const resellerUsersModalCloseProbe: Probe = {
  key: 'reseller-users-modal-close',
  legacy: page => resellerUsersModalCard(false)(page).locator('.v-card__title .v-btn').first(),
  next: page => page.getByTestId('reseller-user-delete-close'),
}

/** The message with the user's e-mail (the first paragraph of the card text). */
export const resellerUsersModalMessageProbe: Probe = {
  key: 'reseller-users-modal-message',
  legacy: page => resellerUsersModalCard(false)(page).locator('.v-card__text p').first(),
  next: page => resellerUsersModalCard(true)(page).locator('.v-card-text p').first(),
}

export const resellerUsersModalCheckboxProbe: Probe = {
  key: 'reseller-users-modal-checkbox',
  legacy: resellerUsersModalCheckbox(false),
  next: resellerUsersModalCheckbox(true),
}

export const resellerUsersModalSubmitProbe: Probe = {
  key: 'reseller-users-modal-submit',
  legacy: resellerUsersModalSubmit(false),
  next: resellerUsersModalSubmit(true),
}

export const resellerUsersModalCancelProbe: Probe = {
  key: 'reseller-users-modal-cancel',
  legacy: page => resellerUsersModalCard(false)(page).locator('.cancel-btn .v-btn').first(),
  next: page => resellerUsersModalCard(true)(page).locator('.cancel-btn .v-btn').first(),
}

/** The modal probes, after the Users page probes. */
export const resellerUsersModalProbes: Probe[] = [
  resellerUsersModalCardProbe,
  resellerUsersModalTitleProbe,
  resellerUsersModalCloseProbe,
  resellerUsersModalMessageProbe,
  resellerUsersModalCheckboxProbe,
  resellerUsersModalSubmitProbe,
  resellerUsersModalCancelProbe,
]

/**
 * Clicks the first row's Delete icon by a DOM click: neither scrolls nor moves the pointer (lesson "Modal w stanie parity otwieraj bez
 * przewijania"). Waits for the modal card.
 */
export function openDeleteModal (next: boolean): StateAction {
  return async page => {
    await page.mouse.move(0, 0)
    await resellerUsersDeleteButton(next)(page).evaluate(node => (node as HTMLElement).click())
    await expect(resellerUsersModalCard(next)(page)).toBeVisible()
  }
}

/** Ticks the confirmation (DOM click on the checkbox input) and waits for Delete to become enabled. */
export function confirmDeleteModal (next: boolean): StateAction {
  return async page => {
    await resellerUsersModalCard(next)(page).locator('input[type="checkbox"]').first().evaluate(node => (node as HTMLElement).click())
    await expect(resellerUsersModalSubmit(next)(page)).toBeEnabled()
  }
}

// ---------------------------------------------------------------------------------------------
// Phase 11: the error states. Both apps raise the error alert with `addAlert` and close it 5 s later unless the pointer is over it (legacy
// AlertMixin, next useAlertTimeout). The state waits for the alert, hovers its text box and keeps the pointer there (lesson "Toast z
// timerem"). The probe takes `.first()` and the hover waits for one alert left (lesson "Sonda alertu").
// ---------------------------------------------------------------------------------------------

/** The alert stack (fixed, top right). `.first()`: the probe reads the first container. */
export const resellerAlertProbe: Probe = {
  key: 'reseller-alerts',
  legacy: page => page.locator('.alert-manager').first(),
  next: page => page.getByTestId('shell-alert-manager').first(),
}

const resellerErrorAlerts = (page: Page): Locator => page.locator('.alert-manager .alert--error')

/** Waits for the error alert to settle, hovers its text box and waits until one alert is left (the hovered one keeps its timer). */
export const hoverResellerErrorAlert: StateAction = async page => {
  const alert = resellerErrorAlerts(page).first()
  await settled(alert)
  await alert.locator('.alert__text-box').hover()
  await expect(resellerErrorAlerts(page)).toHaveCount(1, { timeout: 9000 })
}

/** The Users page probes without the row probes: an empty table has no row, and a probe on a missing element is a `missing` failure. */
export const resellerUsersRowProbes: Probe[] = [
  resellerUsersHeaderProbe,
  resellerUsersRowProbe,
  resellerUsersChipProbe,
  resellerUsersNotSetProbe,
  resellerUsersDeleteProbe,
]

export function withoutRowProbes (probes: Probe[]): Probe[] {
  return probes.filter(probe => !resellerUsersRowProbes.includes(probe))
}

/** Clicks Delete in the open modal (the confirmation is ticked first). On error the modal stays open. */
export function submitDeleteModal (next: boolean): StateAction {
  return async page => {
    await resellerUsersModalSubmit(next)(page).click()
  }
}

// ---------------------------------------------------------------------------------------------
// Phase 12: the empty states. With no user rows the table shows the no-data copy (`reseller.logs.noLogs` / `noLogsDesc`, the copy of the
// logs page) and no sort row. A search with no match keeps the header and shows the no-results container with "Clear filter".
// ---------------------------------------------------------------------------------------------

/** The illustration of the no-data copy (`NoDataTableUsers`, one `svg` in `.no-data-container`). */
export const resellerUsersEmptyIllustrationProbe: Probe = {
  key: 'reseller-users-empty-illustration',
  legacy: page => page.locator('.no-data-container svg').first(),
  next: page => page.locator('.no-data-container svg').first(),
}

export const resellerUsersEmptyTitleProbe: Probe = {
  key: 'reseller-users-empty-title',
  legacy: page => page.locator('.no-data-container__title').first(),
  next: page => page.locator('.no-data-container__title').first(),
}

export const resellerUsersEmptyDescriptionProbe: Probe = {
  key: 'reseller-users-empty-description',
  legacy: page => page.locator('.no-data-container__description').first(),
  next: page => page.locator('.no-data-container__description').first(),
}

/** The no-results container of the table (`DataIteratorNoResultsContainer`), shown when the search matches no row. */
export const resellerUsersNoResultsProbe: Probe = {
  key: 'reseller-users-no-results',
  legacy: page => page.locator('.data-table .no-results-container').first(),
  next: page => page.locator('.data-table .no-results-container').first(),
}

/** The probes that need a user row (the header stays on a search with no match, so it is not in this list). */
export const resellerUsersBodyProbes: Probe[] = [
  resellerUsersRowProbe,
  resellerUsersChipProbe,
  resellerUsersNotSetProbe,
  resellerUsersDeleteProbe,
]

// ---------------------------------------------------------------------------------------------
// Phase 13: the loading states. Legacy `UsersTable.vue:81-89` (`fetchingUsers`) and `UserDeleteModal.vue:11,60` (`submitting`: X hidden,
// Delete with `loading`) have their own branches, so both states are measured (no N/A). The request hangs (`'hold'`); the skeleton bones
// are animated and masked, and the header row is gone (it shows only with rows).
// ---------------------------------------------------------------------------------------------

/** The skeleton of the Users table while `GET /reseller/users` is pending: five text rows (desktop) or five cards (below `lg`). */
export const resellerUsersSkeletonProbe: Probe = {
  key: 'reseller-users-skeleton',
  legacy: page => page.locator('.v-card.data-table .v-skeleton-loader').first(),
  next: page => page.locator('.v-card.data-table .v-skeleton-loader').first(),
}

/** The Delete button of the modal while `DELETE` is pending: its `loading` state (the loader sits inside the button). */
export const resellerUsersModalSubmitLoadingProbe: Probe = {
  key: 'reseller-users-modal-submit-loading',
  legacy: resellerUsersModalSubmit(false),
  next: resellerUsersModalSubmit(true),
}

export const resellerUsersSkeletonMasks = {
  legacy: [(page: Page) => page.locator('.v-card.data-table .v-skeleton-loader')],
  next: [(page: Page) => page.locator('.v-card.data-table .v-skeleton-loader')],
}

export const resellerUsersSubmitSpinnerMasks = {
  legacy: [(page: Page) => resellerUsersModalSubmit(false)(page).locator('.v-progress-circular')],
  next: [(page: Page) => resellerUsersModalSubmit(true)(page).locator('.v-progress-circular')],
}

/** Waits for the Delete loader of the modal (the request is pending, so it stays on screen). */
export function waitForModalSubmitLoading (next: boolean): StateAction {
  return async page => {
    await settled(resellerUsersModalSubmit(next)(page).locator('.v-progress-circular'))
  }
}

/** Waits for the table skeleton (it renders once the list request has started). */
export const waitForResellerUsersSkeleton: { legacy: StateAction, next: StateAction } = {
  legacy: waitFor(resellerUsersSkeletonProbe.legacy),
  next: waitFor(resellerUsersSkeletonProbe.next),
}
