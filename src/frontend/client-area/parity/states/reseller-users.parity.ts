import type { ParityState } from './state'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { listSearch } from './hosting'
import {
  confirmDeleteModal,
  hoverDeleteIcon,
  hoverInstancesChip,
  hoverResellerErrorAlert,
  openDeleteModal,
  resellerAlertProbe,
  resellerUsers,
  resellerUsersBodyProbes,
  resellerUsersDeleteButton,
  resellerUsersDeleteFocusProbe,
  resellerUsersDeleteOverlayProbe,
  resellerUsersDeleteTooltipProbe,
  resellerUsersEmptyDescriptionProbe,
  resellerUsersEmptyIllustrationProbe,
  resellerUsersEmptyTitleProbe,
  resellerUsersModalCloseProbe,
  resellerUsersModalProbes,
  resellerUsersModalSubmitLoadingProbe,
  resellerUsersModalSubmitProbe,
  resellerUsersNoResultsProbe,
  resellerUsersRowHoverProbe,
  resellerUsersSkeletonMasks,
  resellerUsersSkeletonProbe,
  resellerUsersState,
  resellerUsersSubmitSpinnerMasks,
  resellerUsersTitleProbe,
  resellerUsersTooltipCard,
  resellerUsersTooltipCardProbe,
  resellerUsersTooltipRowProbe,
  resellerUsersTooltipSkeletonProbe,
  resellerUsersTooltipSuspendedProbe,
  resellerUsersTooltipTitleProbe,
  submitDeleteModal,
  userInstancesHandlers,
  waitForModalSubmitLoading,
  waitForResellerUsersSkeleton,
  withoutRowProbes,
} from './reseller-users'
import { focusButton, hovered, noFocusRing } from './sftp'

// S-122 ui-reseller-users, measured on app-lite (`target: 'lite'`, M-2 default): the Reseller Area frame and the Users page.
// Each state id is a literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text.
// Builder and probes: `reseller-users.ts`. Plan: context/changes/ui-reseller-users/plan.md.

// Phase 6: the default state, the frame and the first page of the users (nine rows, name ascending).
export const resellerUsersDefault: ParityState = {
  id: 'reseller-users-default',
  ...resellerUsersState(),
}

// Phase 7: hover of the first row's Delete icon (desktop): the row background, the icon overlay and the Delete tooltip. Mobile has no
// tooltip and the card reads as the default state, so `light-mobile` is skipped.
const resellerUsersHoverBase: ParityState = {
  id: 'reseller-users-hover',
  ...resellerUsersState({ legacy: [hoverDeleteIcon(false)], next: [hoverDeleteIcon(true)] }),
}

export const resellerUsersHover: ParityState = hovered(resellerUsersHoverBase, { legacy: resellerUsersDeleteButton(false), next: resellerUsersDeleteButton(true) }, [
  resellerUsersRowHoverProbe,
  resellerUsersDeleteOverlayProbe,
  resellerUsersDeleteTooltipProbe,
])

/**
 * `base` with the pointer resting on the chip (`hoverInstancesChip` already hovers and waits for the card), asserting after the capture that the
 * card is still open. `hovered` asserts the pointer is over the chip instead, which fails on a phone: the 460 px card is fitted to the 375 px
 * viewport and covers its own activator in both apps (`elementFromPoint` returns the card).
 */
function hoveredCard (base: ParityState, probes: ParityState['probes']): ParityState {
  const stillOpen = (next: boolean) => async (page: Page) => {
    await expect(resellerUsersTooltipCard(next)(page), 'tooltip card still open after the capture').toBeVisible()
  }
  return {
    ...base,
    pointer: 'keep',
    probes: [...base.probes, ...probes],
    afterCapture: {
      legacy: [...(base.afterCapture?.legacy ?? []), stillOpen(false)],
      next: [...(base.afterCapture?.next ?? []), stillOpen(true)],
    },
  }
}

// Phase 8: hover of the first row's instances chip (bob, three projects, the second suspended): the tooltip card with its title, the first
// row and the suspended chip. The pointer rests on the chip, so `open-on-hover` keeps the card open. All three variants: the chip sits in
// the mobile card too and its menu opens there (the card is anchored to the chip's left side).
const resellerUsersTooltipBase: ParityState = {
  id: 'reseller-users-tooltip',
  ...resellerUsersState({ legacy: [hoverInstancesChip(false)], next: [hoverInstancesChip(true)] }),
}

export const resellerUsersTooltip: ParityState = hoveredCard(resellerUsersTooltipBase, [
  resellerUsersTooltipCardProbe,
  resellerUsersTooltipTitleProbe,
  resellerUsersTooltipRowProbe,
  resellerUsersTooltipSuspendedProbe,
])

// Phase 8: the same hover while `GET /reseller/users/<id>/projects` is pending (`'hold'` for every row): the card shows its five skeleton rows.
const resellerUsersTooltipLoadingBase: ParityState = {
  id: 'reseller-users-tooltip-loading',
  ...resellerUsersState({
    handlers: userInstancesHandlers(resellerUsers, 'hold'),
    legacy: [hoverInstancesChip(false, true)],
    next: [hoverInstancesChip(true, true)],
  }),
}

export const resellerUsersTooltipLoading: ParityState = hoveredCard(resellerUsersTooltipLoadingBase, [
  resellerUsersTooltipCardProbe,
  resellerUsersTooltipTitleProbe,
  resellerUsersTooltipSkeletonProbe,
])

// Phase 9: keyboard focus of the first row's Delete icon (desktop `.actions-row`, mobile card button). The icon has no accessible name in
// legacy, so it is located by the probes' selector, not `getByRole`. `focusButton` (sftp) presses Shift, then `focus()` and asserts
// `:focus-visible`; no Tab (lesson "Stan focus-visible: `buttonFocusState` nie używa Tab"). V4's ring is asserted hidden in next.
const resellerUsersFocusBase = resellerUsersState()
export const resellerUsersFocus: ParityState = {
  ...resellerUsersFocusBase,
  id: 'reseller-users-focus',
  pointer: 'keep',
  actions: {
    legacy: [...resellerUsersFocusBase.actions.legacy, focusButton(resellerUsersDeleteButton(false))],
    next: [...resellerUsersFocusBase.actions.next, focusButton(resellerUsersDeleteButton(true))],
  },
  probes: [...resellerUsersFocusBase.probes, resellerUsersDeleteFocusProbe],
  afterCapture: { legacy: [], next: [noFocusRing(resellerUsersDeleteButton(true))] },
}

// Phase 10: the delete modal of the first row, Delete disabled (no confirmation yet). The trash icon has no accessible name in legacy, so
// the click goes to the probes' selector (`resellerUsersDeleteButton`), as the focus state does. The Delete colour delta of a disabled
// button is the `ui-buttons-tokens` exception (phase 14), not a fix here.
const resellerUsersDeleteModalBase = resellerUsersState()
export const resellerUsersDeleteModal: ParityState = {
  ...resellerUsersDeleteModalBase,
  id: 'reseller-users-delete-modal',
  actions: {
    legacy: [...resellerUsersDeleteModalBase.actions.legacy, openDeleteModal(false)],
    next: [...resellerUsersDeleteModalBase.actions.next, openDeleteModal(true)],
  },
  probes: [...resellerUsersDeleteModalBase.probes, ...resellerUsersModalProbes],
}

// Phase 10: the same modal after the confirmation is ticked: Delete enabled, the checkbox checked.
const resellerUsersDeleteCheckedBase = resellerUsersState()
export const resellerUsersDeleteChecked: ParityState = {
  ...resellerUsersDeleteCheckedBase,
  id: 'reseller-users-delete-checked',
  actions: {
    legacy: [...resellerUsersDeleteCheckedBase.actions.legacy, openDeleteModal(false), confirmDeleteModal(false)],
    next: [...resellerUsersDeleteCheckedBase.actions.next, openDeleteModal(true), confirmDeleteModal(true)],
  },
  probes: [...resellerUsersDeleteCheckedBase.probes, ...resellerUsersModalProbes],
}

// Phase 11: `GET /reseller/users` answers 500. The table stays empty (no row probes), the page title is the readiness anchor and the error
// alert is hovered before the capture (the pointer stays on it). The modal's Delete request answers 500: the modal stays open, the alert shows.
const resellerUsersErrorBase = resellerUsersState({
  ready: resellerUsersTitleProbe.legacy,
  handlers: { 'GET /reseller/users': { status: 500, json: { message: 'Server Error' } } },
  legacy: [hoverResellerErrorAlert],
  next: [hoverResellerErrorAlert],
})
export const resellerUsersError: ParityState = {
  ...resellerUsersErrorBase,
  id: 'reseller-users-error',
  pointer: 'keep',
  probes: [...withoutRowProbes(resellerUsersErrorBase.probes), resellerAlertProbe],
}

const resellerUsersDeleteErrorBase = resellerUsersState({
  handlers: { [`DELETE /reseller/users/${resellerUsers[0].id}`]: { status: 500, json: { message: 'Server Error' } } },
  legacy: [openDeleteModal(false), confirmDeleteModal(false), submitDeleteModal(false), hoverResellerErrorAlert],
  next: [openDeleteModal(true), confirmDeleteModal(true), submitDeleteModal(true), hoverResellerErrorAlert],
})
export const resellerUsersDeleteError: ParityState = {
  ...resellerUsersDeleteErrorBase,
  id: 'reseller-users-delete-error',
  pointer: 'keep',
  probes: [...resellerUsersDeleteErrorBase.probes, ...resellerUsersModalProbes, resellerAlertProbe],
}

// Phase 12: no user rows. The title row is not the anchor here: the no-data copy is, and the header row is gone (both apps show it only
// with rows, `users.length`), so the row probes go with the header.
const resellerUsersEmptyBase = resellerUsersState({
  users: [],
  ready: page => page.locator('.no-data-container__title').first(),
})
export const resellerUsersEmpty: ParityState = {
  ...resellerUsersEmptyBase,
  id: 'reseller-users-empty',
  probes: [
    ...withoutRowProbes(resellerUsersEmptyBase.probes),
    resellerUsersEmptyIllustrationProbe,
    resellerUsersEmptyTitleProbe,
    resellerUsersEmptyDescriptionProbe,
  ],
}

// Phase 12: a search with no match. The users stay (the header row stays), the rows go and the no-results container shows. `listSearch`
// steps the fixed clock until the container is there (the search debounce does not fire under a frozen clock, lesson S-36).
const resellerUsersSearchEmptyBase = resellerUsersState({
  legacy: [listSearch('zzz-no-such-user')],
  next: [listSearch('zzz-no-such-user')],
})
export const resellerUsersSearchEmpty: ParityState = {
  ...resellerUsersSearchEmptyBase,
  id: 'reseller-users-search-empty',
  probes: [
    ...resellerUsersSearchEmptyBase.probes.filter(probe => !resellerUsersBodyProbes.includes(probe)),
    resellerUsersNoResultsProbe,
  ],
}

// Phase 13: `GET /reseller/users` hangs (`'hold'`), so the table keeps its skeleton (five desktop rows or five mobile cards). The header
// row is not rendered without rows, so the header probe goes with the row probes. The title is the readiness anchor.
const resellerUsersLoadingBase = resellerUsersState({
  ready: resellerUsersTitleProbe.legacy,
  handlers: { 'GET /reseller/users': 'hold' },
  legacy: [waitForResellerUsersSkeleton.legacy],
  next: [waitForResellerUsersSkeleton.next],
})
export const resellerUsersLoading: ParityState = {
  ...resellerUsersLoadingBase,
  id: 'reseller-users-loading',
  masks: resellerUsersSkeletonMasks,
  probes: [...withoutRowProbes(resellerUsersLoadingBase.probes), resellerUsersSkeletonProbe],
}

// Phase 13: the first row's deletion is submitted while `DELETE` hangs (`'hold'`): the modal stays open with the confirmation ticked, Delete
// shows its loader and the close icon is hidden (legacy `v-if="!submitting"`, next the same). The loader is masked; the modal and its
// Delete button are probed. Colour of the loading button follows the app (`ui-buttons-tokens`), not a fix here.
const resellerUsersDeleteSubmittingBase = resellerUsersState({
  handlers: { [`DELETE /reseller/users/${resellerUsers[0].id}`]: 'hold' },
  legacy: [openDeleteModal(false), confirmDeleteModal(false), submitDeleteModal(false), waitForModalSubmitLoading(false)],
  next: [openDeleteModal(true), confirmDeleteModal(true), submitDeleteModal(true), waitForModalSubmitLoading(true)],
})
export const resellerUsersDeleteSubmitting: ParityState = {
  ...resellerUsersDeleteSubmittingBase,
  id: 'reseller-users-delete-submitting',
  masks: resellerUsersSubmitSpinnerMasks,
  probes: [
    ...resellerUsersDeleteSubmittingBase.probes,
    ...resellerUsersModalProbes.filter(probe => probe !== resellerUsersModalCloseProbe && probe !== resellerUsersModalSubmitProbe),
    resellerUsersModalSubmitLoadingProbe,
  ],
}

const states: ParityState[] = [
  resellerUsersDefault,
  resellerUsersHover,
  resellerUsersTooltip,
  resellerUsersTooltipLoading,
  resellerUsersFocus,
  resellerUsersDeleteModal,
  resellerUsersDeleteChecked,
  resellerUsersError,
  resellerUsersDeleteError,
  resellerUsersEmpty,
  resellerUsersSearchEmpty,
  resellerUsersLoading,
  resellerUsersDeleteSubmitting,
]

/** Variants a state cannot be reached in: the card on mobile has no hover row and no tooltip. */
const notInVariant: Record<string, string[]> = {
  [resellerUsersHover.id]: ['light-mobile'],
}

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    test.skip(notInVariant[state.id]?.includes(testInfo.project.name) ?? false, 'the mobile card has no hover row and no tooltip')
    await runState(browser, testInfo, state)
  })
}
