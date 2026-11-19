import type { ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { settled } from './auth'
import { blurEmptyCommandLegacy, blurEmptyCommandNext, CRON_PROJECT_HOME, cronActionsProbe, cronConfirmProbe, cronEmptyAddProbe, cronEmptyProbe, cronFrequencyItemProbe, cronFrequencyListProbe, cronFrequencyMenuProbe, cronLoadingProbe, cronModalProbe, cronModalProbes, cronModalSubmitProbe, cronModalTitleProbe, cronNoResultsProbe, cronProjectAddIconProbe, cronProjectAddOverlayProbe, cronProjectAddProbe, cronProjectFilterColProbe, cronProjectHandlers, cronProjectSearchProbe, cronProjectTitleProbe, cronRowDeleteOverlayProbe, cronRowProbe, cronTableProbe, openFrequencyMenu, openProjectAdd, openRowModal, pressSubmit, PROJECT_CRON_JOBS_KEY, rowDeleteButton, tickConfirmLegacy, tickConfirmNext, typeCommand } from './cron'
import { alertManagerProbe, listSearch, NOW, waitFor } from './hosting'
import { INSTANCE_PAGE_DNS } from './instance'
import { ADVANCED_PROJECT_ID, advancedActiveItemProbe, advancedFrameInstance } from './instance-advanced-frame'

// S-108 ui-cron: the Cron list in the Advanced tab of a project (`/projects/:id/advanced/cron`), measured on app-lite (`target: 'lite'`, M-2
// default). Each state id is a literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text. Probes, handlers and
// the project header: `cron.ts`; the frame: `instance-advanced-frame.ts`. Plan: context/changes/ui-cron/plan.md ("Phase 4").

/** Ready when the Advanced sidebar and the first job row are both on the page (the title is the first probe). Each app has its own hook. */
const waitForCron = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(page => page.locator('.v-main .data-table tbody tr').first()),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(page => page.getByTestId('cron-table').locator('tbody tr').first()),
  ],
}

/** The probes of the default state, the readiness anchor first (the title is the first probe). */
const cronDefaultProbes: Probe[] = [
  cronProjectTitleProbe,
  cronProjectFilterColProbe,
  cronProjectAddProbe,
  cronProjectAddIconProbe,
  cronProjectSearchProbe,
  cronTableProbe,
  cronRowProbe,
  cronActionsProbe,
  advancedActiveItemProbe,
]

// Phase 4: the three jobs of the project (the third with an expression the parser rejects, "Invalid Expression"), on the single-server project
// frame (`CRON_PROJECT_HOME`: the lite `/home` without `admin`, so the style manager does not widen the shot).
export const instanceAdvancedCronDefault: ParityState = {
  id: 'cron-default',
  target: 'lite',
  path: `/projects/${ADVANCED_PROJECT_ID}/advanced/cron`,
  signedIn: true,
  clock: NOW,
  home: CRON_PROJECT_HOME,
  handlers: cronProjectHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForCron,
  probes: cronDefaultProbes,
}

type Target = (page: Page) => Locator

/**
 * `base` with the pointer resting on the element of `target` (transitions are frozen, so the hover is final), the pattern of `hovered` in
 * `instance-advanced-ftp.parity.ts` (not exported, so it is written here). A target the variant does not render (the row's icons on mobile
 * are in the card) is skipped in that variant. The pointer stays where the action left it and is asserted on the element after the capture.
 */
function hovered (base: ParityState, target: { legacy: Target, next: Target }, probes: Probe[]): ParityState {
  const hover = (locate: Target): StateAction => async page => {
    const element = locate(page)
    if (await element.count() === 0) {
      return
    }
    await element.hover()
    // gate 3 dark-desktop: once the overlay was captured at opacity 0 (the hover not applied yet); wait for `:hover` on the element itself
    await expect.poll(() => element.evaluate(node => node.matches(':hover'))).toBe(true)
  }
  const stillHovered = (locate: Target): StateAction => async page => {
    const element = locate(page)
    if (await element.count() === 0) {
      return
    }
    const onTarget = await element.evaluate(node => {
      const box = node.getBoundingClientRect()
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      return top !== null && node.contains(top)
    })
    expect(onTarget, 'pointer on the element after the capture').toBe(true)
  }
  return {
    ...base,
    pointer: 'keep',
    actions: {
      legacy: [...base.actions.legacy, hover(target.legacy)],
      next: [...base.actions.next, hover(target.next)],
    },
    probes: [...base.probes, ...probes],
    afterCapture: {
      legacy: [...(base.afterCapture?.legacy ?? []), stillHovered(target.legacy)],
      next: [...(base.afterCapture?.next ?? []), stillHovered(target.next)],
    },
  }
}

// Phase 5: hover of the header's Add button (on mobile it is icon-only, located by the same test id / class as the other probes) and hover
// of the Delete icon of the first row (desktop `.actions-row`; on mobile the icon sits in the card and the state reads as the default one).
export const instanceAdvancedCronHover: ParityState = {
  ...hovered(instanceAdvancedCronDefault, { legacy: cronProjectAddProbe.legacy, next: cronProjectAddProbe.next }, [cronProjectAddOverlayProbe]),
  id: 'cron-hover',
}

export const instanceAdvancedCronRowHover: ParityState = {
  ...hovered(instanceAdvancedCronDefault, { legacy: page => rowDeleteButton(page, false), next: page => rowDeleteButton(page, true) }, [cronRowDeleteOverlayProbe]),
  id: 'cron-row-hover',
}

// Phase 6: keyboard focus of the header's Add button, as `buttonFocusState` in auth.ts (Shift, `focus()`, `:focus-visible` asserted; V4 ring
// hidden in next) but located by the test id / class of the other probes: on mobile the button is icon-only, so it has no accessible name
// for `getByRole` (research Charge 5). The pointer is moved off first and stays where it is (the pattern of `ftp-focus-visible`).
function focusAdd (locate: Target): StateAction {
  return async page => {
    await page.mouse.move(0, 0)
    await page.keyboard.press('Shift')
    const button = locate(page)
    await button.focus()
    await expect(button).toBeFocused()
    expect(await button.evaluate(node => node.matches(':focus-visible')), 'keyboard focus').toBe(true)
  }
}

const noFocusRing: StateAction = async page => {
  const ring = await cronProjectAddProbe.next(page).evaluate(node => getComputedStyle(node, '::after').opacity)
  expect(ring, 'V4 focus ring hidden').toBe('0')
}

export const instanceAdvancedCronFocus: ParityState = {
  ...instanceAdvancedCronDefault,
  id: 'cron-focus-visible',
  pointer: 'keep',
  actions: {
    legacy: [...waitForCron.legacy, focusAdd(cronProjectAddProbe.legacy)],
    next: [...waitForCron.next, focusAdd(cronProjectAddProbe.next)],
  },
  probes: [...cronDefaultProbes, cronProjectAddOverlayProbe],
  afterCapture: {
    legacy: [],
    next: [noFocusRing],
  },
}

/** The probes of a Delete modal: the card, its title, the confirm checkbox and the submit button. */
const cronDeleteModalProbes: Probe[] = [cronModalProbe, cronModalTitleProbe, cronConfirmProbe, cronModalSubmitProbe]

// Phase 7: the Delete modal of the first row before its `confirm` checkbox is ticked (`BasicModal` `confirm-required`): the submit button is
// disabled (looks like app, decision `ui-buttons-tokens`). Opened by a DOM click on the row's Delete icon (`openRowModal`, index 1); only
// the modal's probes are read, as in `hosting-cron-delete-open`.
export const instanceAdvancedCronDisabled: ParityState = {
  ...instanceAdvancedCronDefault,
  id: 'cron-disabled',
  actions: {
    legacy: [...waitForCron.legacy, openRowModal(false, 1)],
    next: [...waitForCron.next, openRowModal(true, 1)],
  },
  probes: cronDeleteModalProbes,
}

// Phase 8: the list request fails (500 `Server Error`): the shell's alert and the table with its empty message (the list was empty before
// the request, legacy keeps it). The readiness anchor is the header title (the table has no row), and the alert is awaited last, since it
// renders after the failed request. The header's filter column stays hidden (`v-show="items.length"`).
const waitForCronError = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(cronProjectTitleProbe.legacy),
    waitFor(alertManagerProbe.legacy),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(cronProjectTitleProbe.next),
    waitFor(alertManagerProbe.next),
  ],
}

export const instanceAdvancedCronError: ParityState = {
  ...instanceAdvancedCronDefault,
  id: 'cron-error',
  handlers: cronProjectHandlers({ [PROJECT_CRON_JOBS_KEY]: { status: 500, json: { message: 'Server Error' } } }),
  actions: waitForCronError,
  probes: [cronProjectTitleProbe, cronTableProbe, cronEmptyProbe, cronEmptyAddProbe, alertManagerProbe, advancedActiveItemProbe],
}

// Phase 9: the Add modal opened from the header's Add button (`every_5_minutes`, the five fields, "Frequency: Every 5 minutes", an empty
// command), and the same modal after the empty Command field is focused and left (the required rule shows on blur in both apps). Only the
// modal's probes are read, as in `hosting-cron-add-open`.
export const instanceAdvancedCronAddModal: ParityState = {
  ...instanceAdvancedCronDefault,
  id: 'cron-add-modal',
  actions: {
    legacy: [...waitForCron.legacy, openProjectAdd(false)],
    next: [...waitForCron.next, openProjectAdd(true)],
  },
  probes: cronModalProbes,
}

export const instanceAdvancedCronAddValidation: ParityState = {
  ...instanceAdvancedCronDefault,
  id: 'cron-add-validation',
  actions: {
    legacy: [...waitForCron.legacy, openProjectAdd(false), blurEmptyCommandLegacy],
    next: [...waitForCron.next, openProjectAdd(true), blurEmptyCommandNext],
  },
  probes: cronModalProbes,
}

// Phase 10: a valid Add is submitted and the server answers 500: the shell's alert, the modal stays open with the typed values (legacy
// `addCronJob` catch, `Cron.vue:553-583`). The alert is awaited last.
const CRON_ADD_COMMAND = '/usr/bin/php /home/example/report.php'

export const instanceAdvancedCronAddError: ParityState = {
  ...instanceAdvancedCronDefault,
  id: 'cron-add-error',
  handlers: cronProjectHandlers({ [`POST ${PROJECT_CRON_JOBS_KEY.slice('GET '.length)}`]: { status: 500, json: { message: 'Server Error' } } }),
  actions: {
    legacy: [...waitForCron.legacy, openProjectAdd(false), typeCommand(false, CRON_ADD_COMMAND), pressSubmit(false), waitFor(alertManagerProbe.legacy)],
    next: [...waitForCron.next, openProjectAdd(true), typeCommand(true, CRON_ADD_COMMAND), pressSubmit(true), waitFor(alertManagerProbe.next)],
  },
  probes: [...cronModalProbes, alertManagerProbe],
}

// Phase 11: Edit of the first row (DOM click on its Edit icon, `openRowModal` index 0): `custom` and the row's values, "Update". On mobile
// legacy passes no row to the card's actions slot (S-36 D3), so its form is empty; next passes the row (M-1 exception, `cron-modal-frequency`).
export const instanceAdvancedCronEditModal: ParityState = {
  ...instanceAdvancedCronDefault,
  id: 'cron-edit-modal',
  actions: {
    legacy: [...waitForCron.legacy, openRowModal(false, 0)],
    next: [...waitForCron.next, openRowModal(true, 0)],
  },
  probes: cronModalProbes,
}

// Phase 11: a project on a WP Cloud host (`hosting_server_type: 'wp-cloud'`, the adapter passes it to the service): the Add modal with its
// frequency select open, which lists the seven WP Cloud options (the app variant, which the deployed app-lite has too, research §2).
export const instanceAdvancedCronWpCloudAddModal: ParityState = {
  ...instanceAdvancedCronDefault,
  id: 'cron-wpcloud-add-modal',
  handlers: cronProjectHandlers({ [`GET /projects/${ADVANCED_PROJECT_ID}`]: { json: { data: { ...advancedFrameInstance, hosting_server_type: 'wp-cloud' } } } }),
  actions: {
    legacy: [...waitForCron.legacy, openProjectAdd(false), openFrequencyMenu(false)],
    next: [...waitForCron.next, openProjectAdd(true), openFrequencyMenu(true)],
  },
  probes: [...cronModalProbes, cronFrequencyMenuProbe, cronFrequencyListProbe, cronFrequencyItemProbe],
}

// Phase 12: the same Delete modal after its `confirm` checkbox is ticked (`confirm-required` lifted): the submit is enabled and red. The state
// ends before the submit is pressed, so no DELETE request is sent. Only the modal's probes are read, as in `hosting-cron-delete-confirmed`.
export const instanceAdvancedCronDeleteModal: ParityState = {
  ...instanceAdvancedCronDefault,
  id: 'cron-delete-modal',
  actions: {
    legacy: [...waitForCron.legacy, openRowModal(false, 1), tickConfirmLegacy],
    next: [...waitForCron.next, openRowModal(true, 1), tickConfirmNext],
  },
  probes: cronDeleteModalProbes,
}

// Phase 13: the project has no cron jobs (`data: []`): the table shows `TableFullScreenMessage` with the illustration and the Add button, and
// the header's filter column (search and Add) is hidden (`v-show="items.length"` in both apps). The readiness anchor is the empty message.
const waitForCronEmpty = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(cronEmptyProbe.legacy),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(cronEmptyProbe.next),
  ],
}

export const instanceAdvancedCronEmpty: ParityState = {
  ...instanceAdvancedCronDefault,
  id: 'cron-empty',
  handlers: cronProjectHandlers({ [PROJECT_CRON_JOBS_KEY]: { json: { data: [] } } }),
  actions: waitForCronEmpty,
  probes: [cronProjectTitleProbe, cronTableProbe, cronEmptyProbe, cronEmptyAddProbe, advancedActiveItemProbe],
}

// Phase 13: a search term without matches on the project's jobs: the table shows `NoResults` with Clear filter, the header keeps its search
// and Add. `listSearch` types the term (opening the icon-only search below `md`) and steps the clock until the message renders, so legacy's
// lodash debounce fires under the fixed clock.
export const instanceAdvancedCronNoResults: ParityState = {
  ...instanceAdvancedCronDefault,
  id: 'cron-no-results',
  actions: {
    legacy: [...waitForCron.legacy, listSearch('no-such-job')],
    next: [...waitForCron.next, listSearch('no-such-job')],
  },
  probes: [cronProjectTitleProbe, cronProjectAddProbe, cronProjectSearchProbe, cronTableProbe, cronNoResultsProbe, advancedActiveItemProbe],
}

// Phase 14: the list request hangs (`'hold'`), so the table keeps its loading skeleton (`LogsTableSortSkeleton` and `LogsTableSkeletonItem`
// on desktop, the card skeletons below `lg`). The header's filter column is hidden while `items` is empty. The skeleton bones are masked,
// and the readiness anchor is the header title; the skeleton is awaited last, since it renders once the list request has started.
const cronSkeletonMasks = {
  legacy: [(page: Page) => page.locator('.v-main .data-table .v-skeleton-loader')],
  next: [(page: Page) => page.getByTestId('cron-table').locator('.v-skeleton-loader')],
}

const waitForCronLoading = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(cronProjectTitleProbe.legacy),
    waitFor(page => page.locator('.v-main .data-table .v-skeleton-loader').first()),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(cronProjectTitleProbe.next),
    waitFor(page => page.getByTestId('cron-table').locator('.v-skeleton-loader').first()),
  ],
}

export const instanceAdvancedCronLoading: ParityState = {
  ...instanceAdvancedCronDefault,
  id: 'cron-loading',
  handlers: cronProjectHandlers({ [PROJECT_CRON_JOBS_KEY]: 'hold' }),
  actions: waitForCronLoading,
  masks: cronSkeletonMasks,
  probes: [cronProjectTitleProbe, cronTableProbe, cronLoadingProbe, advancedActiveItemProbe],
}

// Phase 14: a valid Add is submitted while the POST hangs (`'hold'`): the modal is persistent and its submit button shows the loader (`loading`
// on the non-cancel buttons, `BasicModal`; full primary with a white loader). The loader spinner is masked; the modal
// and its submit button are probed.
function waitForSubmitLoading (next: boolean): StateAction {
  return async page => {
    await settled((next ? cronModalSubmitProbe.next(page) : cronModalSubmitProbe.legacy(page)).locator('.v-progress-circular'))
  }
}

export const instanceAdvancedCronSaveLoading: ParityState = {
  ...instanceAdvancedCronDefault,
  id: 'cron-save-loading',
  handlers: cronProjectHandlers({ [`POST ${PROJECT_CRON_JOBS_KEY.slice('GET '.length)}`]: 'hold' }),
  actions: {
    legacy: [...waitForCron.legacy, openProjectAdd(false), typeCommand(false, CRON_ADD_COMMAND), pressSubmit(false), waitForSubmitLoading(false)],
    next: [...waitForCron.next, openProjectAdd(true), typeCommand(true, CRON_ADD_COMMAND), pressSubmit(true), waitForSubmitLoading(true)],
  },
  masks: {
    legacy: [(page: Page) => cronModalSubmitProbe.legacy(page).locator('.v-progress-circular')],
    next: [(page: Page) => cronModalSubmitProbe.next(page).locator('.v-progress-circular')],
  },
  probes: [cronModalProbe, cronModalTitleProbe, cronModalSubmitProbe],
}

// Phase 15 (impl-review F3): the Add modal with the frequency select open on a standard host: eleven options, more than the menu shows at once
// (V2 `maxHeight` 304, V4 310), so the list scrolls. The `dense` menu rule of `BasicModalField` (`_inputs.scss` `.basic-modal-select-menu`)
// was first measured on the seven WP Cloud options only.
export const instanceAdvancedCronAddFrequencyMenu: ParityState = {
  ...instanceAdvancedCronDefault,
  id: 'cron-add-frequency-menu',
  actions: {
    legacy: [...waitForCron.legacy, openProjectAdd(false), openFrequencyMenu(false)],
    next: [...waitForCron.next, openProjectAdd(true), openFrequencyMenu(true)],
  },
  probes: [...cronModalProbes, cronFrequencyMenuProbe, cronFrequencyListProbe, cronFrequencyItemProbe],
}

const states: ParityState[] = [instanceAdvancedCronDefault, instanceAdvancedCronHover, instanceAdvancedCronRowHover, instanceAdvancedCronFocus, instanceAdvancedCronDisabled, instanceAdvancedCronError, instanceAdvancedCronAddModal, instanceAdvancedCronAddValidation, instanceAdvancedCronAddError, instanceAdvancedCronEditModal, instanceAdvancedCronWpCloudAddModal, instanceAdvancedCronAddFrequencyMenu, instanceAdvancedCronDeleteModal, instanceAdvancedCronEmpty, instanceAdvancedCronNoResults, instanceAdvancedCronLoading, instanceAdvancedCronSaveLoading]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
