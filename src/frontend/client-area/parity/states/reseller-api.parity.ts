import type { ParityState } from './state'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { resellerApiCreateFail, resellerApiCreateForm, resellerApiCreateHeld, resellerApiDateTooltip, resellerApiDefault, resellerApiDeleteChecked, resellerApiDeleteFail, resellerApiDeleteHeld, resellerApiDeleteModal, resellerApiEmpty, resellerApiError, resellerApiFocus, resellerApiHover, resellerApiLoading, resellerApiSearchEmpty, resellerApiTokenConfirmed, resellerApiTokenCopyHover, resellerApiTokenStep } from './reseller-api'

// S-126 ui-reseller-api, measured on app-lite (`target: 'lite'`, M-2 default): the Reseller Area frame and the API tokens page.
// Source of the LITE copy: `views/reseller-area/ApiTokensTable.vue`. Each state id is a literal `id: '…',` line, which `registeredStates`
// in report/write-report.ts reads as text. Builder and probes: `reseller-api.ts`. Plan: context/changes/ui-reseller-api/plan.md.

// Phase 6: the default state, the frame and the first page of the tokens (twelve rows, name ascending).
// Phase 7: hover of the first row's Delete icon, and the full-date tooltip of the created date (both desktop only).
// Phase 8: keyboard focus of the Delete icon (desktop) or the Create button (below 976 px), all three variants.
// Phase 9: the create modal, step 1 (the name typed, the X still hidden), all three variants.
// Phase 10: the create modal, step 2 (token shown with Continue disabled, the box ticked, the copy row hovered), all three variants.
// Phase 11: the delete modal (Delete disabled, then the box ticked), desktop and light-desktop only.
// Phase 12: the error states: the list request answers 500, the create request 422, the delete request 500 (the alert hovered in each).
// Phase 13: the empty states: no token (the no-data card) and a search with no match (the no-results container), all three variants.
// Phase 14: the loading states: the table while the list request hangs, the create and the delete request held (the spinner of the submit button), all three variants.
const states: ParityState[] = [
  resellerApiDefault,
  resellerApiHover,
  resellerApiDateTooltip,
  resellerApiFocus,
  resellerApiCreateForm,
  resellerApiTokenStep,
  resellerApiTokenConfirmed,
  resellerApiTokenCopyHover,
  resellerApiDeleteModal,
  resellerApiDeleteChecked,
  resellerApiError,
  resellerApiCreateFail,
  resellerApiDeleteFail,
  resellerApiEmpty,
  resellerApiSearchEmpty,
  resellerApiLoading,
  resellerApiCreateHeld,
  resellerApiDeleteHeld,
]

/**
 * Variants a state cannot be reached in: the mobile card has no hover row, no Delete tooltip and no created-date tooltip. The delete modal
 * is not opened from the mobile card (legacy D1).
 */
const notInVariant: Record<string, string[]> = {
  [resellerApiHover.id]: ['light-mobile'],
  [resellerApiDateTooltip.id]: ['light-mobile'],
  [resellerApiDeleteModal.id]: ['light-mobile'],
  [resellerApiDeleteChecked.id]: ['light-mobile'],
  [resellerApiDeleteFail.id]: ['light-mobile'],
  [resellerApiDeleteHeld.id]: ['light-mobile'],
}

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    test.skip(notInVariant[state.id]?.includes(testInfo.project.name) ?? false, 'not reachable in this variant')
    await runState(browser, testInfo, state)
  })
}
