import type { ParityState } from './state'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { INSTANCE_PAGE_DNS } from './instance'
import { ADVANCED_PROJECT_ID } from './instance-advanced-frame'
import { actionDialogProbes, addNewFocusOverlayProbe, addNewOverlayProbe, addNewStillFocused, addNewStillHovered, focusAddNew, hoverAddNew, openReadMore, readMoreProbes } from './instance-plugins'
import { addBackProbe, addEmptyAnchor, addFeaturedAnchor, addLoadingAnchor, addResultsAnchor, addResultsCardProbe, addResultsFooterProbe, addSearchProbe, addTableAnchor, addTableProbes, DELETE_THEME_MESSAGE, featuredCardProbe, featuredImageProbe, featuredLabelProbe, featuredStarProbe, openAddNew, openThemeCardAction, openThemeInstall, selectThemes, switchAddToTable, switchToTable, tableRowAnchor, themeActivateModalProbes, themeDeleteConfirmProbe, themeDeleteDisabledCheck, themeInstallModalProbes, THEMES_HOME, themesActivateModalActions, themesActivateRefusedHandler, themesAddEmptyProbes, themesAddLoadingProbes, themesAlertStillOpen, themesCardActivateProbe, themesCardDeleteProbe, themesCardDisabled, themesCardHover, themesCardHoverProbes, themesCardsAnchor, themesCardSkeletonProbe, themesCardStillHovered, themesEmptyAnchor, themesEmptyHandler, themesEmptyProbes, themesErrorProbes, themesHandlers, themesInstallErrorActions, themesInstallRefusedHandler, themesList, themesListSearch, themesLoadingHandler, themesLoadingProbes, themesNoHitTerm, themesProbes, themesRefusedActions, themesSearchEmptyProbes, themesSelectionProbes, themesSkeletonAnchor, themesSnackbarRowActions, themesTableActiveDeleteProbe, themesTableDisabled, themesTablePlainUpdateProbe, themesTableProbe, themesTableProbes, themesTableSkeletonRowProbe, themesTitleProbe, typeAddSearch, UPDATE_THEME_MESSAGE } from './instance-themes'
import { NOW } from './shell'

// S-90 ui-instance-themes: the Themes screen of a project on app-lite (`/projects/:id/advanced/themes`, `target: 'lite'`, M-2 default). Each
// state id is a literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text. Builder and probes:
// `instance-themes.ts`. Plan: context/changes/ui-instance-themes/plan.md ("Stany parity").

// Phase 6: the default state, the first page of the installed themes (6 of 8) with the pagination footer, inside the Advanced frame.
export const instanceThemesDefault: ParityState = {
  id: 'instance-themes-default',
  target: 'lite',
  path: `/projects/${ADVANCED_PROJECT_ID}/advanced/themes`,
  signedIn: true,
  clock: NOW,
  home: THEMES_HOME,
  handlers: themesHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: themesCardsAnchor,
  probes: themesProbes,
}

// Phase 7: the table view (desktop only: on mobile the switch is hidden and the rows are cards). The state starts from the default one.
export const instanceThemesTable: ParityState = {
  ...instanceThemesDefault,
  id: 'instance-themes-table',
  actions: {
    legacy: [...themesCardsAnchor.legacy, switchToTable.legacy, tableRowAnchor.legacy],
    next: [...themesCardsAnchor.next, switchToTable.next, tableRowAnchor.next],
  },
  probes: themesTableProbes,
}

// Phase 8: hover of "Add New" (`hoverAddNew` of Plugins: the visible `.add-new-button`, since the shell bar has a button with the same name) and
// hover of the second card (its overlay with "Use theme" and "Preview"). Both are desktop only: the mobile "Add New" is icon-only and the cards
// have no hover on mobile.
export const instanceThemesHover: ParityState = {
  ...instanceThemesDefault,
  id: 'instance-themes-hover',
  pointer: 'keep',
  actions: {
    legacy: [...instanceThemesDefault.actions.legacy, hoverAddNew.legacy],
    next: [...instanceThemesDefault.actions.next, hoverAddNew.next],
  },
  probes: [...instanceThemesDefault.probes, addNewOverlayProbe],
  afterCapture: { legacy: [addNewStillHovered.legacy], next: [addNewStillHovered.next] },
}

export const instanceThemesCardHover: ParityState = {
  ...instanceThemesDefault,
  id: 'instance-themes-card-hover',
  pointer: 'keep',
  actions: {
    legacy: [...themesCardsAnchor.legacy, themesCardHover.legacy],
    next: [...themesCardsAnchor.next, themesCardHover.next],
  },
  probes: [...themesProbes, ...themesCardHoverProbes],
  afterCapture: { legacy: [themesCardStillHovered.legacy], next: [themesCardStillHovered.next] },
}

// Phase 9: keyboard focus on "Add New" reached with real `Tab` presses (`themesFocusBase`, the `buttonFocusState` probes). Desktop only: the
// mobile "Add New" is icon-only, so its name lookup fails. "Read more" is not focusable in LITE (`<a>` without `href`): see `attempts.md`.
export const instanceThemesFocus: ParityState = {
  ...instanceThemesDefault,
  id: 'instance-themes-focus',
  pointer: 'keep',
  actions: {
    legacy: [...instanceThemesDefault.actions.legacy, focusAddNew.legacy],
    next: [...instanceThemesDefault.actions.next, focusAddNew.next],
  },
  probes: [...instanceThemesDefault.probes, addNewFocusOverlayProbe],
  afterCapture: { legacy: [addNewStillFocused.legacy], next: [addNewStillFocused.next] },
}

// Phase 10: the disabled states. `default` already holds the active card (Activate and Delete disabled); the table state adds a row without
// an update (Update disabled) and checks the active row's Delete. The table one is desktop only, like the table.
export const instanceThemesDisabled: ParityState = {
  ...instanceThemesDefault,
  id: 'instance-themes-disabled',
  probes: [...themesProbes, themesCardActivateProbe, themesCardDeleteProbe],
  afterCapture: { legacy: [themesCardDisabled.legacy], next: [themesCardDisabled.next] },
}

export const instanceThemesTableDisabled: ParityState = {
  ...instanceThemesTable,
  id: 'instance-themes-table-disabled',
  probes: [...themesTableProbes, themesTablePlainUpdateProbe, themesTableActiveDeleteProbe],
  afterCapture: { legacy: [themesTableDisabled.legacy], next: [themesTableDisabled.next] },
}

// Phase 11: the activation dialog of "GeneratePress" (opened from its card's Activate button), and the refused activation: the PUT answers 422,
// the dialog closes and the error alert shows the message. The alert closes itself after 5 s, so the pointer rests on it while the shot is taken.
export const instanceThemesActivateModal: ParityState = {
  ...instanceThemesDefault,
  id: 'instance-themes-activate-modal',
  actions: {
    legacy: [...instanceThemesDefault.actions.legacy, ...themesActivateModalActions.legacy],
    next: [...instanceThemesDefault.actions.next, ...themesActivateModalActions.next],
  },
  probes: [...themesProbes, ...themeActivateModalProbes],
}

export const instanceThemesError: ParityState = {
  ...instanceThemesDefault,
  id: 'instance-themes-error',
  handlers: themesHandlers(themesActivateRefusedHandler),
  pointer: 'keep',
  actions: {
    legacy: [...instanceThemesDefault.actions.legacy, ...themesRefusedActions.legacy],
    next: [...instanceThemesDefault.actions.next, ...themesRefusedActions.next],
  },
  afterCapture: {
    legacy: [themesAlertStillOpen.legacy],
    next: [themesAlertStillOpen.next],
  },
  probes: [...themesProbes, ...themesErrorProbes],
}

// Phase 12: the empty list (`GET …/wordpress/themes` -> `[]`): the empty block replaces the page title and the cards, so the readiness anchor
// is the `.no-data` block. The shell and the frame answer as in `default`.
export const instanceThemesEmpty: ParityState = {
  ...instanceThemesDefault,
  id: 'instance-themes-empty',
  handlers: themesHandlers({ [`GET /projects/${ADVANCED_PROJECT_ID}/wordpress/themes`]: themesEmptyHandler }),
  actions: themesEmptyAnchor,
  probes: themesEmptyProbes,
}

// Phase 12: a search with no hit on the installed list. `clock: undefined`: the search runs its own fixed-time steps (`listSearch`, 300 ms
// debounce in the app), so the default fixed clock is not set before the page loads.
export const instanceThemesSearchEmpty: ParityState = {
  ...instanceThemesDefault,
  id: 'instance-themes-search-empty',
  clock: undefined,
  actions: {
    legacy: [...themesCardsAnchor.legacy, themesListSearch(themesNoHitTerm)],
    next: [...themesCardsAnchor.next, themesListSearch(themesNoHitTerm)],
  },
  probes: themesSearchEmptyProbes,
}

// Phase 13: the first load pending (`GET …/wordpress/themes` holds): the six card skeletons, no list and no footer. Shown on all variants.
export const instanceThemesLoading: ParityState = {
  ...instanceThemesDefault,
  id: 'instance-themes-loading',
  handlers: themesHandlers({ [`GET /projects/${ADVANCED_PROJECT_ID}/wordpress/themes`]: themesLoadingHandler }),
  actions: themesSkeletonAnchor,
  probes: [...themesLoadingProbes, themesCardSkeletonProbe],
}

// Phase 13: the table view switched on while the list is pending: the table keeps its card, the sort skeleton and the skeleton rows.
// Desktop only, like the table (the switch is hidden on mobile). The card skeletons show first, so the switch is clicked after them.
export const instanceThemesTableLoading: ParityState = {
  ...instanceThemesLoading,
  id: 'instance-themes-table-loading',
  actions: {
    legacy: [...themesSkeletonAnchor.legacy, switchToTable.legacy, tableRowAnchor.legacy],
    next: [...themesSkeletonAnchor.next, switchToTable.next, tableRowAnchor.next],
  },
  probes: [...themesLoadingProbes, themesTableProbe, themesTableSkeletonRowProbe],
}

// Phase 14: the selection. Two cards checked by a click on their checkboxes (`selectThemes`); the bar shows the count and the mass actions.
// The row counts are checked before the capture (desktop only, `themesSnackbarRowActions`). Shown on all variants, like the Plugins state.
export const instanceThemesSelected: ParityState = {
  ...instanceThemesDefault,
  id: 'instance-themes-selected',
  actions: {
    legacy: [...themesCardsAnchor.legacy, selectThemes.legacy, themesSnackbarRowActions],
    next: [...themesCardsAnchor.next, selectThemes.next, themesSnackbarRowActions],
  },
  probes: [...themesProbes, ...themesSelectionProbes],
}

// Phase 15: Add New, the featured list (`GET …/new/featured`, six entries). Opening Add New clears the term and loads the list; the first card
// carries the ribbon and the star. The table is not measured here (phase 16). Shown on all variants; the mobile button is icon-only but clickable.
export const instanceThemesAddFeatured: ParityState = {
  ...instanceThemesDefault,
  id: 'instance-themes-add-featured',
  actions: {
    legacy: [...instanceThemesDefault.actions.legacy, openAddNew.legacy, ...addFeaturedAnchor.legacy],
    next: [...instanceThemesDefault.actions.next, openAddNew.next, ...addFeaturedAnchor.next],
  },
  probes: [themesTitleProbe, addBackProbe, addSearchProbe, featuredCardProbe, featuredLabelProbe, featuredStarProbe, featuredImageProbe],
}

// Phase 15: an empty featured list (`[]`): the empty card with its illustration and the "Back" button.
export const instanceThemesAddEmpty: ParityState = {
  ...instanceThemesDefault,
  id: 'instance-themes-add-empty',
  handlers: themesHandlers({ [`GET /projects/${ADVANCED_PROJECT_ID}/wordpress/themes/new/featured`]: themesList([]) }),
  actions: {
    legacy: [...instanceThemesDefault.actions.legacy, openAddNew.legacy, ...addEmptyAnchor.legacy],
    next: [...instanceThemesDefault.actions.next, openAddNew.next, ...addEmptyAnchor.next],
  },
  probes: themesAddEmptyProbes,
}

// Phase 15: the featured list stays pending (`'hold'`). Both apps show the empty card while the catalogue is empty (no skeletons; see
// `addLoadingAnchor`), so the state measures that view until the answer.
export const instanceThemesAddLoading: ParityState = {
  ...instanceThemesDefault,
  id: 'instance-themes-add-loading',
  handlers: themesHandlers({ [`GET /projects/${ADVANCED_PROJECT_ID}/wordpress/themes/new/featured`]: 'hold' }),
  actions: {
    legacy: [...instanceThemesDefault.actions.legacy, openAddNew.legacy, ...addLoadingAnchor.legacy],
    next: [...instanceThemesDefault.actions.next, openAddNew.next, ...addLoadingAnchor.next],
  },
  probes: themesAddLoadingProbes,
}

// Phase 16: Add New search. The term "blog" goes into the field (`GET …/new/search/blog`), the grid shows "Blog Theme" without a ribbon. Shown on
// all variants; the search field and the Add New button are visible on mobile too.
export const instanceThemesAddResults: ParityState = {
  ...instanceThemesDefault,
  id: 'instance-themes-add-results',
  clock: undefined,
  actions: {
    legacy: [...instanceThemesDefault.actions.legacy, openAddNew.legacy, typeAddSearch.legacy, ...addResultsAnchor.legacy],
    next: [...instanceThemesDefault.actions.next, openAddNew.next, typeAddSearch.next, ...addResultsAnchor.next],
  },
  probes: [themesTitleProbe, addBackProbe, addSearchProbe, addResultsCardProbe, addResultsFooterProbe],
}

// Phase 16: the same search results in the table (desktop only): the list button of the Add New title row, then the "Blog Theme" row.
export const instanceThemesAddTable: ParityState = {
  ...instanceThemesDefault,
  id: 'instance-themes-add-table',
  clock: undefined,
  actions: {
    legacy: [...instanceThemesDefault.actions.legacy, openAddNew.legacy, typeAddSearch.legacy, ...addResultsAnchor.legacy, switchAddToTable.legacy, ...addTableAnchor.legacy],
    next: [...instanceThemesDefault.actions.next, openAddNew.next, typeAddSearch.next, ...addResultsAnchor.next, switchAddToTable.next, ...addTableAnchor.next],
  },
  probes: addTableProbes,
}

// Phase 17: the install dialog of "Featured Theme 1" (Add New, featured grid), opened from the card's install button. Shown on all variants.
export const instanceThemesInstallModal: ParityState = {
  ...instanceThemesDefault,
  id: 'instance-themes-install-modal',
  actions: {
    legacy: [...instanceThemesDefault.actions.legacy, openAddNew.legacy, ...addFeaturedAnchor.legacy, openThemeInstall.legacy],
    next: [...instanceThemesDefault.actions.next, openAddNew.next, ...addFeaturedAnchor.next, openThemeInstall.next],
  },
  probes: [themesTitleProbe, ...themeInstallModalProbes],
}

// Phase 17: the install request answers 500: the dialog closes (legacy `finally`, next `ctx.close()`) and the error alert shows the message.
export const instanceThemesInstallError: ParityState = {
  ...instanceThemesDefault,
  id: 'instance-themes-install-error',
  handlers: themesHandlers(themesInstallRefusedHandler),
  pointer: 'keep',
  actions: {
    legacy: [...instanceThemesDefault.actions.legacy, ...themesInstallErrorActions.legacy],
    next: [...instanceThemesDefault.actions.next, ...themesInstallErrorActions.next],
  },
  afterCapture: {
    legacy: [themesAlertStillOpen.legacy],
    next: [themesAlertStillOpen.next],
  },
  probes: [themesTitleProbe, ...themesErrorProbes],
}

// Phase 18: the update dialog of "Astra" (the card with an update: its Update button is shown, `ThemeCard.vue`). Shown on all variants.
export const instanceThemesUpdateModal: ParityState = {
  ...instanceThemesDefault,
  id: 'instance-themes-update-modal',
  actions: {
    legacy: [...instanceThemesDefault.actions.legacy, openThemeCardAction('Astra', 'Update', UPDATE_THEME_MESSAGE).legacy],
    next: [...instanceThemesDefault.actions.next, openThemeCardAction('Astra', 'Update', UPDATE_THEME_MESSAGE).next],
  },
  probes: [...themesProbes, ...actionDialogProbes(UPDATE_THEME_MESSAGE, 'Update')],
}

// Phase 18: the delete dialog of the inactive "GeneratePress" (Remove is enabled there). The Delete button is disabled until the confirm
// checkbox is ticked, so the state measures the disabled button after the capture. Shown on all variants.
export const instanceThemesDeleteModal: ParityState = {
  ...instanceThemesDefault,
  id: 'instance-themes-delete-modal',
  actions: {
    legacy: [...instanceThemesDefault.actions.legacy, openThemeCardAction('GeneratePress', 'Remove', DELETE_THEME_MESSAGE).legacy],
    next: [...instanceThemesDefault.actions.next, openThemeCardAction('GeneratePress', 'Remove', DELETE_THEME_MESSAGE).next],
  },
  probes: [...themesProbes, ...actionDialogProbes(DELETE_THEME_MESSAGE, 'Delete'), themeDeleteConfirmProbe],
  afterCapture: {
    legacy: [themeDeleteDisabledCheck('legacy')],
    next: [themeDeleteDisabledCheck('next')],
  },
}

// Phase 19: the "Read more" dialog of the installed "Kadence" (description over 100 characters). Lite `ThemeCard.vue:92` shows the link for
// `description.length > 100` whatever the update status (the plan's "z aktualizacją" does not match the legacy condition; Astra has a short
// description, so it has no link). Kadence is inactive: the dialog has Activate and Update. No fixed clock: the Vue click on the `<a>` is
// dropped when the clock is frozen (lessons, "zamrożony zegar"); themes have no time-based text.
export const instanceThemesReadMore: ParityState = {
  ...instanceThemesDefault,
  id: 'instance-themes-read-more',
  clock: undefined,
  actions: {
    legacy: [...instanceThemesDefault.actions.legacy, openReadMore('Kadence', 'legacy')],
    next: [...instanceThemesDefault.actions.next, openReadMore('Kadence', 'next')],
  },
  probes: [...themesProbes, ...readMoreProbes(['Activate', 'Update'])],
}

const states: ParityState[] = [
  instanceThemesDefault,
  instanceThemesTable,
  instanceThemesHover,
  instanceThemesCardHover,
  instanceThemesFocus,
  instanceThemesDisabled,
  instanceThemesTableDisabled,
  instanceThemesActivateModal,
  instanceThemesError,
  instanceThemesEmpty,
  instanceThemesSearchEmpty,
  instanceThemesLoading,
  instanceThemesTableLoading,
  instanceThemesSelected,
  instanceThemesAddFeatured,
  instanceThemesAddEmpty,
  instanceThemesAddLoading,
  instanceThemesAddResults,
  instanceThemesAddTable,
  instanceThemesInstallModal,
  instanceThemesInstallError,
  instanceThemesUpdateModal,
  instanceThemesDeleteModal,
  instanceThemesReadMore,
]

/** The list/grid switch is hidden on mobile, and the hover, focus and table states need a pointer or the switch: those states are skipped there. */
const desktopOnly = new Set([
  instanceThemesTable.id,
  instanceThemesHover.id,
  instanceThemesCardHover.id,
  instanceThemesFocus.id,
  instanceThemesTableDisabled.id,
  instanceThemesTableLoading.id,
  instanceThemesAddTable.id,
])

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    test.skip(desktopOnly.has(state.id) && testInfo.project.name.endsWith('mobile'), 'the list/grid switch is hidden on mobile')
    await runState(browser, testInfo, state)
  })
}
