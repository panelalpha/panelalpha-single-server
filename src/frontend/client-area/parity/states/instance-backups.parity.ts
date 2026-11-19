import type { Handler, ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { settled, tr as trKey } from './auth'
import { alertManagerProbe, waitFor } from './hosting'
import { INSTANCE_PAGE_PRIVILEGES, instancePageHandlers, instancePageRaw } from './instance'
import { liteShellHome } from './instances'
import { isDesktop, isMobile, shellHandlers } from './shell'

// S-86 instance-backups, phase 8 (base) and phase 9 (default state): the fixtures, the handlers and the probes every state of the Backups screen shares. The states
// themselves come from phase 9 on; this file only builds the base they patch (no `ParityState` with an `id` here, so the registry
// reads no state from it). app-lite is the source of truth (M-2), so the screen is measured on `/projects/:id/backups`.
// Plan: context/changes/ui-instance-backups/plan.md, "Phase 8".

/** The fixed clock both apps see. The rows are dated back from it, so the list text does not drift. */
export const BACKUPS_CLOCK = '2026-10-25T10:00:00Z'
const DAY = 86_400
const BACKUPS_NOW = Math.floor(Date.parse(BACKUPS_CLOCK) / 1000)

/** One row of `GET /projects/1/wordpress/backups`: the server fields the table, the usage count and the row actions read. */
export function backupRow (id: number, overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id,
    name: null,
    date: BACKUPS_NOW - id * DAY,
    size: 1_048_576,
    type: 'manual',
    mode: 'full',
    convert_from_id: null,
    version: null,
    note: null,
    directory: true,
    database: true,
    async_status: null,
    items: [],
    ...overrides,
  }
}

/**
 * The list the screen shows by default: a manual full backup, an automatic one, an incremental one (converted from the full one above),
 * a failed create (the row blocks its actions) and a backup that carries a WordPress `version` and a note.
 */
export const backupsRows: Array<Record<string, unknown>> = [
  backupRow(1, { name: 'Manual backup', size: 1_610_612_736 }),
  backupRow(2, { type: 'automatic', size: 1_288_490_189 }),
  backupRow(3, { mode: 'incremental', convert_from_id: 1, size: 52_428_800 }),
  backupRow(4, { size: null, async_status: { create: 'failed' } }),
  backupRow(5, { version: '6.7.1', note: 'Before update', size: 838_860_800 }),
]

/** The usage of the plan: under both limits, so "Add new" is enabled (`backups-usage.ts`, `addNewLimitKey` returns `null`). */
export const backupsUsage = {
  manual_backups_number: { total: 3, max: 10 },
  automatic_backups_number: { total: 1, max: null },
  backups_size: { total: 3.5, max: 20 },
}

/** The automatic backup schedule of `GET …/wordpress/automatic-backup`: a daily run at 02:00 (UTC cron fields, as the API stores them). */
export const backupsSchedule = {
  frequency: 'daily',
  cron_hour: '2',
  cron_minute: '0',
  cron_day_of_week: '*',
  cron_day_of_month: '*',
  store_configured: true,
}

/** The app-health answer of a project that runs fine (`GET /projects/{id}/app-health`, as `instance-frame.parity.ts` answers it). */
const APP_HEALTH_OK: Handler = {
  json: { data: { available: true, healthy: true, serving: 'ok', ports: [{ port: 8000, status: 'ok', http_code: 200, detail: 'HTTP 200' }], checks: [] } },
}

/** The `/projects` form of the handler keys: single server rewrites the `/instances` segment (`utils/resourcePaths.js`), as `onLite` does. */
function toProjectRoutes (handlers: Record<string, Handler>): Record<string, Handler> {
  const routed: Record<string, Handler> = {}
  for (const [key, handler] of Object.entries(handlers)) {
    routed[key.replace(/^(\S+) \/instances(?=[/?]|$)/, '$1 /projects')] = handler
  }
  return routed
}

/** The backups endpoints of project 1: the list, the schedule, create, restore and delete (one restore and one delete per row). */
export function backupsEndpoints (rows: Array<Record<string, unknown>> = backupsRows): Record<string, Handler> {
  const handlers: Record<string, Handler> = {
    'GET /projects/1/wordpress/backups': { json: { data: rows, meta: { usage: backupsUsage } } },
    'GET /projects/1/wordpress/automatic-backup': { json: { data: backupsSchedule } },
    'PUT /projects/1/wordpress/automatic-backup': { json: { data: backupsSchedule } },
    'POST /projects/1/wordpress/backups': { status: 204, body: '' },
  }
  for (const row of rows) {
    const id = String(row.id)
    handlers[`PUT /projects/1/wordpress/backups/${id}/restore`] = { status: 204, body: '' }
    handlers[`DELETE /projects/1/wordpress/backups/${id}`] = { status: 204, body: '' }
  }
  return handlers
}

/** Every request the frame, the shell and the Backups screen make on project 1 (the frame's `/instances/1` calls rewritten to `/projects`). */
export function backupsHandlers (extra: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    ...shellHandlers([], 'projects'),
    ...toProjectRoutes(instancePageHandlers({ 'GET /instances/1': { json: { data: instancePageRaw(1, { privileges: INSTANCE_PAGE_PRIVILEGES }) } } })),
    'GET /projects/1/app-health': APP_HEALTH_OK,
    // The deployed lite build asks for the deploy source of the project (a custom project's Git/files source); next never does, so only legacy hits it.
    'GET /projects/1/source': { json: { data: null } },
    ...backupsEndpoints(),
    ...extra,
  }
}

/** The lite `/home` the Backups screen runs on (the single-server flags of `liteShellHome()`). */
// The `admin` key makes both apps mount the style manager drawer (a reseller/admin tool). Its closed panel widens the full-page screenshot and sits
// 100 px lower in V4 (layout offset under the app bar), a shell delta that has nothing to do with this view, so the fixture leaves it out.
const { admin: _styleManagerAdmin, ...liteHomeWithoutAdmin } = liteShellHome()
export const instanceBackupsHome: Record<string, unknown> = liteHomeWithoutAdmin

/**
 * Readiness and content probes of the screen. The first probe is the anchor (the page title). Legacy reads the classes of
 * `views/instance/Backups.vue` and `components/backups/BackupsTable.vue`; next reads the `data-testid` vocabulary of `BackupsView.vue`.
 */
export const instanceBackupsProbes: Probe[] = [
  {
    key: 'title',
    legacy: page => page.locator('h4.page-title__title'),
    next: page => page.locator('h4.page-title__title'),
  },
  {
    // The first row: its date, size, type and actions are read as one probe (the row is the unit both apps render).
    key: 'row-1',
    legacy: page => page.locator('.custom-data-table tbody tr').first(),
    next: page => page.locator('[data-testid="backups-table"] tbody tr').first(),
  },
  {
    key: 'title-box',
    legacy: page => page.locator('.page-title__title-box').first(),
    next: page => page.locator('.page-title__title-box').first(),
  },
  {
    key: 'filter-controls',
    legacy: page => page.locator('.page-title__filter-controls').first(),
    next: page => page.locator('.page-title__filter-controls').first(),
  },
  {
    key: 'add-new',
    legacy: page => page.locator('.add-new-button'),
    next: page => page.getByTestId('backups-add-new'),
  },
  {
    key: 'switcher',
    legacy: page => page.locator('.page-title__filter-controls > .d-flex').first(),
    next: page => page.getByTestId('automatic-backup-switcher'),
  },
  {
    key: 'sort-header',
    legacy: page => page.locator('.custom-data-table thead th').first(),
    next: page => page.locator('[data-testid="backups-table"] thead th').first(),
  },
  {
    key: 'usage-chip',
    legacy: page => page.locator('.custom-info-label').first(),
    next: page => page.getByTestId('backups-usage-item').first(),
  },
]

/**
 * The base every Backups state patches (phase 9 adds the `id` and the state-specific handlers, actions and probes). The screen runs on
 * app-lite (`target` defaults to `lite`), signed in, on the fixed clock, with the default fixtures.
 */
export const instanceBackupsBase: Omit<ParityState, 'id'> = {
  path: '/projects/1/backups',
  signedIn: true,
  clock: BACKUPS_CLOCK,
  home: instanceBackupsHome,
  handlers: backupsHandlers(),
  actions: { legacy: [], next: [] },
  probes: instanceBackupsProbes,
}

/** A state of the Backups screen: the base with the patch of its own. Used by the states of phase 9 on. */
export function instanceBackupsState (patch: Partial<Omit<ParityState, 'id'>> & { id: string }): ParityState {
  return { ...instanceBackupsBase, ...patch }
}

/**
 * The default state: three rows (manual, automatic, incremental; none carries a WordPress `version`), usage under both limits, the
 * switcher on with a daily schedule. Lite (`target: 'lite'` is the default, set here so the state reads as the source of truth).
 */
export const instanceBackupsDefault: ParityState = instanceBackupsState({
  id: 'instance-backups-default',
  target: 'lite',
  handlers: backupsHandlers(backupsEndpoints(backupsRows.slice(0, 3))),
})

/**
 * The version state: the three default rows, with a WordPress `version` on the full backup and on the incremental one (the automatic
 * row keeps an empty cell). The version column shows when any row has a version (legacy `showVersionColumn`), so this state
 * measures the table with the column; the incremental row keeps its convert-to-full action. Phase 10.
 */
const backupsVersionRows: Array<Record<string, unknown>> = backupsRows
  .slice(0, 3)
  .map((row, index) => (index === 1 ? row : { ...row, version: '6.7.1' }))

export const instanceBackupsVersion: ParityState = instanceBackupsState({
  id: 'instance-backups-version',
  target: 'lite',
  handlers: backupsHandlers(backupsEndpoints(backupsVersionRows)),
})

/** A locator per app for the element a hover state points at. */
type Target = (page: Page) => Locator

const addNewTarget: { legacy: Target, next: Target } = {
  legacy: page => page.locator('.add-new-button').first(),
  next: page => page.getByTestId('backups-add-new'),
}

const firstRowTarget: { legacy: Target, next: Target } = {
  legacy: page => page.locator('.custom-data-table tbody tr').first(),
  next: page => page.locator('[data-testid="backups-table"] tbody tr').first(),
}

/**
 * Waits for the first row (the card on mobile) of both apps, so the usage and the button state are final before an action reads them. The
 * legacy bundle takes longer than the 5 s of an `expect` to render on a cold server, so an action that asserts on the button waits here first.
 */
const rowsReady: { legacy: StateAction, next: StateAction } = {
  legacy: waitFor(firstRowTarget.legacy),
  next: waitFor(firstRowTarget.next),
}

/**
 * The hover overlay of "Add new": V2 paints it as the button's `::before`, V4 as `.v-btn__overlay` (the `buttonOverlayProbe` of
 * `auth.ts`, which is not exported, so the same shape is written here).
 */
const addNewOverlayProbe: Probe = {
  key: 'add-new-overlay',
  legacy: addNewTarget.legacy,
  next: page => addNewTarget.next(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

/**
 * `base` with the pointer resting on the element of `target` (transitions are frozen, so the hover is final). A target that the
 * variant does not render (the table rows on mobile are cards) is skipped in both apps, so the state reads the same in both.
 * The pointer stays where the action left it (`pointer: 'keep'`); it is asserted still on the element after the capture.
 */
function hoverState (base: ParityState, id: string, target: { legacy: Target, next: Target }, probes: Probe[] = []): ParityState {
  const hover = (locate: Target): StateAction => async page => {
    const element = locate(page)
    if (await element.count() === 0) {
      return
    }
    await element.hover()
  }
  const stillHovered = (locate: Target): StateAction => async page => {
    const element = locate(page)
    if (await element.count() === 0) {
      return
    }
    const probe = await element.evaluate(node => {
      const box = node.getBoundingClientRect()
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      return { hovered: node.matches(':hover'), onTarget: top !== null && node.contains(top), top: top ? `${top.tagName.toLowerCase()}.${String(top.className).slice(0, 80)}` : 'none', tag: `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 80)}` }
    })
    // The full-page screenshot resizes the viewport, after which Chromium drops the `:hover` flag until the next pointer move (legacy `.add-new-button`
    // reports `:hover` false here while the element under the pointer is its own `.v-btn__content`). The pointer position is what the state
    // guards (a scroll reset must not move the element away), so the element under it has to be the target or a descendant of it.
    expect(probe.onTarget, `pointer on the element ${JSON.stringify(probe)}`).toBe(true)
  }
  return {
    ...base,
    id,
    pointer: 'keep',
    actions: {
      legacy: [...base.actions.legacy, rowsReady.legacy, hover(target.legacy)],
      next: [...base.actions.next, rowsReady.next, hover(target.next)],
    },
    probes: [...base.probes, ...probes],
    afterCapture: {
      legacy: [...(base.afterCapture?.legacy ?? []), stillHovered(target.legacy)],
      next: [...(base.afterCapture?.next ?? []), stillHovered(target.next)],
    },
  }
}

/**
 * Hover of "Add new" (matrix state `hover`, pattern of `buttonHoverState`). The icon-only button on mobile is hovered too, so the
 * overlay is measured on every variant. The default state's rows and usage are under the limit, so the button is enabled.
 */
export const instanceBackupsHover: ParityState = hoverState(instanceBackupsDefault, 'instance-backups-hover', addNewTarget, [addNewOverlayProbe])

/**
 * Hover of the first table row (matrix state `hover`, the row variant). The row probe is already in the base probes, so its computed
 * background is compared with the hover applied. Desktop only: on mobile the rows are cards without a hover effect, and the action
 * skips the missing row.
 */
export const instanceBackupsRowHover: ParityState = hoverState(instanceBackupsDefault, 'instance-backups-row-hover', firstRowTarget)

/**
 * Keyboard focus on "Add new" (matrix state `focus-visible`, the pattern of `buttonFocusState` in `auth.ts`). That helper finds its
 * button by the accessible name, and the button on mobile is icon-only, so the button is located here the way the hover states locate
 * it (by the `data-testid` in next, the `.add-new-button` class in legacy). The pointer is moved off the page and a key that moves no
 * focus is pressed, so the programmatic focus counts as keyboard focus (`:focus-visible`). V4's `.v-btn::after` focus ring is switched
 * off (`_buttons.scss`), so it is asserted hidden in next only. The "try" and "Change" links are not focusable in legacy (1:1), so they
 * stay outside this state.
 */
function focusVisibleState (base: ParityState, id: string, target: { legacy: Target, next: Target }, probes: Probe[] = []): ParityState {
  const focus = (locate: Target): StateAction => async page => {
    await page.mouse.move(0, 0)
    await page.keyboard.press('Shift')
    const element = locate(page)
    await element.focus()
    await expect(element).toBeFocused()
    expect(await element.evaluate(node => node.matches(':focus-visible')), 'keyboard focus').toBe(true)
  }
  const noFocusRing: StateAction = async page => {
    const ring = await target.next(page).evaluate(node => getComputedStyle(node, '::after').opacity)
    expect(ring, 'V4 focus ring hidden').toBe('0')
  }
  return {
    ...base,
    id,
    pointer: 'keep',
    actions: {
      legacy: [...base.actions.legacy, focus(target.legacy)],
      next: [...base.actions.next, focus(target.next)],
    },
    probes: [...base.probes, ...probes],
    afterCapture: {
      legacy: [...(base.afterCapture?.legacy ?? [])],
      next: [...(base.afterCapture?.next ?? []), noFocusRing],
    },
  }
}

/** Keyboard focus on "Add new" (matrix state `focus-visible`), on the default state; the overlay probe compares the focus overlay too. */
export const instanceBackupsFocusVisible: ParityState = focusVisibleState(
  instanceBackupsDefault,
  'instance-backups-focus-visible',
  addNewTarget,
  [addNewOverlayProbe],
)

/** The usage at the manual limit (10 of 10): "Add new" is disabled and its limit tooltip is the reason (`addNewLimitKey`, `manual_count`). */
const backupsLimitUsage = { ...backupsUsage, manual_backups_number: { total: 10, max: 10 } }

/** The `span` that wraps the disabled "Add new" button: a disabled button takes no pointer events, so the tooltip opens on the wrapper. */
const addNewWrapper: { legacy: Target, next: Target } = {
  legacy: page => page.locator('span:has(> .add-new-button)').first(),
  next: page => page.locator('span:has(> [data-testid="backups-add-new"])').first(),
}

/** The limit tooltip of "Add new" (legacy `.menuable__content__active`, next `.v-overlay__content`, as the other tooltip states read them). */
const limitTooltip: { legacy: Target, next: Target } = {
  legacy: page => page.locator('.v-tooltip__content.menuable__content__active').first(),
  // The page mounts many tooltips (top bar, usage chips); only the hovered one is `.v-overlay--active`.
  next: page => page.locator('.v-tooltip.v-overlay--active > .v-overlay__content').first(),
}

/**
 * Disabled "Add new" (matrix state `disabled`): the manual count is at its limit, so the button is disabled and hovering its wrapper
 * opens the limit tooltip. The rows are the three default ones; the usage is the only change. The disabled colour follows the app
 * variant (`ui-buttons-tokens`, research "Wyjątki M-1"), so a delta there is recorded as an exception in Phase 21, not fixed here.
 */
export const instanceBackupsDisabled: ParityState = instanceBackupsState({
  id: 'instance-backups-disabled',
  target: 'lite',
  handlers: backupsHandlers({
    ...backupsEndpoints(backupsRows.slice(0, 3)),
    'GET /projects/1/wordpress/backups': { json: { data: backupsRows.slice(0, 3), meta: { usage: backupsLimitUsage } } },
  }),
  pointer: 'keep',
  actions: {
    legacy: [
      rowsReady.legacy,
      async page => {
        await expect(addNewTarget.legacy(page), 'Add new disabled').toBeDisabled()
        await addNewWrapper.legacy(page).hover()
        await expect(limitTooltip.legacy(page)).toBeVisible()
      },
    ],
    next: [
      rowsReady.next,
      async page => {
        await expect(addNewTarget.next(page), 'Add new disabled').toBeDisabled()
        await addNewWrapper.next(page).hover()
        await expect(limitTooltip.next(page)).toBeVisible()
      },
    ],
  },
  probes: [...instanceBackupsProbes, { key: 'limit-tooltip', legacy: limitTooltip.legacy, next: limitTooltip.next, internal: true }],
})

/** The "try" link of a row whose action failed (`BackupsTable.vue`: `.try-again` beside the `$alerterror` icon, both apps). */
const tryLink = (page: Page) => page.locator('.try-again').first()

/**
 * Rows with failed actions (matrix state `error`): the first row failed a restore, the second a delete, the fourth a create (the base
 * rows). Each replaces its buttons with the alert status and the "try" link, so the state shows the three failure kinds in one table.
 */
const backupsErrorRows: Array<Record<string, unknown>> = backupsRows.map((row, index) => {
  if (index === 0) {
    return { ...row, async_status: { restore: 'failed' } }
  }
  if (index === 1) {
    return { ...row, async_status: { delete: 'failed' } }
  }
  return row
})

export const instanceBackupsError: ParityState = instanceBackupsState({
  id: 'instance-backups-error',
  target: 'lite',
  handlers: backupsHandlers(backupsEndpoints(backupsErrorRows)),
  probes: [...instanceBackupsProbes, { key: 'try-link', legacy: tryLink, next: tryLink }],
})

/**
 * The empty list (matrix state `empty`): no rows, so the table shows its no-data block with the illustration, the title, the
 * description and the "Create backup" action; the header and the footer are not rendered. The usage stays as in the default state.
 * `GET` answering 500 leaves the same empty table (legacy `.catch(() => {})`, research "Macierz"), so it is measured here, not as a
 * separate state.
 */
const emptyBlock: { legacy: Target, next: Target } = {
  legacy: page => page.locator('.custom-data-table .my-10').first(),
  next: page => page.getByTestId('backups-empty'),
}

const emptyCreate: { legacy: Target, next: Target } = {
  legacy: page => page.locator('.custom-data-table .my-10 .v-btn').first(),
  next: page => page.getByTestId('backups-empty-add'),
}

export const instanceBackupsEmpty: ParityState = instanceBackupsState({
  id: 'instance-backups-empty',
  target: 'lite',
  handlers: backupsHandlers(backupsEndpoints([])),
  probes: [
    ...instanceBackupsProbes,
    { key: 'empty-block', legacy: emptyBlock.legacy, next: emptyBlock.next },
    { key: 'empty-create', legacy: emptyCreate.legacy, next: emptyCreate.next },
  ],
})

/** The lite `/home` with the Community panel on: the switcher's "configure store" link is a router link to Settings only then (`community_panel`). */
const instanceBackupsFreePanelHome: Record<string, unknown> = {
  ...instanceBackupsHome,
  app: { ...(instanceBackupsHome.app as Record<string, unknown>), community_panel: true },
}

/**
 * Project without a backup store (matrix state `empty`, the "no store" variant): the schedule is `never` and the store is not
 * configured, so the switcher shows "Disabled" and the "configure store" link to `/settings?tab=backups` (Free panel). The rows and
 * the usage are the default ones.
 */
export const instanceBackupsNoStore: ParityState = instanceBackupsState({
  id: 'instance-backups-no-store',
  target: 'lite',
  home: instanceBackupsFreePanelHome,
  handlers: backupsHandlers({
    'GET /projects/1/wordpress/automatic-backup': { json: { data: { ...backupsSchedule, frequency: 'never', store_configured: false } } },
  }),
  probes: [
    ...instanceBackupsProbes,
    {
      key: 'configure-store',
      legacy: page => page.locator('.configure-store').first(),
      next: page => page.locator('.configure-store').first(),
    },
  ],
})

/**
 * First load pending (matrix state `loading`): `GET backups` and `GET automatic-backup` never answer. The table shows its skeleton
 * (desktop: the sort header and five rows; below `lg`: five cards), the switcher its skeleton, and the usage chips are hidden
 * (`v-if="!itemsLoading"`, `BackupsView.vue`). The shimmer of the skeletons is masked, as the other loading states do.
 */
export const instanceBackupsLoading: ParityState = instanceBackupsState({
  id: 'instance-backups-loading',
  target: 'lite',
  handlers: backupsHandlers({
    'GET /projects/1/wordpress/backups': 'hold',
    'GET /projects/1/wordpress/automatic-backup': 'hold',
  }),
  actions: {
    legacy: [
      async page => {
        await page.locator('.v-main .data-table .v-skeleton-loader').first().waitFor({ state: 'visible', timeout: 30_000 })
        await settled(page.locator('.v-main .data-table .v-skeleton-loader').first())
        await expect(page.locator('.switch-skeleton').first(), 'switcher skeleton').toBeVisible()
        await expect(page.locator('.custom-info-label'), 'usage chips hidden').toHaveCount(0)
      },
    ],
    next: [
      async page => {
        await page.locator('.v-main .data-table .v-skeleton-loader').first().waitFor({ state: 'visible', timeout: 30_000 })
        await settled(page.locator('.v-main .data-table .v-skeleton-loader').first())
        await expect(page.locator('.switch-skeleton').first(), 'switcher skeleton').toBeVisible()
        await expect(page.getByTestId('backups-usage-item'), 'usage chips hidden').toHaveCount(0)
      },
    ],
  },
  probes: [
    ...instanceBackupsProbes,
    {
      key: 'table-card',
      legacy: page => page.locator('.v-main .data-table'),
      next: page => page.locator('.v-main .data-table'),
    },
    {
      key: 'skeleton',
      legacy: page => page.locator('.v-main .data-table .v-skeleton-loader').first(),
      next: page => page.locator('.v-main .data-table .v-skeleton-loader').first(),
      internal: true,
    },
    {
      key: 'sort-skeleton',
      legacy: page => page.locator('.v-main .data-table thead.sort'),
      next: page => page.locator('.v-main .data-table thead.sort'),
      internal: true,
      when: isDesktop,
    },
    {
      key: 'row-skeleton',
      legacy: page => page.locator('.v-main .data-table tbody.item tr').first(),
      next: page => page.locator('.v-main .data-table tbody.item tr').first(),
      internal: true,
      when: isDesktop,
    },
    {
      key: 'mobile-skeleton',
      legacy: page => page.locator('.v-main .data-table .mobile-item').first(),
      next: page => page.locator('.v-main .data-table .mobile-item').first(),
      internal: true,
      when: variant => !isDesktop(variant),
    },
    {
      key: 'switch-skeleton',
      legacy: page => page.locator('.switch-skeleton').first(),
      next: page => page.locator('.switch-skeleton').first(),
    },
  ],
  masks: {
    legacy: [page => page.locator('.v-skeleton-loader')],
    next: [page => page.locator('.v-skeleton-loader')],
  },
})

/** The rows the selected state checks: the manual backup and the incremental one (rows 1 and 3 of the default list). */
const selectedIndices = [0, 2]

/** The row checkboxes of both apps: one `input` per row in the table body (the desktop cell, or the card below `lg`). */
const selectedRowCheckbox: { legacy: string, next: string } = {
  legacy: '.custom-data-table tbody tr input[type="checkbox"]',
  next: '[data-testid="backups-table"] tbody tr input[type="checkbox"]',
}

/** The selection bar of both apps (`.snackbar` is the class both render; the wrapper is V2 `.v-snack__wrapper`, V4 `.v-snackbar__wrapper`). */
const selectedSnackbar: { legacy: string, next: string } = {
  legacy: '.snackbar .v-snack__wrapper',
  next: '.snackbar .v-snackbar__wrapper',
}

/**
 * Checks the rows the way a user does, by a click on each row's checkbox input (`evaluate`, so the pointer does not move). The bar is
 * settled after the last click; the count probe then reads the two selected rows.
 */
function selectRows (checkboxes: string, snackbar: string): StateAction {
  return async page => {
    for (const index of selectedIndices) {
      await page.locator(checkboxes).nth(index).evaluate((el: HTMLElement) => el.click())
    }
    await settled(page.locator(snackbar))
  }
}

/**
 * Selection bar (matrix state `selected`, the phase 16 state): two rows checked, so the bar shows the count, "Remove" and the select-all
 * pair on desktop, and the close button, the select-all checkbox and the "more" menu (closed) on mobile. The bar is always dark (legacy
 * `theme="dark"`). Rows and usage are the default ones.
 */
export const instanceBackupsSelected: ParityState = {
  ...instanceBackupsDefault,
  id: 'instance-backups-selected',
  target: 'lite',
  actions: {
    legacy: [selectRows(selectedRowCheckbox.legacy, selectedSnackbar.legacy)],
    next: [selectRows(selectedRowCheckbox.next, selectedSnackbar.next)],
  },
  probes: [
    ...instanceBackupsProbes,
    {
      key: 'snackbar',
      legacy: page => page.locator('.snackbar .v-snack__wrapper'),
      next: page => page.locator('.snackbar .v-snackbar__wrapper'),
      internal: true,
    },
    {
      key: 'snackbar-count',
      legacy: page => page.locator('.snackbar__item-number'),
      next: page => page.getByTestId('select-snackbar-count'),
      when: isDesktop,
    },
    {
      key: 'snackbar-remove',
      legacy: page => page.locator('.snackbar__row .v-btn').first(),
      next: page => page.getByTestId('backups-snackbar-remove'),
      when: isDesktop,
    },
    {
      key: 'snackbar-select-all',
      legacy: page => page.locator('.snackbar__row .btn-icon-horizontal').first(),
      next: page => page.locator('.snackbar__row .btn-icon-horizontal').first(),
      when: isDesktop,
    },
    {
      key: 'snackbar-deselect',
      legacy: page => page.locator('.snackbar__row .btn-icon-horizontal').nth(1),
      next: page => page.locator('.snackbar__row .btn-icon-horizontal').nth(1),
      when: isDesktop,
    },
    {
      key: 'snackbar-close',
      legacy: page => page.locator('.snackbar .snackbar-button'),
      next: page => page.locator('.snackbar .snackbar-button'),
      internal: true,
      when: isMobile,
    },
    {
      key: 'snackbar-more',
      legacy: page => page.locator('.snackbar .v-btn.ml-auto'),
      next: page => page.getByTestId('select-snackbar-more'),
      when: isMobile,
    },
  ],
}

/** Copy from the app-lite translation (the Backups screen is lite, `target: 'lite'`). */
const tr = (key: string): string => trKey(key, 'lite')

/** The create modal of both apps: the legacy `.basic-modal` in the open dialog (titled), next the `create-backup-modal` testid. */
const createModal: { legacy: Target, next: Target } = {
  legacy: page => page.locator('.v-dialog--active .basic-modal').filter({ hasText: tr('heading.instance.backups.create.title') }),
  next: page => page.getByTestId('create-backup-modal'),
}

/** Opens the create modal with "Add new" (the click is dispatched on the element, so the pointer stays where it is). */
const createOpen: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await rowsReady.legacy(page)
    await page.locator('.add-new-button').first().evaluate((el: HTMLElement) => el.click())
    await expect(createModal.legacy(page)).toBeVisible()
  },
  next: async page => {
    await rowsReady.next(page)
    await page.getByTestId('backups-add-new').evaluate((el: HTMLElement) => el.click())
    await expect(createModal.next(page)).toBeVisible()
  },
}

/** Submits the create form with its "Create" button (the form has no required field, the defaults are sent). */
const createSubmit: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await createModal.legacy(page).getByRole('button', { name: tr('button.create'), exact: true }).click()
  },
  next: async page => {
    await createModal.next(page).getByRole('button', { name: tr('button.create'), exact: true }).click()
  },
}

const createProbes: Probe[] = [
  ...instanceBackupsProbes,
  { key: 'create-modal', legacy: createModal.legacy, next: createModal.next },
  {
    key: 'create-submit',
    legacy: page => createModal.legacy(page).getByRole('button', { name: tr('button.create'), exact: true }),
    next: page => createModal.next(page).getByRole('button', { name: tr('button.create'), exact: true }),
  },
  {
    key: 'create-cancel',
    legacy: page => createModal.legacy(page).getByRole('button', { name: tr('button.cancel'), exact: true }),
    next: page => createModal.next(page).getByRole('button', { name: tr('button.cancel'), exact: true }),
    internal: true,
  },
]

/**
 * Create modal, default (matrix state of the modal, phase 17): "Add new" opens the 560 px dialog with the default fields (directory and
 * database checked, empty note). Create success is not measured: after a create the lite screen does not reload its list (D2).
 * WP Cloud variant not added: the instance fixture has no `hostingServerType`, so it would need a new fixture (out of scope).
 */
export const instanceBackupsCreateModal: ParityState = {
  ...instanceBackupsDefault,
  id: 'instance-backups-create-modal',
  actions: { legacy: [createOpen.legacy], next: [createOpen.next] },
  probes: createProbes,
}

/** The message of a refused create: the 422 body the modal shows in the alert manager (`BackupActionsMixin.js:259`, next `CreateBackupModal.vue`). */
const createRefusedMessage = 'The backup could not be created.'

/**
 * Create refused (matrix state `error`, phase 17): the POST answers 422, so the dialog stays open on its form and the alert manager
 * shows the message. Both apps keep the modal open after the error (the legacy `submittingError`, the next `catch`).
 */
export const instanceBackupsCreateModalError: ParityState = {
  ...instanceBackupsDefault,
  id: 'instance-backups-create-modal-error',
  handlers: {
    ...instanceBackupsDefault.handlers,
    'POST /projects/1/wordpress/backups': { status: 422, json: { message: createRefusedMessage } },
  },
  actions: {
    legacy: [
      createOpen.legacy,
      createSubmit.legacy,
      waitFor(page => page.locator('.alert-manager', { hasText: createRefusedMessage })),
    ],
    next: [
      createOpen.next,
      createSubmit.next,
      waitFor(page => page.getByTestId('shell-alert-manager').filter({ hasText: createRefusedMessage })),
    ],
  },
  probes: [...createProbes, alertManagerProbe],
}

/** Row actions of the first row in the order both apps render them on a manual backup: download (0), restore (1), delete (2). */
const RESTORE_ACTION_INDEX = 1
const DELETE_ACTION_INDEX = 2

/**
 * The row action buttons of the first row, whichever layout the viewport renders: the desktop row (`tbody tr`) or the mobile card
 * (`mobile-table-item__actions` in legacy, `backups-mobile-item` in next). Only one layout is in the DOM at a time.
 */
const firstRowActions: { legacy: Target, next: Target } = {
  legacy: page => page.locator('.custom-data-table tbody tr:first-child .v-btn, .mobile-table-item__actions .v-btn'),
  next: page => page.locator('[data-testid="backups-table"] tbody tr:first-child .v-btn, [data-testid="backups-mobile-item"] .v-btn'),
}

/** The modal the row actions open: the legacy `.basic-modal` in the open dialog (titled), next the host's `instances-modal`. */
const actionModal: { legacy: (title: string) => Target, next: Target } = {
  legacy: title => page => page.locator('.v-dialog--active .basic-modal').filter({ hasText: title }),
  next: page => page.getByTestId('instances-modal'),
}

/** Opens a row action's modal with a click on its button (`evaluate`, so the page does not scroll under the dialog). */
function openRowAction (index: number, title: string): { legacy: StateAction, next: StateAction } {
  return {
    legacy: async page => {
      await rowsReady.legacy(page)
      await firstRowActions.legacy(page).nth(index).evaluate((el: HTMLElement) => el.click())
      await expect(actionModal.legacy(title)(page)).toBeVisible()
    },
    next: async page => {
      await rowsReady.next(page)
      await firstRowActions.next(page).nth(index).evaluate((el: HTMLElement) => el.click())
      await expect(actionModal.next(page)).toBeVisible()
    },
  }
}

/** A checkbox of the action modal by its place in the form (the BasicModal `.checkbox` of both apps). */
function modalCheckbox (index: number): Probe {
  return {
    key: `modal-checkbox-${index + 1}`,
    legacy: page => page.locator('.v-dialog--active .v-card__text .checkbox').nth(index),
    next: page => page.getByTestId('instances-modal').locator('.v-card-text .checkbox').nth(index),
    internal: true,
  }
}

/** The BasicModal of a row action: card, title, message and the submit and cancel buttons (the `modalProbes` shape, own titles). */
const actionModalProbes: Probe[] = [
  {
    key: 'modal',
    legacy: page => page.locator('.v-dialog--active .v-card'),
    next: page => page.getByTestId('instances-modal'),
  },
  {
    key: 'modal-message',
    legacy: page => page.locator('.v-dialog--active .v-card__text p').first(),
    next: page => page.getByTestId('instances-modal').locator('.v-card-text p').first(),
    internal: true,
  },
  {
    key: 'modal-submit',
    legacy: page => page.locator('.v-dialog--active .v-card__actions .v-btn').first(),
    next: page => page.getByTestId('instances-modal').locator('.v-card-actions .v-btn').first(),
  },
  {
    key: 'modal-cancel',
    legacy: page => page.locator('.v-dialog--active .v-card__actions .v-btn').nth(1),
    next: page => page.getByTestId('instances-modal').locator('.v-card-actions .v-btn').nth(1),
    internal: true,
  },
]

/**
 * Restore modal (phase 18): "Restore" on row 1 (the manual backup, with a database and a directory) opens the dialog with the three
 * checkboxes: restore database and restore directory (unchecked), delete existing files (checked, with its tooltip).
 * The submit is enabled, since restore has no confirm checkbox. Hover and focus on the submit are not in this phase's state list.
 */
const restoreOpen = openRowAction(RESTORE_ACTION_INDEX, tr('heading.instance.backups.restore.title'))

export const instanceBackupsRestoreModal: ParityState = {
  ...instanceBackupsDefault,
  id: 'instance-backups-restore-modal',
  actions: { legacy: [restoreOpen.legacy], next: [restoreOpen.next] },
  probes: [...instanceBackupsProbes, ...actionModalProbes, modalCheckbox(0), modalCheckbox(1), modalCheckbox(2)],
}

/**
 * Delete modal (phase 18): "Delete" on row 1 opens the dialog with the required confirm checkbox. The Delete button is disabled until the
 * checkbox is ticked (legacy `BackupActionsMixin.js:24-52`, next `confirmRequired`), so the state keeps the checkbox unticked and
 * measures the disabled button. The message carries the escaped date of the backup; the probe reads it as text.
 */
const deleteOpen = openRowAction(DELETE_ACTION_INDEX, tr('heading.instance.backups.delete.title_one'))

export const instanceBackupsDeleteModal: ParityState = {
  ...instanceBackupsDefault,
  id: 'instance-backups-delete-modal',
  actions: { legacy: [deleteOpen.legacy], next: [deleteOpen.next] },
  probes: [...instanceBackupsProbes, ...actionModalProbes, modalCheckbox(0)],
}

/** The mass delete dialog title (legacy `showMassDeleteModal` with `count: 2`, the plural copy) and the first progress line of two rows. */
const massDeleteTitle = tr('heading.instance.backups.delete.title_other')
const massDeleteFirstLine = `${tr('heading.instance.backups.delete.info')} 1/2`

/**
 * Opens the mass delete dialog from the selection bar: the desktop "Remove" button, or the first item of the compact "more" menu below
 * 966 px (legacy `BackupsSelectSnackbar.vue`, next `backups-snackbar-menu-remove`). Both apps close the menu before the dialog opens.
 */
const massDeleteOpen: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    if ((page.viewportSize()?.width ?? 1440) > 966) {
      await page.locator('.snackbar__row .v-btn').first().click()
    } else {
      await page.locator('.snackbar .v-btn.ml-auto').click()
      await page.locator('.v-menu__content.menuable__content__active .v-list-item').first().click()
    }
    await expect(actionModal.legacy(massDeleteTitle)(page)).toBeVisible()
  },
  next: async page => {
    if ((page.viewportSize()?.width ?? 1440) > 966) {
      await page.getByTestId('backups-snackbar-remove').click()
    } else {
      await page.getByTestId('select-snackbar-more').click()
      await page.getByTestId('backups-snackbar-menu-remove').click()
    }
    await expect(actionModal.next(page)).toBeVisible()
  },
}

/** The submit (Delete) of the mass delete dialog: legacy puts it first (`unshift`), next keeps the same order in `.v-card-actions`. */
const massDeleteSubmit: { legacy: Target, next: Target } = {
  legacy: page => page.locator('.v-dialog--active .v-card__actions .v-btn').first(),
  next: page => page.getByTestId('instances-modal').locator('.v-card-actions .v-btn').first(),
}

/** The `pre` of the dialog that carries the progress log of the run (`BasicModal`, both apps). */
const progressLog: { legacy: Target, next: Target } = {
  legacy: page => page.locator('.v-dialog--active pre'),
  next: page => page.getByTestId('instances-modal').locator('pre'),
}

/**
 * Mass delete dialog (phase 19): two rows checked on the default list (rows 1 and 3), then the bar's "Remove" opens the plural dialog. No
 * confirm checkbox (legacy `showMassDeleteModal`), so the Delete button is active at once and the probes read it enabled. The rows and
 * the usage are the default ones.
 */
export const instanceBackupsMassDeleteModal: ParityState = {
  ...instanceBackupsDefault,
  id: 'instance-backups-mass-delete-modal',
  actions: {
    legacy: [selectRows(selectedRowCheckbox.legacy, selectedSnackbar.legacy), massDeleteOpen.legacy],
    next: [selectRows(selectedRowCheckbox.next, selectedSnackbar.next), massDeleteOpen.next],
  },
  probes: [...instanceBackupsProbes, ...actionModalProbes],
}

/**
 * Mass delete running (phase 19): the same dialog, then Delete. The first row's delete request is held, so the run stays on its first
 * line ("Deleting backup 1/2...") and the dialog stays open and persistent, which is the state the progress log shows.
 */
export const instanceBackupsMassDeleteModalLoading: ParityState = {
  ...instanceBackupsDefault,
  id: 'instance-backups-mass-delete-modal-loading',
  handlers: {
    ...instanceBackupsDefault.handlers,
    'DELETE /projects/1/wordpress/backups/1': 'hold',
  },
  actions: {
    legacy: [
      selectRows(selectedRowCheckbox.legacy, selectedSnackbar.legacy),
      massDeleteOpen.legacy,
      async page => {
        await massDeleteSubmit.legacy(page).click()
        await expect(page.locator('.v-dialog--active pre', { hasText: massDeleteFirstLine })).toBeVisible()
      },
    ],
    next: [
      selectRows(selectedRowCheckbox.next, selectedSnackbar.next),
      massDeleteOpen.next,
      async page => {
        await massDeleteSubmit.next(page).click()
        await expect(page.getByTestId('instances-modal').locator('pre', { hasText: massDeleteFirstLine })).toBeVisible()
      },
    ],
  },
  probes: [...instanceBackupsProbes, ...actionModalProbes, { key: 'progress-log', ...progressLog }],
}

/** The first row carries two files (a directory and a database), so the download asks which one to take (legacy `showDownloadItemModal`). */
const downloadRows: Array<Record<string, unknown>> = backupsRows.slice(0, 3).map((row, index) => (index === 0
  ? { ...row, items: [{ id: 11, directory: true, database: false }, { id: 12, directory: false, database: true }] }
  : row))

/** Download is the first row action, before restore and delete (legacy order, see `RESTORE_ACTION_INDEX`). */
const DOWNLOAD_ACTION_INDEX = 0
const downloadOpen = openRowAction(DOWNLOAD_ACTION_INDEX, tr('heading.instance.backups.download.title'))

/**
 * Download dialog (phase 19): "Download" on row 1 (two files) opens the dialog with the file select, the first file preselected. The
 * width (560 px) is not verified against legacy yet; the parity measurement (phase 21) decides it (S-11 Notes). Probes: the dialog, its
 * copy and buttons, and the select of the file.
 */
export const instanceBackupsDownloadModal: ParityState = {
  ...instanceBackupsDefault,
  id: 'instance-backups-download-modal',
  handlers: backupsHandlers(backupsEndpoints(downloadRows)),
  actions: { legacy: [downloadOpen.legacy], next: [downloadOpen.next] },
  probes: [
    ...instanceBackupsProbes,
    ...actionModalProbes,
    {
      key: 'download-select',
      legacy: page => page.locator('.v-dialog--active .v-card__text .v-select'),
      next: page => page.getByTestId('instances-modal').locator('.v-card-text .v-select'),
    },
  ],
}

/**
 * Automatic backup modal (phase 20): "Change" on the schedule text opens the 560 px dialog in edit mode. The link is a `<b>` inside the
 * `<p>` that carries the click, so the click runs on the `<b>` element (no scroll under the dialog). The modal and the confirmation use
 * the same titles in both apps; the time select is measured closed (its menu is not part of the state).
 */
const automaticChange: { legacy: Target, next: Target } = {
  legacy: page => page.locator('.page-title__filter-controls > .d-flex').first().locator('p.line-16 b'),
  next: page => page.getByTestId('automatic-backup-switcher').locator('p.line-16 b'),
}

const automaticModal: { legacy: Target, next: Target } = {
  legacy: page => page.locator('.v-dialog--active .v-card').filter({ hasText: tr('heading.instance.automaticBackup.title') }),
  next: page => page.getByTestId('automatic-backups-modal'),
}

/** Opens the schedule modal with "Change" (`evaluate`, so the page does not scroll under the dialog). */
const automaticOpen: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await rowsReady.legacy(page)
    await automaticChange.legacy(page).evaluate((el: HTMLElement) => el.click())
    await expect(automaticModal.legacy(page)).toBeVisible()
  },
  next: async page => {
    await rowsReady.next(page)
    await automaticChange.next(page).evaluate((el: HTMLElement) => el.click())
    await expect(automaticModal.next(page)).toBeVisible()
  },
}

/** The schedule modal: the card, the time select (closed), the submit (first action) and the cancel (second action). */
const automaticModalProbes: Probe[] = [
  { key: 'automatic-modal', legacy: automaticModal.legacy, next: automaticModal.next },
  {
    key: 'automatic-modal-time',
    legacy: page => automaticModal.legacy(page).locator('.v-select').first(),
    // V2 `v-autocomplete` extends `v-select` (`.v-select`); V4 renders `.v-autocomplete`.
    next: page => automaticModal.next(page).locator('.v-autocomplete').first(),
    internal: true,
  },
  {
    key: 'automatic-modal-submit',
    legacy: page => automaticModal.legacy(page).locator('.v-card__actions .v-btn').first(),
    next: page => automaticModal.next(page).locator('.v-card-actions .v-btn').first(),
  },
  {
    key: 'automatic-modal-cancel',
    legacy: page => automaticModal.legacy(page).locator('.v-card__actions .v-btn').nth(1),
    next: page => automaticModal.next(page).locator('.v-card-actions .v-btn').nth(1),
    internal: true,
  },
]

/**
 * Schedule modal (phase 20, matrix state of the modal): "Change" on the default daily schedule opens the dialog in edit mode, with the
 * frequency, the time (02:00 UTC shown as local time, the harness runs in UTC) and the submit "Save" of the edit copy.
 */
export const instanceBackupsAutomaticModal: ParityState = {
  ...instanceBackupsDefault,
  id: 'instance-backups-automatic-modal',
  actions: { legacy: [automaticOpen.legacy], next: [automaticOpen.next] },
  probes: [...instanceBackupsProbes, ...automaticModalProbes],
}

/** The message of a refused schedule save: the 422 body the modal shows in the alert manager (`submitAutoBackupsSettings`, next `submitSettings`). */
const automaticRefusedMessage = 'The automatic backup settings could not be saved.'

/**
 * Schedule save refused (phase 20): the PUT answers 422, both apps close the modal after the request and show the message in the
 * alert manager (legacy `response.error`, next `catch`). The state measures the alert, since the modal is gone by then.
 */
export const instanceBackupsAutomaticModalError: ParityState = {
  ...instanceBackupsDefault,
  id: 'instance-backups-automatic-modal-error',
  handlers: {
    ...instanceBackupsDefault.handlers,
    'PUT /projects/1/wordpress/automatic-backup': { status: 422, json: { message: automaticRefusedMessage } },
  },
  actions: {
    legacy: [
      automaticOpen.legacy,
      async page => {
        await automaticModal.legacy(page).locator('.v-card__actions .v-btn').first().click()
      },
      waitFor(page => page.locator('.alert-manager', { hasText: automaticRefusedMessage })),
    ],
    next: [
      automaticOpen.next,
      async page => {
        await automaticModal.next(page).locator('.v-card-actions .v-btn').first().click()
      },
      waitFor(page => page.getByTestId('shell-alert-manager').filter({ hasText: automaticRefusedMessage })),
    ],
  },
  probes: [...instanceBackupsProbes, alertManagerProbe],
}

/** The switch of the schedule (`.switch-container`): on an enabled schedule its click asks the disable confirmation. */
const switchContainer: { legacy: Target, next: Target } = {
  legacy: page => page.locator('.page-title__filter-controls > .d-flex').first().locator('.switch-container'),
  next: page => page.getByTestId('automatic-backup-switcher').locator('.switch-container'),
}

/** The confirmation is a menu attached to the switch in both apps: legacy `.v-menu__content` (titled), next the testid card. */
const confirmationCard: { legacy: Target, next: Target } = {
  legacy: page => page.locator('.v-menu__content.menuable__content__active .v-card')
    .filter({ hasText: tr('heading.instance.siteDetails.security.automaticBackup.modal.title') }),
  next: page => page.getByTestId('automatic-backups-confirmation'),
}

/**
 * Disable confirmation (phase 20): the switch of an enabled schedule opens the confirmation menu (legacy `handleSwitchChange`, next the
 * same). The state keeps it open: the card, the "Disable" button (first) and "Cancel" (second).
 */
export const instanceBackupsAutomaticConfirmation: ParityState = {
  ...instanceBackupsDefault,
  id: 'instance-backups-automatic-confirmation',
  actions: {
    legacy: [
      rowsReady.legacy,
      async page => {
        await switchContainer.legacy(page).evaluate((el: HTMLElement) => el.click())
        await expect(confirmationCard.legacy(page)).toBeVisible()
      },
    ],
    next: [
      rowsReady.next,
      async page => {
        await switchContainer.next(page).evaluate((el: HTMLElement) => el.click())
        await expect(confirmationCard.next(page)).toBeVisible()
      },
    ],
  },
  probes: [
    ...instanceBackupsProbes,
    { key: 'confirmation', legacy: confirmationCard.legacy, next: confirmationCard.next },
    {
      key: 'confirmation-disable',
      legacy: page => confirmationCard.legacy(page).locator('.v-btn').first(),
      next: page => confirmationCard.next(page).locator('.v-btn').first(),
    },
    {
      key: 'confirmation-cancel',
      legacy: page => confirmationCard.legacy(page).locator('.v-btn').nth(1),
      next: page => confirmationCard.next(page).locator('.v-btn').nth(1),
      internal: true,
    },
  ],
}

// Phase 9 registers the default state, phase 10 the version state, phase 11 the hover states, phase 12 the focus state, phase 13 the disabled and error states, phase 14 the empty and no-store states, phase 15 the loading state, phase 16 the selected state, phase 17 the create modal states, phase 18 the restore and delete modal states, phase 19 the mass delete and download modal states, phase 20 the schedule modal, its save error and the disable confirmation; the later phases add theirs to this list.
const states: ParityState[] = [
  instanceBackupsDefault,
  instanceBackupsVersion,
  instanceBackupsHover,
  instanceBackupsRowHover,
  instanceBackupsFocusVisible,
  instanceBackupsDisabled,
  instanceBackupsError,
  instanceBackupsEmpty,
  instanceBackupsNoStore,
  instanceBackupsLoading,
  instanceBackupsSelected,
  instanceBackupsCreateModal,
  instanceBackupsCreateModalError,
  instanceBackupsRestoreModal,
  instanceBackupsDeleteModal,
  instanceBackupsMassDeleteModal,
  instanceBackupsMassDeleteModalLoading,
  instanceBackupsDownloadModal,
  instanceBackupsAutomaticModal,
  instanceBackupsAutomaticModalError,
  instanceBackupsAutomaticConfirmation,
]

/** States of a table row hover: on mobile the rows are cards without a hover effect (see `instanceBackupsRowHover`), so the state is desktop only. */
const desktopOnlyStates = new Set([instanceBackupsRowHover.id])

// The e2e gate (`e2e/support/fake-backups-api.ts`) imports the handlers of this file; its config sets `E2E_IMPORTS_PARITY_STATES` so the parity tests are not registered there.
for (const state of process.env.E2E_IMPORTS_PARITY_STATES === '1' ? [] : states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    test.skip(desktopOnlyStates.has(state.id) && testInfo.project.name.endsWith('mobile'), 'the table rows are cards on mobile, no row hover')
    await runState(browser, testInfo, state)
  })
}
