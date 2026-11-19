import type { Handler, ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { settled, tr } from './auth'
import { listSearch, waitFor } from './hosting'
import { hoverResellerErrorAlert, RESELLER_HOME, resellerAlertProbe, resellerDividerProbe, resellerSidebarActiveProbe, resellerTitleProbe, resellerUsersSkeletonMasks, waitForResellerUsersSkeleton } from './reseller-users'
import { focusButton, hovered, noFocusRing } from './sftp'
import { isDesktop, isoFromNow, liteTabs, NOW, shellHandlers, shellState } from './shell'

// S-126 ui-reseller-api: the Reseller Area frame and the API tokens page on app-lite (`/reseller-area/api`, `target: 'lite'`, M-2 default).
// Not a spec file (testMatch is `*.parity.ts`). States: `reseller-api.parity.ts`. Plan: context/changes/ui-reseller-api/plan.md.
// Source of the LITE copy: `views/reseller-area/ApiTokensTable.vue`. Frame helpers and `RESELLER_HOME` come from `reseller-users.ts` (S-122).

/** The page path of the states. */
export const RESELLER_API_PATH = '/reseller-area/api'

export interface ResellerApiTokenRow {
  id: number
  name: string
  last_used_at: string | null
  created_at: string
}

const HOUR = 3_600_000
const DAY = 86_400_000

/**
 * Twelve tokens in name order (the default sort), so page one holds rows 1 to 10 and the footer reads page 1 of 2. `Billing sync` has never
 * been used (the "Never" copy). One name is long (the ellipsis). The dates are relative to the fixed clock.
 */
export const resellerApiTokens: ResellerApiTokenRow[] = [
  { id: 1, name: 'Analytics export', last_used_at: isoFromNow(-2 * HOUR), created_at: isoFromNow(-30 * DAY) },
  { id: 2, name: 'Billing sync', last_used_at: null, created_at: isoFromNow(-12 * DAY) },
  { id: 3, name: 'Deployment token for the staging environment of the customer portal', last_used_at: isoFromNow(-5 * 60_000), created_at: isoFromNow(-300 * DAY) },
  { id: 4, name: 'Monitoring', last_used_at: isoFromNow(-1 * DAY), created_at: isoFromNow(-60 * DAY) },
  { id: 5, name: 'Nightly backup', last_used_at: isoFromNow(-3 * HOUR), created_at: isoFromNow(-90 * DAY) },
  { id: 6, name: 'Reports', last_used_at: isoFromNow(-7 * DAY), created_at: isoFromNow(-45 * DAY) },
  { id: 7, name: 'Staging deploy', last_used_at: isoFromNow(-20 * DAY), created_at: isoFromNow(-1 * DAY) },
  { id: 8, name: 'Support desk', last_used_at: isoFromNow(-6 * HOUR), created_at: isoFromNow(-15 * DAY) },
  { id: 9, name: 'Uptime checks', last_used_at: isoFromNow(-45 * 60_000), created_at: isoFromNow(-120 * DAY) },
  { id: 10, name: 'Webhook relay', last_used_at: isoFromNow(-2 * DAY), created_at: isoFromNow(-200 * DAY) },
  { id: 11, name: 'Zapier', last_used_at: isoFromNow(-9 * HOUR), created_at: isoFromNow(-7 * DAY) },
  { id: 12, name: 'Zone sync', last_used_at: isoFromNow(-4 * DAY), created_at: isoFromNow(-25 * DAY) },
]

/** The first token after the default sort: the readiness anchor of the list states. */
export const FIRST_TOKEN = resellerApiTokens[0]

/** The plain token of `POST /reseller/api-tokens` (Sanctum format `<id>|<40 characters>`, no spaces). */
export const RESELLER_API_PLAIN_TOKEN = '13|pAq7Rk2Vx9Lm4Nz8Ty3Wb6Hc1Jd5Fg0Es2Uo7KiQ'

/** `GET /reseller/api-tokens`: `{ data: rows }`. */
export const tokensList = (rows: ResellerApiTokenRow[] = resellerApiTokens): Handler => ({ json: { data: rows } })

/** `POST /reseller/api-tokens`: the new token with its plain text, shown once in the confirmation step. */
export const createdToken: Handler = {
  json: {
    data: {
      id: 13,
      name: 'CI pipeline',
      last_used_at: null,
      created_at: NOW,
      plain_text_token: RESELLER_API_PLAIN_TOKEN,
    },
  },
}

/** `DELETE /reseller/api-tokens/<id>`: `{ data: { id } }`. */
export const deletedToken = (id: number): Handler => ({ json: { data: { id } } })

// ---------------------------------------------------------------------------------------------
// Probes. The frame probes come from `reseller-users.ts`. The API page probes use the same classes in both apps (the mapping keeps the V2
// class names where V4 has one), so each probe is one pair of the same locator.
// ---------------------------------------------------------------------------------------------

export const resellerApiTitleProbe: Probe = {
  key: 'reseller-api-title',
  legacy: page => page.locator('.title-row h4').first(),
  next: page => page.locator('.title-row h4').first(),
}

export const resellerApiSearchProbe: Probe = {
  key: 'reseller-api-search',
  legacy: page => page.locator('.data-iterator-filter-controls').first(),
  next: page => page.locator('.data-iterator-filter-controls').first(),
}

export const resellerApiCreateProbe: Probe = {
  key: 'reseller-api-create',
  legacy: page => page.locator('.page-title__add-button').first(),
  next: page => page.locator('.page-title__add-button').first(),
}

export const resellerApiTableProbe: Probe = {
  key: 'reseller-api-table',
  legacy: page => page.locator('.v-card.data-table').first(),
  next: page => page.locator('.v-card.data-table').first(),
}

/** The sort header row (`TableCustomSort`), desktop only: the mobile cards carry the labels. */
export const resellerApiHeaderProbe: Probe = {
  key: 'reseller-api-header',
  when: isDesktop,
  legacy: page => page.locator('tr.custom-sort').first(),
  next: page => page.locator('tr.custom-sort').first(),
}

/** The first data row: a table row on desktop, a `.mobile-table-item` card below 1400 px (the skeleton rows are excluded). */
export const resellerApiRowProbe: Probe = {
  key: 'reseller-api-row',
  legacy: page => page.locator('tbody tr:not(.skeleton), .mobile-table-item').first(),
  next: page => page.locator('tbody tr:not(.skeleton), .mobile-table-item').first(),
}

/** The "Never" copy of the token that has no last use (`Billing sync`, the second row). Desktop only. */
export const resellerApiNeverProbe: Probe = {
  key: 'reseller-api-never',
  when: isDesktop,
  legacy: page => page.locator('.font-italic').first(),
  next: page => page.locator('.font-italic').first(),
}

/** The trash icon of the first row (`.actions-row`). Desktop only. */
export const resellerApiDeleteProbe: Probe = {
  key: 'reseller-api-delete',
  when: isDesktop,
  legacy: page => page.locator('.actions-row .v-btn').first(),
  next: page => page.locator('.actions-row .v-btn').first(),
}

/** The footer of the table with the pager and the page count. */
export const resellerApiTableFooterProbe: Probe = {
  key: 'reseller-api-table-footer',
  legacy: page => page.locator('.data-iterator-footer').first(),
  next: page => page.locator('.data-iterator-footer').first(),
}

/** The probes of the API page, after the frame probes. */
export const resellerApiProbes: Probe[] = [
  resellerTitleProbe,
  resellerDividerProbe,
  resellerSidebarActiveProbe,
  resellerApiTitleProbe,
  resellerApiSearchProbe,
  resellerApiCreateProbe,
  resellerApiTableProbe,
  resellerApiHeaderProbe,
  resellerApiRowProbe,
  resellerApiNeverProbe,
  resellerApiDeleteProbe,
  resellerApiTableFooterProbe,
]

/** The probes that need a token row (the header stays on a search with no match, so it is not in this list). */
export const API_ROW_KEYS = ['reseller-api-row', 'reseller-api-never', 'reseller-api-delete']

/** The probes of the list (header, search, Create and footer) plus the row probes: all of them go when there is no token at all. */
export const API_LIST_KEYS = [...API_ROW_KEYS, 'reseller-api-header', 'reseller-api-search', 'reseller-api-create', 'reseller-api-table-footer']

/** Drops the probes with the given keys. An empty table has no row, and a probe on a missing element is a `missing` failure. */
export function withoutApiProbes (probes: Probe[], keys: string[]): Probe[] {
  return probes.filter(probe => !keys.includes(probe.key))
}

// ---------------------------------------------------------------------------------------------
// State skeleton
// ---------------------------------------------------------------------------------------------

export interface ResellerApiStateOptions {
  /** The rows of `GET /reseller/api-tokens`. Default `resellerApiTokens`. */
  tokens?: ResellerApiTokenRow[]
  /** Overrides keyed by `METHOD /path`, applied after the defaults. */
  handlers?: Record<string, Handler>
  /** The readiness anchor (the first wait). Default: the first token's name. */
  ready?: (page: Page) => Locator
  /** Steps after the anchor is visible (open a modal, hover), before the state's probes. */
  legacy?: ParityState['actions']['legacy']
  next?: ParityState['actions']['next']
  probes?: Probe[]
  masks?: ParityState['masks']
}

/** Everything an API page state shares: signed in, single server with the reseller tab, `/reseller-area/api`, a fixed clock. */
export function resellerApiState (options: ResellerApiStateOptions = {}): Omit<ParityState, 'id'> {
  const tokens = options.tokens ?? resellerApiTokens
  const ready = options.ready ?? (page => page.getByText(FIRST_TOKEN.name, { exact: true }).first())
  const base = shellState({
    target: 'lite',
    path: RESELLER_API_PATH,
    home: RESELLER_HOME,
    tabs: [liteTabs[0], { key: 'reseller-area' }],
    activeTab: 'reseller-area',
    clock: NOW,
    probes: [...resellerApiProbes, ...(options.probes ?? [])],
  })
  return {
    ...base,
    handlers: {
      ...shellHandlers([], 'projects'),
      'GET /reseller/api-tokens': tokensList(tokens),
      'POST /reseller/api-tokens': createdToken,
      [`DELETE /reseller/api-tokens/${FIRST_TOKEN.id}`]: deletedToken(FIRST_TOKEN.id),
      ...options.handlers,
    },
    actions: {
      legacy: [waitFor(ready), ...(options.legacy ?? [])],
      next: [waitFor(ready), ...(options.next ?? [])],
    },
    ...(options.masks ? { masks: options.masks } : {}),
  }
}

/** The default state: the frame and the first page of the tokens (twelve rows, name ascending). */
export const resellerApiDefault: ParityState = {
  id: 'reseller-api-default',
  ...resellerApiState(),
}

// ---------------------------------------------------------------------------------------------
// Phase 7: hover of the first row's Delete icon (desktop: the row background, the icon overlay and the Delete tooltip) and hover of the
// created date (desktop: the full date tooltip). Mobile cards have neither (`UsersTableCell`), so both states skip `light-mobile`.
// ---------------------------------------------------------------------------------------------

/** The first data row on desktop: the hover state reads its background (`tr.highlight`). */
export const resellerApiRowHoverProbe: Probe = {
  key: 'reseller-api-row-hover',
  legacy: page => page.locator('tbody tr:not(.skeleton)').first(),
  next: page => page.locator('tbody tr:not(.skeleton)').first(),
  when: isDesktop,
}

/** The first row's Delete icon on one side: the `.actions-row` button on desktop, the card's button on mobile. */
export function resellerApiDeleteButton (next: boolean): (page: Page) => Locator {
  return page => (next ? resellerApiDeleteProbe.next(page) : resellerApiDeleteProbe.legacy(page))
}

/** The hover overlay of the first row's Delete icon: V2 `::before`, V4 `.v-btn__overlay`. Desktop only. */
export const resellerApiDeleteOverlayProbe: Probe = {
  key: 'reseller-api-delete-overlay',
  legacy: resellerApiDeleteProbe.legacy,
  next: page => resellerApiDeleteProbe.next(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
  when: isDesktop,
}

/** The Delete tooltip of the first row (`reseller.apiTokens.delete`, "Delete API Token" in the lite copy). Desktop only. */
const apiTokenDeleteCopy = tr('reseller.apiTokens.delete', 'lite')
export const resellerApiDeleteTooltipProbe: Probe = {
  key: 'reseller-api-delete-tooltip',
  legacy: page => page.locator('.menuable__content__active').filter({ hasText: apiTokenDeleteCopy }),
  next: page => page.locator('.v-overlay--active .v-overlay__content').filter({ hasText: apiTokenDeleteCopy }),
  when: isDesktop,
}

/** The full-date tooltip of the created date (`ApiTokensTableCell`, `created_at` column). Only one tooltip is open at a time. */
export const resellerApiDateTooltipProbe: Probe = {
  key: 'reseller-api-date-tooltip',
  legacy: page => page.locator('.menuable__content__active').first(),
  next: page => page.locator('.v-overlay--active .v-overlay__content').first(),
}

/**
 * Hovers the first row's Delete icon and waits for its tooltip (`open-delay` 150 ms). The pointer leaves and comes back until the tooltip
 * shows (the pattern of `hoverDeleteIcon` in `reseller-users.ts`). Below 976 px the card's button has no tooltip: plain hover.
 */
export function hoverDeleteIcon (next: boolean): StateAction {
  return async page => {
    const element = resellerApiDeleteButton(next)(page)
    if (await element.count() === 0) {
      return
    }
    if ((page.viewportSize()?.width ?? 1440) < 976) {
      await element.hover()
      return
    }
    const tooltip = next ? resellerApiDeleteTooltipProbe.next : resellerApiDeleteTooltipProbe.legacy
    await expect(async () => {
      await page.mouse.move(0, 0)
      await element.hover()
      await expect(tooltip(page)).toBeVisible({ timeout: 2500 })
    }).toPass({ timeout: 15_000 })
  }
}

/** Hovers the `created_at` text of the first row (the third column: name, last use, created, actions) and waits for the date tooltip. */
export function hoverCreatedAt (next: boolean): StateAction {
  return async page => {
    const element = page.locator('tbody tr:not(.skeleton)').first().locator('td').nth(2).locator('span').first()
    if (await element.count() === 0) {
      return
    }
    const tooltip = next ? resellerApiDateTooltipProbe.next : resellerApiDateTooltipProbe.legacy
    await expect(async () => {
      await page.mouse.move(0, 0)
      await element.hover()
      await expect(tooltip(page)).toBeVisible({ timeout: 2500 })
    }).toPass({ timeout: 15_000 })
  }
}

const resellerApiHoverBase: ParityState = {
  id: 'reseller-api-hover',
  ...resellerApiState({ legacy: [hoverDeleteIcon(false)], next: [hoverDeleteIcon(true)] }),
}

/** The first row's Delete icon hovered: the row, the icon overlay and the Delete tooltip. The pointer rests on the icon after the capture. */
export const resellerApiHover: ParityState = hovered(resellerApiHoverBase, { legacy: resellerApiDeleteButton(false), next: resellerApiDeleteButton(true) }, [
  resellerApiRowHoverProbe,
  resellerApiDeleteOverlayProbe,
  resellerApiDeleteTooltipProbe,
])

/** The created date hovered: the full-date tooltip (desktop). `pointer: 'keep'` leaves the pointer on the date while the tooltip is captured. */
export const resellerApiDateTooltip: ParityState = {
  id: 'reseller-api-date-tooltip',
  ...resellerApiState({
    legacy: [hoverCreatedAt(false)],
    next: [hoverCreatedAt(true)],
    probes: [resellerApiDateTooltipProbe],
  }),
  pointer: 'keep',
}

// ---------------------------------------------------------------------------------------------
// Phase 8: keyboard focus. Desktop: the first row's Delete icon. Below 976 px: the Create button of the page title (icon only on mobile).
// ---------------------------------------------------------------------------------------------

/** The focus target on one side: the first row's Delete icon from 976 px, the page-title Create button below. */
export function resellerApiFocusTarget (next: boolean): (page: Page) => Locator {
  return page => {
    if ((page.viewportSize()?.width ?? 1440) >= 976) {
      return resellerApiDeleteButton(next)(page)
    }
    return next ? resellerApiCreateProbe.next(page) : resellerApiCreateProbe.legacy(page)
  }
}

/** The hover overlay of the focus target: V2 `::before`, V4 `.v-btn__overlay`. */
export const resellerApiFocusProbe: Probe = {
  key: 'reseller-api-focus',
  legacy: resellerApiFocusTarget(false),
  next: page => resellerApiFocusTarget(true)(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

/** The focus target gets keyboard focus (Shift, then `focus()`, no Tab). V4's focus ring is asserted hidden in next. */
const resellerApiFocusBase = resellerApiState()
export const resellerApiFocus: ParityState = {
  ...resellerApiFocusBase,
  id: 'reseller-api-focus',
  pointer: 'keep',
  actions: {
    legacy: [...resellerApiFocusBase.actions.legacy, focusButton(resellerApiFocusTarget(false))],
    next: [...resellerApiFocusBase.actions.next, focusButton(resellerApiFocusTarget(true))],
  },
  probes: [...resellerApiFocusBase.probes, resellerApiFocusProbe],
  afterCapture: { legacy: [], next: [noFocusRing(resellerApiFocusTarget(true))] },
}

// ---------------------------------------------------------------------------------------------
// Phase 9: the create modal, step 1 (`reseller-api-create-form`). Legacy `ApiTokensTable.vue` and the next `ApiTokenCreateModal.vue` share the
// `basic-modal` markup. The X is `opacity: 0` until step 2 (legacy `:9`, next `reseller-api-close--hidden`) and stays clickable.
// ---------------------------------------------------------------------------------------------

/** The open modal card: legacy `.basic-modal` in the active dialog, next the card with its test id. `.first()`: lesson on nested dialogs. */
export function apiModalCard (next: boolean, which: 'create' | 'delete'): (page: Page) => Locator {
  return page => (next
    ? page.getByTestId(which === 'create' ? 'reseller-api-create-modal' : 'reseller-api-delete-modal')
    : page.locator('.v-dialog--active .basic-modal')).first()
}

export const apiModalCardProbe: Probe = {
  key: 'reseller-api-modal-card',
  legacy: apiModalCard(false, 'create'),
  next: apiModalCard(true, 'create'),
}

export const apiModalTitleProbe: Probe = {
  key: 'reseller-api-modal-title',
  legacy: page => apiModalCard(false, 'create')(page).locator('h6').first(),
  next: page => apiModalCard(true, 'create')(page).locator('h6').first(),
}

export const apiModalCloseProbe: Probe = {
  key: 'reseller-api-modal-close',
  legacy: page => apiModalCard(false, 'create')(page).locator('.v-card__title .v-btn').first(),
  next: page => page.getByTestId('reseller-api-create-close').first(),
}

export const apiModalInputProbe: Probe = {
  key: 'reseller-api-modal-input',
  part: 'input',
  legacy: page => apiModalCard(false, 'create')(page).locator('input').first(),
  next: page => apiModalCard(true, 'create')(page).locator('input').first(),
}

export const apiModalCancelProbe: Probe = {
  key: 'reseller-api-modal-cancel',
  legacy: page => apiModalCard(false, 'create')(page).locator('.v-card__actions .v-btn').first(),
  next: page => apiModalCard(true, 'create')(page).locator('.v-card-actions .v-btn').first(),
}

export const apiModalSubmitProbe: Probe = {
  key: 'reseller-api-modal-submit',
  legacy: page => apiModalCard(false, 'create')(page).locator('.v-card__actions .v-btn').last(),
  next: page => apiModalCard(true, 'create')(page).locator('.v-card-actions .v-btn').last(),
}

/** The create modal probes, after the page probes. */
export const apiCreateModalProbes: Probe[] = [
  apiModalCardProbe,
  apiModalTitleProbe,
  apiModalCloseProbe,
  apiModalInputProbe,
  apiModalCancelProbe,
  apiModalSubmitProbe,
]

/**
 * Clicks the page's Create button by a DOM click (no scroll, no pointer move; lesson "Modal w stanie parity otwieraj bez przewijania").
 * Waits for the modal card.
 */
export function openCreateModal (next: boolean): StateAction {
  return async page => {
    await page.mouse.move(0, 0)
    await resellerApiCreateProbe.legacy(page).evaluate(node => (node as HTMLElement).click())
    await settled(apiModalCard(next, 'create')(page))
  }
}

/** Types the token name into the open modal's field, then lets the pointer rest and the modal settle. */
export function typeTokenName (next: boolean): StateAction {
  return async page => {
    const card = apiModalCard(next, 'create')(page)
    await card.getByPlaceholder(tr('reseller.apiTokens.name', 'lite')).fill('CI pipeline')
    await page.mouse.move(0, 0)
    await settled(card)
  }
}

/** The create modal with the name typed (step 1). The X keeps `opacity: 0` (no confirmation yet). */
export const resellerApiCreateForm: ParityState = {
  id: 'reseller-api-create-form',
  ...resellerApiState({
    legacy: [openCreateModal(false), typeTokenName(false)],
    next: [openCreateModal(true), typeTokenName(true)],
    probes: apiCreateModalProbes,
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 10: the create modal, step 2 (`reseller-api-token-step`, `reseller-api-token-confirmed`, `reseller-api-token-copy-hover`). Step 2 replaces
// the form with the one-time token: the readonly name, the `.well` with the copy row, the warning alert, the confirmation checkbox and the
// Continue button (`disabled-gray` until the box is ticked). The X is still hidden until the box is ticked.
// ---------------------------------------------------------------------------------------------

/** The readonly name field of step 2 (legacy: the first text field of the card; next: its test id). */
export const apiTokenNameProbe: Probe = {
  key: 'reseller-api-token-name',
  legacy: page => apiModalCard(false, 'create')(page).locator('.v-text-field').first(),
  next: page => apiModalCard(true, 'create')(page).getByTestId('reseller-api-token-name-readonly'),
}

/** The grey `.well` that holds the one-time token. */
export const apiTokenWellProbe: Probe = {
  key: 'reseller-api-token-well',
  legacy: page => apiModalCard(false, 'create')(page).locator('.well').first(),
  next: page => apiModalCard(true, 'create')(page).locator('.well').first(),
}

/** The token text inside the copy row (`.record-box-copy-element`). */
export const apiTokenValueProbe: Probe = {
  key: 'reseller-api-token-value',
  legacy: page => apiModalCard(false, 'create')(page).locator('.record-box-copy-element').first(),
  next: page => apiModalCard(true, 'create')(page).locator('.record-box-copy-element').first(),
}

/** The "shown once" warning alert under the well. */
export const apiTokenWarningProbe: Probe = {
  key: 'reseller-api-token-warning',
  legacy: page => apiModalCard(false, 'create')(page).locator('.alert').first(),
  next: page => apiModalCard(true, 'create')(page).locator('.alert').first(),
}

/** The confirmation checkbox of step 2. */
export const apiTokenCheckboxProbe: Probe = {
  key: 'reseller-api-token-checkbox',
  legacy: page => apiModalCard(false, 'create')(page).locator('.checkbox').first(),
  next: page => apiModalCard(true, 'create')(page).locator('.checkbox').first(),
}

/** Continue, the only action of step 2 (`disabled-gray` until the checkbox is ticked). */
export const apiTokenContinueProbe: Probe = {
  key: 'reseller-api-token-continue',
  legacy: page => apiModalCard(false, 'create')(page).locator('.v-card__actions .v-btn').last(),
  next: page => apiModalCard(true, 'create')(page).locator('.v-card-actions .v-btn').last(),
}

/** The copy icon of the token row (`CopyRecordItem`). */
export const apiTokenCopyIconProbe: Probe = {
  key: 'reseller-api-copy-icon',
  legacy: page => apiModalCard(false, 'create')(page).locator('.record-box-list-item .copy-icon').first(),
  next: page => apiModalCard(true, 'create')(page).locator('.record-box-list-item .copy-icon').first(),
}

/** The "Copy" tooltip of the token row. Legacy and next both read `tooltip.copy` (lite copy). Only one tooltip is open at a time. */
const apiTokenCopyCopy = tr('tooltip.copy', 'lite')
export const apiTokenCopyTooltipProbe: Probe = {
  key: 'reseller-api-copy-tooltip',
  legacy: page => page.locator('.menuable__content__active').filter({ hasText: apiTokenCopyCopy }),
  next: page => page.locator('.v-overlay--active .v-overlay__content').filter({ hasText: apiTokenCopyCopy }),
}

/** The step 2 probes: the card, the title, the X (hidden until the box is ticked), the name and the token block, then Continue. */
export const apiTokenStepProbes: Probe[] = [
  apiModalCardProbe,
  apiModalTitleProbe,
  apiModalCloseProbe,
  apiModalInputProbe,
  apiTokenNameProbe,
  apiTokenWellProbe,
  apiTokenValueProbe,
  apiTokenWarningProbe,
  apiTokenCheckboxProbe,
  apiTokenContinueProbe,
]

/**
 * Clicks Create in the open step 1 modal and waits for the one-time token to show in the card (`POST /reseller/api-tokens` answers with
 * `RESELLER_API_PLAIN_TOKEN`). Pattern of `submitCreateModal` in `connect-ai.ts`.
 */
export function submitCreateModal (next: boolean): StateAction {
  return async page => {
    const card = apiModalCard(next, 'create')(page)
    await card.getByRole('button', { name: tr('button.create', 'lite'), exact: true }).click()
    await expect(card.getByText(RESELLER_API_PLAIN_TOKEN)).toBeVisible()
    await page.mouse.move(0, 0)
    await settled(card)
  }
}

/** Ticks the confirmation checkbox of step 2 (`.checkbox`, both apps), then clears the hover and waits for the card to settle. */
export function tickApiModalConfirm (next: boolean, which: 'create' | 'delete' = 'create'): StateAction {
  return async page => {
    const card = apiModalCard(next, which)(page)
    await card.locator('.checkbox').first().click()
    await page.mouse.move(0, 0)
    await settled(card)
  }
}

/**
 * Hovers the token row of step 2 and waits for the copy tooltip (`open-delay` 150 ms). The pointer leaves and comes back until the
 * tooltip shows (the pattern of `hoverDeleteIcon`). The row's `mouseover` opens the tooltip, so the pointer rests on the row.
 */
export function hoverTokenRow (next: boolean): StateAction {
  return async page => {
    const card = apiModalCard(next, 'create')(page)
    const row = card.locator('.record-box-list-item').first()
    const tooltip = next ? apiTokenCopyTooltipProbe.next : apiTokenCopyTooltipProbe.legacy
    await expect(async () => {
      await page.mouse.move(0, 0)
      await row.hover()
      await expect(tooltip(page)).toBeVisible({ timeout: 2500 })
    }).toPass({ timeout: 15_000 })
  }
}

/** Step 2 of the create modal: the token shown, the X hidden, Continue disabled (`disabled-gray`). */
export const resellerApiTokenStep: ParityState = {
  id: 'reseller-api-token-step',
  ...resellerApiState({
    legacy: [openCreateModal(false), typeTokenName(false), submitCreateModal(false)],
    next: [openCreateModal(true), typeTokenName(true), submitCreateModal(true)],
    probes: apiTokenStepProbes,
  }),
}

/** Step 2 after the confirmation checkbox is ticked: the X is visible, Continue is active. */
export const resellerApiTokenConfirmed: ParityState = {
  id: 'reseller-api-token-confirmed',
  ...resellerApiState({
    legacy: [openCreateModal(false), typeTokenName(false), submitCreateModal(false), tickApiModalConfirm(false)],
    next: [openCreateModal(true), typeTokenName(true), submitCreateModal(true), tickApiModalConfirm(true)],
    probes: apiTokenStepProbes,
  }),
}

/** Step 2 with the pointer on the token row: the copy icon and its "Copy" tooltip. `pointer: 'keep'` leaves the pointer on the row. */
export const resellerApiTokenCopyHover: ParityState = {
  id: 'reseller-api-token-copy-hover',
  ...resellerApiState({
    legacy: [openCreateModal(false), typeTokenName(false), submitCreateModal(false), hoverTokenRow(false)],
    next: [openCreateModal(true), typeTokenName(true), submitCreateModal(true), hoverTokenRow(true)],
    probes: [...apiTokenStepProbes, apiTokenCopyIconProbe, apiTokenCopyTooltipProbe],
  }),
  pointer: 'keep',
}

// ---------------------------------------------------------------------------------------------
// Phase 11: the delete modal of the first row (`reseller-api-delete-modal`, `reseller-api-delete-checked`). Legacy and next
// `ApiTokenDeleteModal.vue` share the markup. Delete is `disabled-gray` until the confirmation is ticked (no `disabled` attribute, as the
// lite deploy). The X is visible from the start and the modal has no name field, so there is no input probe. Not reachable on the mobile
// card (legacy does not open the modal from it, D1), so the states skip `light-mobile`.
// ---------------------------------------------------------------------------------------------

/** The delete modal probes, after the page probes. Same keys as the create modal, scoped to the delete card. */
export const apiDeleteModalProbes: Probe[] = [
  {
    key: 'reseller-api-modal-card',
    legacy: apiModalCard(false, 'delete'),
    next: apiModalCard(true, 'delete'),
  },
  {
    key: 'reseller-api-modal-title',
    legacy: page => apiModalCard(false, 'delete')(page).locator('h6').first(),
    next: page => apiModalCard(true, 'delete')(page).locator('h6').first(),
  },
  {
    key: 'reseller-api-modal-close',
    legacy: page => apiModalCard(false, 'delete')(page).locator('.v-card__title .v-btn').first(),
    next: page => page.getByTestId('reseller-api-delete-close'),
  },
  {
    key: 'reseller-api-delete-message',
    legacy: page => apiModalCard(false, 'delete')(page).locator('.v-card__text p').first(),
    next: page => apiModalCard(true, 'delete')(page).locator('.v-card-text p').first(),
  },
  {
    key: 'reseller-api-delete-checkbox',
    legacy: page => apiModalCard(false, 'delete')(page).locator('.checkbox').first(),
    next: page => apiModalCard(true, 'delete')(page).locator('.checkbox').first(),
  },
  {
    key: 'reseller-api-modal-cancel',
    legacy: page => apiModalCard(false, 'delete')(page).locator('.v-card__actions .v-btn').first(),
    next: page => apiModalCard(true, 'delete')(page).locator('.v-card-actions .v-btn').first(),
  },
  {
    key: 'reseller-api-modal-submit',
    legacy: page => apiModalCard(false, 'delete')(page).locator('.v-card__actions .v-btn').last(),
    next: page => apiModalCard(true, 'delete')(page).locator('.v-card-actions .v-btn').last(),
  },
]

/**
 * Clicks the first row's trash icon by a DOM click (no scroll, no pointer move; lesson "Modal w stanie parity otwieraj bez przewijania").
 * Waits for the delete card.
 */
export function openApiDeleteModal (next: boolean): StateAction {
  return async page => {
    await page.mouse.move(0, 0)
    await resellerApiDeleteButton(next)(page).evaluate(node => (node as HTMLElement).click())
    await settled(apiModalCard(next, 'delete')(page))
  }
}

/** The delete modal with Delete disabled (`disabled-gray`): no confirmation yet. */
export const resellerApiDeleteModal: ParityState = {
  id: 'reseller-api-delete-modal',
  ...resellerApiState({
    legacy: [openApiDeleteModal(false)],
    next: [openApiDeleteModal(true)],
    probes: apiDeleteModalProbes,
  }),
}

/** The delete modal after the confirmation is ticked: Delete active. */
export const resellerApiDeleteChecked: ParityState = {
  id: 'reseller-api-delete-checked',
  ...resellerApiState({
    legacy: [openApiDeleteModal(false), tickApiModalConfirm(false, 'delete')],
    next: [openApiDeleteModal(true), tickApiModalConfirm(true, 'delete')],
    probes: apiDeleteModalProbes,
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 13: the empty states. With no token the card shows the no-data copy (`reseller.apiTokens.noTokens` / `noTokensDesc`, the
// illustration and a Create button) and no table header. A search with no match keeps the header and shows the no-results container.
// ---------------------------------------------------------------------------------------------

const apiTokensNoTokensCopy = tr('reseller.apiTokens.noTokens', 'lite')
const apiTokensNoTokensDescCopy = tr('reseller.apiTokens.noTokensDesc', 'lite')

/** The no-data card of the empty table: the card text of `.data-table` (the table is replaced by it). */
const resellerApiEmptyCard = (page: Page): Locator => page.locator('.v-card.data-table .v-card-text, .v-card.data-table .v-card__text').first()

export const resellerApiEmptyCardProbe: Probe = {
  key: 'reseller-api-empty-card',
  legacy: resellerApiEmptyCard,
  next: resellerApiEmptyCard,
}

export const resellerApiEmptyIllustrationProbe: Probe = {
  key: 'reseller-api-empty-illustration',
  legacy: page => resellerApiEmptyCard(page).locator('svg').first(),
  next: page => resellerApiEmptyCard(page).locator('svg').first(),
}

export const resellerApiEmptyTitleProbe: Probe = {
  key: 'reseller-api-empty-title',
  legacy: page => resellerApiEmptyCard(page).locator('h6').filter({ hasText: apiTokensNoTokensCopy }).first(),
  next: page => resellerApiEmptyCard(page).locator('h6').filter({ hasText: apiTokensNoTokensCopy }).first(),
}

export const resellerApiEmptyDescriptionProbe: Probe = {
  key: 'reseller-api-empty-description',
  legacy: page => resellerApiEmptyCard(page).locator('p').filter({ hasText: apiTokensNoTokensDescCopy }).first(),
  next: page => resellerApiEmptyCard(page).locator('p').filter({ hasText: apiTokensNoTokensDescCopy }).first(),
}

/** The Create button inside the empty card (the only button of the card). */
export const resellerApiEmptyCreateProbe: Probe = {
  key: 'reseller-api-empty-create',
  legacy: page => resellerApiEmptyCard(page).locator('.v-btn').first(),
  next: page => resellerApiEmptyCard(page).locator('.v-btn').first(),
}

/** The no-results container of the table (`DataIteratorNoResultsContainer`), shown when the search matches no token. */
export const resellerApiNoResultsProbe: Probe = {
  key: 'reseller-api-no-results',
  legacy: page => page.locator('.data-table .no-results-container').first(),
  next: page => page.locator('.data-table .no-results-container').first(),
}

/** The probes of the empty card. The list probes go with them (`withoutApiProbes`, `API_LIST_KEYS`). */
export const resellerApiEmptyProbes: Probe[] = [
  resellerApiEmptyCardProbe,
  resellerApiEmptyIllustrationProbe,
  resellerApiEmptyTitleProbe,
  resellerApiEmptyDescriptionProbe,
  resellerApiEmptyCreateProbe,
]

/** `data: []`: the no-data card, the title is the readiness anchor. The list probes do not apply (no table, no row). */
const resellerApiEmptyBase = resellerApiState({
  tokens: [],
  ready: page => page.getByText(apiTokensNoTokensCopy, { exact: true }).first(),
  probes: resellerApiEmptyProbes,
})
export const resellerApiEmpty: ParityState = {
  ...resellerApiEmptyBase,
  id: 'reseller-api-empty',
  probes: withoutApiProbes(resellerApiEmptyBase.probes, API_LIST_KEYS),
}

/** A search term with no match: the header, search, Create and footer stay, the rows go, the no-results container shows. */
const RESELLER_API_NO_SUCH_TOKEN = 'zzz-no-such-token'
const resellerApiSearchEmptyBase = resellerApiState({
  ready: resellerApiTitleProbe.legacy,
  legacy: [listSearch(RESELLER_API_NO_SUCH_TOKEN)],
  next: [listSearch(RESELLER_API_NO_SUCH_TOKEN)],
  probes: [resellerApiNoResultsProbe],
})
export const resellerApiSearchEmpty: ParityState = {
  ...resellerApiSearchEmptyBase,
  id: 'reseller-api-search-empty',
  probes: withoutApiProbes(resellerApiSearchEmptyBase.probes, API_ROW_KEYS),
}

// ---------------------------------------------------------------------------------------------
// Phase 12: error states (`reseller-api-error`, `reseller-api-create-fail`, `reseller-api-delete-fail`). Both apps raise the error alert
// with `addAlert` and close it 5 s later unless the pointer is over it, so each state hovers the alert before the capture (`pointer: 'keep'`).
// ---------------------------------------------------------------------------------------------

/** Clicks the create modal's Create (step 1) without waiting for a token. After a failed request the card stays on step 1. */
export function clickCreateSubmit (next: boolean): StateAction {
  return async page => {
    const card = apiModalCard(next, 'create')(page)
    await card.getByRole('button', { name: tr('button.create', 'lite'), exact: true }).click()
    await page.mouse.move(0, 0)
    await settled(card)
  }
}

/** Clicks the delete modal's Delete without waiting for the result. After a failed request the modal stays open. */
export function clickDeleteSubmit (next: boolean): StateAction {
  return async page => {
    const card = apiModalCard(next, 'delete')(page)
    const submit = next ? card.locator('.v-card-actions .v-btn').last() : card.locator('.v-card__actions .v-btn').last()
    await submit.click()
    await page.mouse.move(0, 0)
    await settled(card)
  }
}

/** `GET /reseller/api-tokens` answers 500: the table stays empty (no row probes), the title is the anchor and the error alert is hovered. */
const resellerApiErrorBase = resellerApiState({
  ready: resellerApiTitleProbe.legacy,
  handlers: { 'GET /reseller/api-tokens': { status: 500, json: { message: 'Server Error' } } },
  legacy: [hoverResellerErrorAlert],
  next: [hoverResellerErrorAlert],
  probes: [resellerAlertProbe],
})
export const resellerApiError: ParityState = {
  ...resellerApiErrorBase,
  id: 'reseller-api-error',
  pointer: 'keep',
  probes: [...withoutApiProbes(resellerApiErrorBase.probes, API_LIST_KEYS), ...resellerApiEmptyProbes],
}

/** `POST /reseller/api-tokens` answers 422 (name taken): the create modal stays on step 1 and the error alert is hovered. */
export const resellerApiCreateFail: ParityState = {
  id: 'reseller-api-create-fail',
  ...resellerApiState({
    handlers: { 'POST /reseller/api-tokens': { status: 422, json: { message: 'The given data was invalid.', errors: { name: ['The name has already been taken.'] } } } },
    legacy: [openCreateModal(false), typeTokenName(false), clickCreateSubmit(false), hoverResellerErrorAlert],
    next: [openCreateModal(true), typeTokenName(true), clickCreateSubmit(true), hoverResellerErrorAlert],
    probes: [...apiCreateModalProbes, resellerAlertProbe],
  }),
  pointer: 'keep',
}

/** `DELETE` of the first token answers 500: the delete modal stays open with the confirmation ticked and the error alert is hovered. */
export const resellerApiDeleteFail: ParityState = {
  id: 'reseller-api-delete-fail',
  ...resellerApiState({
    handlers: { [`DELETE /reseller/api-tokens/${FIRST_TOKEN.id}`]: { status: 500, json: { message: 'Server Error' } } },
    legacy: [openApiDeleteModal(false), tickApiModalConfirm(false, 'delete'), clickDeleteSubmit(false), hoverResellerErrorAlert],
    next: [openApiDeleteModal(true), tickApiModalConfirm(true, 'delete'), clickDeleteSubmit(true), hoverResellerErrorAlert],
    probes: [...apiDeleteModalProbes, resellerAlertProbe],
  }),
  pointer: 'keep',
}

// ---------------------------------------------------------------------------------------------
// Phase 14: the loading states (`reseller-api-loading`, `reseller-api-create-held`, `reseller-api-delete-held`). Legacy `ApiTokensTable.vue`
// has the skeleton branch (`fetching`) and `:loading="submitting"` on Create and Delete, so all three states are measured. The request
// hangs (`'hold'`); the skeleton bones are animated and masked, the spinner of the submit button is masked.
// ---------------------------------------------------------------------------------------------

/** The skeleton of the table while `GET /reseller/api-tokens` is pending (the card holds the skeleton bones, no rows). */
export const resellerApiSkeletonProbe: Probe = {
  key: 'reseller-api-skeleton',
  legacy: page => page.locator('.v-card.data-table .v-skeleton-loader').first(),
  next: page => page.locator('.v-card.data-table .v-skeleton-loader').first(),
}

/** The last action button of the card (Create or Delete), where the submit spinner sits. */
function apiSubmitButton (next: boolean, which: 'create' | 'delete'): (page: Page) => Locator {
  return page => apiModalCard(next, which)(page).locator(next ? '.v-card-actions .v-btn' : '.v-card__actions .v-btn').last()
}

/** The `.v-progress-circular` inside the submit button of the card. */
function apiSubmitSpinner (next: boolean, which: 'create' | 'delete'): (page: Page) => Locator {
  return page => apiSubmitButton(next, which)(page).locator('.v-progress-circular')
}

/** Masks of the submit spinner (both apps), so the loader's animation does not count as a diff. */
export function apiSubmitSpinnerMasks (which: 'create' | 'delete'): NonNullable<ParityState['masks']> {
  return { legacy: [apiSubmitSpinner(false, which)], next: [apiSubmitSpinner(true, which)] }
}

/** Waits for the submit spinner of the card (the request is pending, so it stays on screen). */
export function waitForApiSubmitLoading (which: 'create' | 'delete', next: boolean): StateAction {
  return async page => {
    await settled(apiSubmitSpinner(next, which)(page))
  }
}

/** The loading table: the title is the readiness anchor (no token row exists yet). */
const resellerApiLoadingBase = resellerApiState({
  ready: resellerApiTitleProbe.legacy,
  handlers: { 'GET /reseller/api-tokens': 'hold' },
  legacy: [waitForResellerUsersSkeleton.legacy],
  next: [waitForResellerUsersSkeleton.next],
})
export const resellerApiLoading: ParityState = {
  ...resellerApiLoadingBase,
  id: 'reseller-api-loading',
  masks: resellerUsersSkeletonMasks,
  probes: [...withoutApiProbes(resellerApiLoadingBase.probes, API_LIST_KEYS), resellerApiSkeletonProbe],
}

/** The create request is held: Create shows its spinner, the X is gone (legacy `v-if="!submitting"`), Cancel is disabled. */
export const resellerApiCreateHeld: ParityState = {
  id: 'reseller-api-create-held',
  ...resellerApiState({
    handlers: { 'POST /reseller/api-tokens': 'hold' },
    legacy: [openCreateModal(false), typeTokenName(false), clickCreateSubmit(false), waitForApiSubmitLoading('create', false)],
    next: [openCreateModal(true), typeTokenName(true), clickCreateSubmit(true), waitForApiSubmitLoading('create', true)],
    probes: apiCreateModalProbes.filter(probe => probe.key !== 'reseller-api-modal-close'),
  }),
  masks: apiSubmitSpinnerMasks('create'),
}

/** The delete request is held: Delete shows its spinner and the X is gone (legacy `v-if="!submitting"`). */
export const resellerApiDeleteHeld: ParityState = {
  id: 'reseller-api-delete-held',
  ...resellerApiState({
    handlers: { [`DELETE /reseller/api-tokens/${FIRST_TOKEN.id}`]: 'hold' },
    legacy: [openApiDeleteModal(false), tickApiModalConfirm(false, 'delete'), clickDeleteSubmit(false), waitForApiSubmitLoading('delete', false)],
    next: [openApiDeleteModal(true), tickApiModalConfirm(true, 'delete'), clickDeleteSubmit(true), waitForApiSubmitLoading('delete', true)],
    probes: apiDeleteModalProbes.filter(probe => probe.key !== 'reseller-api-modal-close'),
  }),
  masks: apiSubmitSpinnerMasks('delete'),
}
