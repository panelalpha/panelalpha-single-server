import type { ParityState, Probe, StateAction, Variant } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { alertManagerProbe, waitFor } from './hosting'
import { ENV_FILE_EMPTY, ENV_META_ERROR, ENV_META_WORDPRESS, ENV_MULTILINE_FILE, ENV_PROJECT_ID, ENV_SAVE_FAILURE, envAddModalProbes, envAddOverlayProbe, envAddProbe, envDefaultProbes, envDeleteModalProbes, envDialog, envEditModalProbes, envEditOverlayProbe, envEditTooltipProbe, envEmptyProbes, envErrorAlert, envErrorAlertProbes, envFooterProbe, envFrameProbes, envHandlers, envImportButton, envImportErrorProbe, envImportModalProbes, envImportOverlayProbe, envImportProbe, envKeyErrorProbe, envNoResultsClearProbe, envNoResultsProbe, envRevealedProbes, envSearchProbe, envSkeletonMasks, envSortHeaderProbe, envTableProbe, envWordpressCardProbe, envWordpressInstance, envWordpressTextProbe, expectDeleteDisabled, fillAddModal, importModalButton, openAddModal, openDeleteModal, openEditModal, openImportModal, saveModalButton, searchEnvNothing, waitForEmpty, waitForRows, waitForSkeleton, waitForWordpressCard } from './instance-env-vars'
import { isDesktopViewport, liteShellHome } from './instances'
import { focusButton, noFocusRing } from './sftp'
import { NOW } from './shell'

// ui-instance-env-vars (S-129): the Env file page of a project inside the Advanced frame, measured on app-lite (`target: 'lite'`, M-2
// default; the page is lite-only). Each state id is a literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads
// as text. Builder and probes: `instance-env-vars.ts`. Plan: context/changes/ui-instance-env-vars/plan.md.

const path = `/projects/${ENV_PROJECT_ID}/advanced/env-file`

// The project frame without the `admin` key (as `instance-ftp`, `instance-users`): the style manager does not widen the shot.
const { admin: _styleManagerAdmin, ...ENV_HOME } = liteShellHome()

/** A state of this page: the shared frame (single-server `/home` without `admin`, clock, signed in) plus what differs. */
function envState (rest: Pick<ParityState, 'id' | 'actions' | 'probes'> & Partial<ParityState>): ParityState {
  return { target: 'lite', path, signedIn: true, clock: NOW, home: ENV_HOME, handlers: envHandlers(), ...rest }
}

// Phase 4: the table of a seven-variable file (six values and one empty, `---`), search and Import / Add above it.
export const instanceEnvVarsDefault: ParityState = envState({
  id: 'instance-env-vars-default',
  actions: { legacy: [waitForRows], next: [waitForRows] },
  probes: envDefaultProbes,
})

// Phase 6: the meta request is held, so the table keeps its skeleton. No file is read yet, and the header has no Import, Add or search (legacy
// `v-if="items.length"`). The skeleton is masked; the readiness anchor is the skeleton itself.
export const instanceEnvVarsLoading: ParityState = envState({
  id: 'instance-env-vars-loading',
  handlers: envHandlers({ [`GET /server-accounts/1/projects/${ENV_PROJECT_ID}/env-file/meta`]: 'hold' }),
  actions: waitForSkeleton,
  masks: envSkeletonMasks,
  probes: [...envFrameProbes, envTableProbe],
})

// Phase 7: an empty file (`contents: ''`). The table shows its `no-data` slot: the illustration, title, description and Import + Add in the
// action slot (legacy `EF:96-141`). The header has no Import, Add or search (legacy `v-if="items.length"`).
export const instanceEnvVarsEmpty: ParityState = envState({
  id: 'instance-env-vars-empty',
  handlers: envHandlers({ [`GET /server-accounts/1/projects/${ENV_PROJECT_ID}/env-file`]: ENV_FILE_EMPTY }),
  actions: waitForEmpty,
  probes: envEmptyProbes,
})

// Phase 8: the meta request fails with a 500. Legacy `EF:344-348`: the alert `loadError + message`, the page stays empty and never reads the
// file. The table shows its empty state (`items` is empty and not loading), so the empty-state probes stay; the alert is the extra probe.
export const instanceEnvVarsError: ParityState = envState({
  id: 'instance-env-vars-error',
  handlers: envHandlers({ [`GET /server-accounts/1/projects/${ENV_PROJECT_ID}/env-file/meta`]: ENV_META_ERROR }),
  actions: waitForEmpty,
  probes: [...envEmptyProbes, alertManagerProbe],
})

type Target = (page: Page) => Locator

/**
 * `base` with the pointer resting on the element of `target` (transitions are frozen, so the hover is final). The pattern of `hovered` in
 * `instance-advanced-cron.parity.ts` (not exported there). The pointer stays where the action left it and is asserted after the capture.
 */
function hovered (base: ParityState, id: string, target: { legacy: Target, next: Target }, probes: Probe[], hover: { legacy: StateAction, next: StateAction }): ParityState {
  const stillHovered = (locate: Target): StateAction => async page => {
    const element = locate(page)
    if (await element.count() === 0) {
      return
    }
    // The header's buttons overflow the 375 px phone viewport in legacy (the page is 467 px wide) and the scroll reset after `hover()` moves
    // them off-screen (as `focusHover` in sftp.ts): on a phone the state then reads as the default one.
    const phone = (page.viewportSize()?.width ?? 1440) < 768
    const isHovered = await element.evaluate(node => node.matches(':hover'))
    expect(isHovered || phone, 'pointer on the element after the capture').toBe(true)
  }
  return {
    ...base,
    id,
    pointer: 'keep',
    actions: { legacy: [...base.actions.legacy, hover.legacy], next: [...base.actions.next, hover.next] },
    probes: [...base.probes, ...probes],
    afterCapture: {
      legacy: [...(base.afterCapture?.legacy ?? []), stillHovered(target.legacy)],
      next: [...(base.afterCapture?.next ?? []), stillHovered(target.next)],
    },
  }
}

/** Hovers `locate` and waits until the pointer is on it (the plain hover of a state without a tooltip). */
function hoverPlain (locate: Target): StateAction {
  return async page => {
    const element = locate(page)
    if (await element.count() === 0) {
      return
    }
    await element.hover()
    await expect.poll(() => element.evaluate(node => node.matches(':hover'))).toBe(true)
  }
}

/** The Edit icon of the first row: desktop `.actions-row`, mobile the last row of the card (the same locator both apps, by table test id). */
function rowEditButton (next: boolean): Target {
  return page => {
    const rows = (next ? page.getByTestId('env-vars-table') : page.locator('.data-table')).locator('tbody tr')
    return rows.first().locator('.actions-row .v-btn, .mobile-table-item__row:last-child .v-btn').first()
  }
}

/**
 * Hovers the first row's Edit icon and waits for its tooltip (`open-delay 150`). The row can reflow once the pointer lands and close the
 * tooltip, so the pointer leaves and comes back until it shows (the pattern of `hoverUntilTooltip` in `databases.ts`). Mobile: plain hover.
 */
function hoverRowEdit (next: boolean): StateAction {
  return async page => {
    const element = rowEditButton(next)(page)
    if (await element.count() === 0) {
      return
    }
    if (!isDesktopViewport(page)) {
      await hoverPlain(rowEditButton(next))(page)
      return
    }
    const tooltip = next ? envEditTooltipProbe.next : envEditTooltipProbe.legacy
    await expect(async () => {
      await page.mouse.move(0, 0)
      await element.hover()
      await expect(tooltip(page)).toBeVisible({ timeout: 2500 })
    }).toPass({ timeout: 15_000 })
  }
}

// Phase 9: hover of the header's Add button (icon-only on mobile, located by its class, as `envAddProbe`). The overlay is the probe; the
// pointer rests on Add until the capture.
export const instanceEnvVarsHover: ParityState = hovered(
  instanceEnvVarsDefault,
  'instance-env-vars-hover',
  { legacy: envAddProbe.legacy, next: envAddProbe.next },
  [envAddOverlayProbe],
  { legacy: hoverPlain(envAddProbe.legacy), next: hoverPlain(envAddProbe.next) },
)

// Phase 9: hover of the first row's Edit icon. Desktop waits for the Edit tooltip and probes its text and the icon overlay; mobile has
// neither (the card has no tooltip), so it is the plain hover and the default probes stay.
export const instanceEnvVarsRowHover: ParityState = hovered(
  instanceEnvVarsDefault,
  'instance-env-vars-row-hover',
  { legacy: rowEditButton(false), next: rowEditButton(true) },
  [envEditOverlayProbe, envEditTooltipProbe],
  { legacy: hoverRowEdit(false), next: hoverRowEdit(true) },
)

// Phase 10: keyboard focus of the header's Import button, as `buttonFocusState` in auth.ts (Shift, `focus()`, no Tab) but located by its
// class (`focusButton` in sftp.ts): on mobile the button is icon-only. The overlay is the probe; the V4 ring is asserted hidden in next.
export const instanceEnvVarsFocus: ParityState = {
  ...instanceEnvVarsDefault,
  id: 'instance-env-vars-focus',
  pointer: 'keep',
  actions: { legacy: [...instanceEnvVarsDefault.actions.legacy, focusButton(envImportButton)], next: [...instanceEnvVarsDefault.actions.next, focusButton(envImportButton)] },
  probes: [...instanceEnvVarsDefault.probes, envImportOverlayProbe],
  afterCapture: { legacy: [], next: [noFocusRing(envImportButton)] },
}

// Phase 11: the first row's eye is pressed: its value shows and the eye carries `$eyeclosed`. The file ends with a multi-line quoted value
// (`ENV_MULTILINE_FILE`), a readonly row with an empty actions cell. The eye is the second cell of the desktop row; on mobile it is the
// value line of the first card (the same `.v-btn`, located by the mobile item row).
const firstEye: Target = page => isDesktopViewport(page)
  ? page.locator('.env-value .v-btn').first()
  : page.locator('.mobile-table-item__row').nth(1).locator('.v-btn').first()

const revealFirstValue: StateAction = async page => {
  await firstEye(page).click()
  await expect(page.locator('.env-value__text').first()).toHaveText('Studio')
}

export const instanceEnvVarsRevealed: ParityState = {
  ...instanceEnvVarsDefault,
  id: 'instance-env-vars-revealed',
  handlers: envHandlers({ [`GET /server-accounts/1/projects/${ENV_PROJECT_ID}/env-file`]: ENV_MULTILINE_FILE }),
  actions: { legacy: [...instanceEnvVarsDefault.actions.legacy, revealFirstValue], next: [...instanceEnvVarsDefault.actions.next, revealFirstValue] },
  probes: envRevealedProbes,
}

// Phase 12: a phrase no key matches. The table keeps its header (search, Import, Add, sort row) and footer, and shows the no-results container
// with Clear filter in place of the rows. The rows probes do not apply (there are no rows).
export const instanceEnvVarsNoResults: ParityState = {
  ...instanceEnvVarsDefault,
  id: 'instance-env-vars-no-results',
  actions: { legacy: [...instanceEnvVarsDefault.actions.legacy, searchEnvNothing], next: [...instanceEnvVarsDefault.actions.next, searchEnvNothing] },
  probes: [...envFrameProbes, envSearchProbe, envImportProbe, envAddProbe, envSortHeaderProbe, envNoResultsProbe, envNoResultsClearProbe, envFooterProbe],
}

// Mobile only: a full-page capture (2.4k px) behind a dialog is not byte-stable in legacy (blurred scrim, ~40 px differ between two shots,
// `screenshot not stable after 12 attempts`); the dialog covers the viewport, so the viewport holds the whole measured state.
const mobileViewportOnly = (variant: Variant): boolean => variant.name.endsWith('mobile')

// Phase 13: the Add modal opened from the header's Add button. The fields are the key and the value; with `supports_restart` (`ENV_META`)
// the form adds the restart checkbox. The page behind the dialog is the default state.
export const instanceEnvVarsAddModal: ParityState = {
  ...instanceEnvVarsDefault,
  id: 'instance-env-vars-add-modal',
  viewportOnly: mobileViewportOnly,
  actions: { legacy: [...instanceEnvVarsDefault.actions.legacy, openAddModal('legacy')], next: [...instanceEnvVarsDefault.actions.next, openAddModal('next')] },
  probes: envAddModalProbes,
}

// Phase 13: Save on a key that is not a valid env name (`1BAD`): the form rejects it under the key field (`validation.key`), no PUT is sent.
function keyErrorShown (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await expect(envDialog(page, app).locator('.v-messages__message').first()).toBeVisible({ timeout: 10_000 })
    // The message shows before the form sets `submitting` back to false: wait for Save to leave the loading / disabled fade, or the shot catches it half way.
    await expect(envDialog(page, app).locator('.v-btn--loading, .v-btn--disabled')).toHaveCount(0, { timeout: 10_000 })
    // Its fade-back is a CSS transition the frozen clock can leave half way: wait for the running ones.
    await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))).then(() => undefined))
  }
}

export const instanceEnvVarsAddModalError: ParityState = {
  ...instanceEnvVarsDefault,
  id: 'instance-env-vars-add-modal-error',
  viewportOnly: mobileViewportOnly,
  actions: {
    legacy: [...instanceEnvVarsDefault.actions.legacy, openAddModal('legacy'), fillAddModal('1BAD', '').legacy, saveModalButton('legacy'), keyErrorShown('legacy')],
    next: [...instanceEnvVarsDefault.actions.next, openAddModal('next'), fillAddModal('1BAD', '').next, saveModalButton('next'), keyErrorShown('next')],
  },
  probes: [...envAddModalProbes, envKeyErrorProbe],
}

// Phase 14: the Edit modal of the first row (`APP_ENV`, `production`): the key and value fields filled from the row, the restart checkbox with
// `supports_restart`. The page behind the dialog is the default state.
export const instanceEnvVarsEditModal: ParityState = {
  ...instanceEnvVarsDefault,
  id: 'instance-env-vars-edit-modal',
  viewportOnly: mobileViewportOnly,
  actions: { legacy: [...instanceEnvVarsDefault.actions.legacy, openEditModal('legacy')], next: [...instanceEnvVarsDefault.actions.next, openEditModal('next')] },
  probes: envEditModalProbes,
}

// Phase 15: the Delete modal of the first row (`APP_ENV`): the message with the key, the confirm checkbox unticked, and Delete disabled behind it
// (the disabled colour is the open exception of the phase: `ui-buttons-tokens`, rule 3 of AGENTS.md). The page behind the dialog is the default.
export const instanceEnvVarsDisabled: ParityState = {
  ...instanceEnvVarsDefault,
  id: 'instance-env-vars-disabled',
  viewportOnly: mobileViewportOnly,
  actions: {
    legacy: [...instanceEnvVarsDefault.actions.legacy, openDeleteModal('legacy'), expectDeleteDisabled('legacy')],
    next: [...instanceEnvVarsDefault.actions.next, openDeleteModal('next'), expectDeleteDisabled('next')],
  },
  probes: envDeleteModalProbes,
}

// Phase 16: the Import modal of the header, on the default page. The page behind the dialog is the default state.
export const instanceEnvVarsImportModal: ParityState = {
  ...instanceEnvVarsDefault,
  id: 'instance-env-vars-import-modal',
  viewportOnly: mobileViewportOnly,
  actions: { legacy: [...instanceEnvVarsDefault.actions.legacy, openImportModal('legacy')], next: [...instanceEnvVarsDefault.actions.next, openImportModal('next')] },
  probes: envImportModalProbes,
}

// Phase 16: Import on an empty paste: the form rejects it under the textarea and no PUT is sent (`importEmpty`, or the required rule first).
export const instanceEnvVarsImportModalError: ParityState = {
  ...instanceEnvVarsDefault,
  id: 'instance-env-vars-import-modal-error',
  viewportOnly: mobileViewportOnly,
  actions: {
    legacy: [...instanceEnvVarsDefault.actions.legacy, openImportModal('legacy'), importModalButton('legacy'), keyErrorShown('legacy')],
    next: [...instanceEnvVarsDefault.actions.next, openImportModal('next'), importModalButton('next'), keyErrorShown('next')],
  },
  probes: [...envImportModalProbes, envImportErrorProbe],
}

// Phase 17: Add with a valid key and value, the PUT refused (`ENV_SAVE_FAILURE`, 500). The dialog stays open with its values; the error alert
// shows `saveError` with the message. The alert is the extra probe; the page behind the dialog is the default state.
export const instanceEnvVarsSaveError: ParityState = {
  ...instanceEnvVarsDefault,
  id: 'instance-env-vars-save-error',
  viewportOnly: mobileViewportOnly,
  handlers: envHandlers(ENV_SAVE_FAILURE),
  actions: {
    legacy: [...instanceEnvVarsDefault.actions.legacy, openAddModal('legacy'), fillAddModal('APP_NEW', 'x').legacy, saveModalButton('legacy'), waitFor(envErrorAlert)],
    next: [...instanceEnvVarsDefault.actions.next, openAddModal('next'), fillAddModal('APP_NEW', 'x').next, saveModalButton('next'), waitFor(envErrorAlert)],
  },
  afterCapture: {
    legacy: [async page => {
      await expect(envErrorAlert(page), 'Harness error: legacy error alert closed during capture').toBeVisible()
    }],
    next: [async page => {
      await expect(envErrorAlert(page), 'Harness error: next error alert closed during capture').toBeVisible()
    }],
  },
  probes: [...envAddModalProbes, ...envErrorAlertProbes],
}

// Phase 18: a WordPress project opened by its direct link. The meta says `wordpress`, so the page shows the notice card and never reads the file:
// no table, no header controls (legacy `v-if="items.length"`). The card and its text are the probes; the frame is the same as the other states.
export const instanceEnvVarsWordpress: ParityState = envState({
  id: 'instance-env-vars-wordpress',
  handlers: envHandlers({ [`GET /server-accounts/1/projects/${ENV_PROJECT_ID}/env-file/meta`]: { json: ENV_META_WORDPRESS } }, envWordpressInstance),
  actions: waitForWordpressCard,
  probes: [...envFrameProbes, envWordpressCardProbe, envWordpressTextProbe],
})

const states: ParityState[] = [
  instanceEnvVarsDefault,
  instanceEnvVarsLoading,
  instanceEnvVarsEmpty,
  instanceEnvVarsError,
  instanceEnvVarsHover,
  instanceEnvVarsRowHover,
  instanceEnvVarsFocus,
  instanceEnvVarsRevealed,
  instanceEnvVarsNoResults,
  instanceEnvVarsAddModal,
  instanceEnvVarsAddModalError,
  instanceEnvVarsEditModal,
  instanceEnvVarsDisabled,
  instanceEnvVarsImportModal,
  instanceEnvVarsImportModalError,
  instanceEnvVarsSaveError,
  instanceEnvVarsWordpress,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
