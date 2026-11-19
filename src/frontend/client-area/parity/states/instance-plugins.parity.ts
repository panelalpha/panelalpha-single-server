import type { ParityState, Probe, StateAction } from './state'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { alertProbes, settled } from './auth'
import { listSearch, waitFor } from './hosting'
import { INSTANCE_PAGE_DNS } from './instance'
import { actionDialog, actionDialogProbes, activateModalProbes, activateRefusedHandler, activateRefusedMessage, addBackProbe, addEmptyAnchor, addEmptyHandler, addEmptyProbes, addFeaturedAnchor, addFooterProbe, addLoadingAnchor, addLoadingSkeletonProbe, addNewFocusOverlayProbe, addNewOverlayProbe, addNewStillFocused, addNewStillHovered, addResultsAnchor, addResultsCardProbe, addResultsSecondCardProbe, addSearchProbe, addTableAnchor, addTableInstallProbe, addTableProbe, addTableRowProbe, addTitleProbe, cardActivateDisabled, cardActivateProbe, checkCards, DEACTIVATE_MESSAGE, DELETE_MESSAGE, errorAlert, errorAlertStillHovered, featuredCardProbe, featuredInstallProbe, featuredLabelProbe, featuredStarProbe, firstTableRowStillHovered, focusAddNew, goToSecondPage, hoverAddNew, hoverFirstTableRow, installingActionsProbe, installingCardProbe, installingRows, installModalProbes, installRefusedHandler, installRefusedMessage, MASS_UPDATE_MESSAGE, openActivate, openAddNew, openCardAction, openInstall, openMassUpdate, openReadMore, PLUGINS_HOME, pluginsAddNewProbe, pluginsFooterProbe, pluginsHandlers, pluginsList, pluginsPageTwoProbes, pluginsProbes, pluginsTableProbe, pluginsTableProbes, pluginsTableRowProbe, pluginsTitleProbe, readMoreFeaturedRows, readMoreInstalledRows, readMoreProbes, selectionProbes, selectNoUpdate, selectWithUpdate, snackbarRowActions, submitActivate, submitInstall, switchAddToTable, switchToTable, tableUpdateDisabled, tableUpdateDisabledProbe, typeAddSearch, UPDATE_MESSAGE } from './instance-plugins'
import { NOW } from './shell'

// S-88 ui-instance-plugins: the Plugins screen of a project, measured on app-lite (`target: 'lite'`, M-2 default). Each state id is a literal
// `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text. Builder and probes: `instance-plugins.ts`.
// Plan: context/changes/ui-instance-plugins/plan.md ("Stany parity").

/** The readiness anchor: the first installed card is on the page (the list comes from `GET …/wordpress/plugins`). */
const waitForCards = {
  legacy: [waitFor(page => page.locator('.data-iterator-card').first())],
  next: [waitFor(page => page.locator('.data-iterator-card').first())],
}

// Phase 7: the default state, the first page of the installed plugins (8 of 10) with the pagination footer.
export const instancePluginsDefault: ParityState = {
  id: 'instance-plugins-default',
  target: 'lite',
  path: '/projects/1/plugins',
  signedIn: true,
  clock: NOW,
  home: PLUGINS_HOME,
  handlers: pluginsHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForCards,
  probes: pluginsProbes,
}

// Phase 8: the table view (`ListGridSwitch` is desktop only) and the second page of the footer (8 of 10 on page 1).
export const instancePluginsTable: ParityState = {
  id: 'instance-plugins-table',
  target: 'lite',
  path: '/projects/1/plugins',
  signedIn: true,
  clock: NOW,
  home: PLUGINS_HOME,
  handlers: pluginsHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [...waitForCards.legacy, switchToTable.legacy],
    next: [...waitForCards.next, switchToTable.next],
  },
  probes: pluginsTableProbes,
}

export const instancePluginsPageTwo: ParityState = {
  id: 'instance-plugins-page-2',
  target: 'lite',
  path: '/projects/1/plugins',
  signedIn: true,
  clock: NOW,
  home: PLUGINS_HOME,
  handlers: pluginsHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [...waitForCards.legacy, goToSecondPage.legacy],
    next: [...waitForCards.next, goToSecondPage.next],
  },
  probes: pluginsPageTwoProbes,
}

// Phase 9: hover of "Add New" (`buttonHoverState`, the name lookup `button.addNew`; the mobile button is icon-only, so the state is desktop only)
// and hover of the first table row (the row background, desktop only: on mobile the rows are cards).
export const instancePluginsHover: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-hover',
  pointer: 'keep',
  actions: {
    legacy: [...instancePluginsDefault.actions.legacy, hoverAddNew.legacy],
    next: [...instancePluginsDefault.actions.next, hoverAddNew.next],
  },
  probes: [...instancePluginsDefault.probes, addNewOverlayProbe],
  afterCapture: { legacy: [addNewStillHovered.legacy], next: [addNewStillHovered.next] },
}

export const instancePluginsRowHover: ParityState = {
  ...instancePluginsTable,
  id: 'instance-plugins-row-hover',
  pointer: 'keep',
  actions: {
    legacy: [...instancePluginsTable.actions.legacy, hoverFirstTableRow.legacy],
    next: [...instancePluginsTable.actions.next, hoverFirstTableRow.next],
  },
  probes: [...instancePluginsTable.probes, pluginsTableRowProbe],
  afterCapture: {
    legacy: [...(instancePluginsTable.afterCapture?.legacy ?? []), firstTableRowStillHovered.legacy],
    next: [...(instancePluginsTable.afterCapture?.next ?? []), firstTableRowStillHovered.next],
  },
}

// Phase 10: keyboard focus on "Add New", reached with a real `Tab` (`focusAddNew`); the focus ring is hidden in next (V4 `::after`), legacy has none.
// "Read more" (`<a>` without `href`) is not focusable in legacy (research zarzut 5), so it is not in this state.
export const instancePluginsFocus: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-focus',
  pointer: 'keep',
  actions: {
    legacy: [...instancePluginsDefault.actions.legacy, focusAddNew.legacy],
    next: [...instancePluginsDefault.actions.next, focusAddNew.next],
  },
  probes: [...instancePluginsDefault.probes, addNewFocusOverlayProbe],
  afterCapture: { legacy: [addNewStillFocused.legacy], next: [addNewStillFocused.next] },
}

// Phase 11: the disabled states. `default` already holds the card whose activation is not allowed; the table has a row without an update.
export const instancePluginsDisabled: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-disabled',
  probes: [...instancePluginsDefault.probes, cardActivateProbe],
  afterCapture: { legacy: [cardActivateDisabled.legacy], next: [cardActivateDisabled.next] },
}

export const instancePluginsTableDisabled: ParityState = {
  ...instancePluginsTable,
  id: 'instance-plugins-table-disabled',
  probes: [...instancePluginsTable.probes, tableUpdateDisabledProbe],
  afterCapture: { legacy: [tableUpdateDisabled.legacy], next: [tableUpdateDisabled.next] },
}

// Phase 12: the activation dialog of "Hello Dolly" (the card's button opens it), and the refused activation: the PUT answers 422, the dialog
// closes and the error alert shows the message. The alert closes itself after 5 s, so the pointer rests on it while the screenshot is taken.
export const instancePluginsActivateModal: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-activate-modal',
  actions: {
    legacy: [...instancePluginsDefault.actions.legacy, openActivate.legacy],
    next: [...instancePluginsDefault.actions.next, openActivate.next],
  },
  probes: [...instancePluginsDefault.probes, ...activateModalProbes],
}

/** The alert is open and settled before the pointer rests on it (the alert stack animates in). */
function refusedAlert (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await expect(errorAlert(page).filter({ hasText: activateRefusedMessage }), `${app}: refused activation alert`).toBeVisible()
    await settled(errorAlert(page))
    await errorAlertStillHovered[app](page)
  }
}

export const instancePluginsError: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-error',
  handlers: pluginsHandlers(activateRefusedHandler),
  pointer: 'keep',
  actions: {
    legacy: [...instancePluginsDefault.actions.legacy, openActivate.legacy, submitActivate('legacy'), refusedAlert('legacy')],
    next: [...instancePluginsDefault.actions.next, openActivate.next, submitActivate('next'), refusedAlert('next')],
  },
  afterCapture: {
    legacy: [async page => {
      await expect(errorAlert(page), 'Harness error: legacy error alert closed during capture').toBeVisible()
    }],
    next: [async page => {
      await expect(errorAlert(page), 'Harness error: next error alert closed during capture').toBeVisible()
    }],
  },
  probes: [...instancePluginsDefault.probes, ...alertProbes(errorAlert)],
}

// Phase 13: the empty state (`GET …/wordpress/plugins` -> `{ data: [] }`): no page title and no cards, so the readiness anchor is the empty block
// (`TableFullScreenMessage`, `PluginsView.vue:4-39`). The shell answers the rest as in `default`.
const emptyAnchor: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [waitFor(page => page.locator('.no-data').first())],
  next: [waitFor(page => page.locator('.no-data').first())],
}

export const instancePluginsEmpty: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-empty',
  handlers: pluginsHandlers({ 'GET /projects/1/wordpress/plugins': pluginsList([]) }),
  actions: emptyAnchor,
  probes: [
    { key: 'empty-card', legacy: page => page.locator('.v-main .v-card', { has: page.locator('.no-data') }).first(), next: page => page.locator('.v-main .v-card', { has: page.locator('.no-data') }).first() },
    { key: 'empty-title', legacy: page => page.locator('.no-data__title'), next: page => page.locator('.no-data__title') },
    { key: 'empty-desc', legacy: page => page.locator('.no-data__desc'), next: page => page.locator('.no-data__desc') },
    { key: 'empty-illustration', legacy: page => page.locator('.no-data__img'), next: page => page.locator('.no-data__img') },
    { key: 'empty-add', legacy: page => page.locator('.add-new-button').first(), next: page => page.locator('.add-new-button').first() },
  ],
}

// Phase 13: a search with no hit on the installed list (`listSearch` waits for `.no-results-container`, `DataIteratorNoResultsContainer`).
export const instancePluginsSearchEmpty: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-search-empty',
  actions: {
    legacy: [...waitForCards.legacy, listSearch('no-such-plugin')],
    next: [...waitForCards.next, listSearch('no-such-plugin')],
  },
  probes: [
    pluginsTitleProbe,
    pluginsAddNewProbe,
    { key: 'filter-controls', legacy: page => page.locator('.page-title__filter-controls'), next: page => page.locator('.page-title__filter-controls') },
    { key: 'no-results', legacy: page => page.locator('.no-results-container'), next: page => page.locator('.no-results-container') },
  ],
}

// Phase 14: the list request stays pending (`GET …/wordpress/plugins` = 'hold'). The page title and the Add New button are up, and the grid shows
// its eight `PluginCardSkeleton` (`PluginsView.vue` `#loading`). The skeleton animation is frozen by the harness (`FREEZE_CSS`), so no mask.
const cardSkeletonAnchor: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [waitFor(page => page.locator('.v-skeleton-loader').first())],
  next: [waitFor(page => page.locator('.v-skeleton-loader').first())],
}

const cardSkeletonProbe: Probe = {
  key: 'card-skeleton',
  legacy: page => page.locator('.v-card', { has: page.locator('.v-skeleton-loader.title') }).first(),
  next: page => page.locator('.v-card', { has: page.locator('.v-skeleton-loader.title') }).first(),
}

export const instancePluginsLoading: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-loading',
  handlers: pluginsHandlers({ 'GET /projects/1/wordpress/plugins': 'hold' }),
  actions: cardSkeletonAnchor,
  probes: [pluginsTitleProbe, pluginsAddNewProbe, cardSkeletonProbe],
}

// Phase 14: the table view while the list is pending. The list is held from the start, so the switch is clicked during the loading state
// (the switch stays up while loading); the table then shows `PluginTableSortSkeleton` (`thead.sort`) and `PluginTableItemsSkeleton` (`tbody.item`).
export const instancePluginsTableLoading: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-table-loading',
  handlers: pluginsHandlers({ 'GET /projects/1/wordpress/plugins': 'hold' }),
  actions: {
    legacy: [...cardSkeletonAnchor.legacy, switchToTable.legacy, waitFor(page => page.locator('.v-card.data-table tbody .v-skeleton-loader').first())],
    next: [...cardSkeletonAnchor.next, switchToTable.next, waitFor(page => page.locator('.v-card.data-table tbody .v-skeleton-loader').first())],
  },
  probes: [
    pluginsTableProbe,
    { key: 'table-sort-skeleton', legacy: page => page.locator('.v-card.data-table thead.sort'), next: page => page.locator('.v-card.data-table thead.sort') },
    { key: 'table-items-skeleton', legacy: page => page.locator('.v-card.data-table tbody.item'), next: page => page.locator('.v-card.data-table tbody.item') },
  ],
}

// Phase 15: the selection. Two cards checked by a click on their checkbox (`selectWithUpdate` / `selectNoUpdate`, builder file); the bar shows
// the count and the mass actions. The counts of the row are checked before the capture (`snackbarRowActions`).
export const instancePluginsSelected: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-selected',
  actions: {
    legacy: [...instancePluginsDefault.actions.legacy, selectWithUpdate.legacy, snackbarRowActions(5)],
    next: [...instancePluginsDefault.actions.next, selectWithUpdate.next, snackbarRowActions(5)],
  },
  probes: [...instancePluginsDefault.probes, ...selectionProbes],
}

// Phase 15: two cards without an update are checked, so the bar has no "Update" (four mass actions on desktop).
export const instancePluginsSelectedNoUpdate: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-selected-no-update',
  actions: {
    legacy: [...instancePluginsDefault.actions.legacy, selectNoUpdate.legacy, snackbarRowActions(4)],
    next: [...instancePluginsDefault.actions.next, selectNoUpdate.next, snackbarRowActions(4)],
  },
  probes: [...instancePluginsDefault.probes, ...selectionProbes],
}

// Phase 16: Add New (the "+" button, `Plugins.vue:643-652`: the tab opens on the featured list). The featured grid: the first card is featured
// (ribbon, star); the table is not measured (legacy featured table is broken, research D1).
export const instancePluginsAddFeatured: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-add-featured',
  actions: {
    legacy: [...instancePluginsDefault.actions.legacy, openAddNew.legacy, ...addFeaturedAnchor.legacy],
    next: [...instancePluginsDefault.actions.next, openAddNew.next, ...addFeaturedAnchor.next],
  },
  probes: [addTitleProbe, addBackProbe, addSearchProbe, featuredCardProbe, featuredLabelProbe, featuredStarProbe, featuredInstallProbe],
}

// Phase 16: an empty featured list (`[]`): the empty card with "Start Searching For New Plugins" and Back.
export const instancePluginsAddEmpty: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-add-empty',
  handlers: pluginsHandlers({ 'GET /projects/1/wordpress/plugins/new/featured': addEmptyHandler }),
  actions: {
    legacy: [...instancePluginsDefault.actions.legacy, openAddNew.legacy, ...addEmptyAnchor.legacy],
    next: [...instancePluginsDefault.actions.next, openAddNew.next, ...addEmptyAnchor.next],
  },
  probes: addEmptyProbes,
}

// Phase 16: the featured list stays pending: the Add New tab shows its loading state (skeletons) or the empty card, as the apps decide.
export const instancePluginsAddLoading: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-add-loading',
  handlers: pluginsHandlers({ 'GET /projects/1/wordpress/plugins/new/featured': 'hold' }),
  actions: {
    legacy: [...instancePluginsDefault.actions.legacy, openAddNew.legacy, ...addLoadingAnchor.legacy],
    next: [...instancePluginsDefault.actions.next, openAddNew.next, ...addLoadingAnchor.next],
  },
  probes: [addTitleProbe, addLoadingSkeletonProbe],
}

// Phase 17: a search term in Add New (`GET …/plugins/new/search/seo` -> two results). No fixed clock: the 300 ms debounce runs on real timers.
export const instancePluginsAddResults: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-add-results',
  clock: undefined,
  actions: {
    legacy: [...instancePluginsDefault.actions.legacy, openAddNew.legacy, typeAddSearch.legacy, ...addResultsAnchor.legacy],
    next: [...instancePluginsDefault.actions.next, openAddNew.next, typeAddSearch.next, ...addResultsAnchor.next],
  },
  probes: [addTitleProbe, addSearchProbe, addResultsCardProbe, addResultsSecondCardProbe, addFooterProbe],
}

// Phase 17: the same results in the table (desktop): the list button of the Add New title row, then the "SEO Helper" row.
export const instancePluginsAddTable: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-add-table',
  clock: undefined,
  actions: {
    legacy: [...instancePluginsDefault.actions.legacy, openAddNew.legacy, typeAddSearch.legacy, ...addResultsAnchor.legacy, switchAddToTable.legacy, ...addTableAnchor.legacy],
    next: [...instancePluginsDefault.actions.next, openAddNew.next, typeAddSearch.next, ...addResultsAnchor.next, switchAddToTable.next, ...addTableAnchor.next],
  },
  probes: [addTitleProbe, addSearchProbe, addTableProbe, addTableRowProbe, addTableInstallProbe, addFooterProbe],
}

// Phase 18: the install dialog of "Featured Plugin 1" (Add New, featured grid), opened from the card's install button.
export const instancePluginsInstallModal: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-install-modal',
  actions: {
    legacy: [...instancePluginsDefault.actions.legacy, openAddNew.legacy, ...addFeaturedAnchor.legacy, openInstall.legacy],
    next: [...instancePluginsDefault.actions.next, openAddNew.next, ...addFeaturedAnchor.next, openInstall.next],
  },
  probes: [addTitleProbe, ...installModalProbes],
}

/** The alert of the refused install is open and settled before the pointer rests on it (the alert stack animates in, then closes after 5 s). */
function refusedInstallAlert (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await expect(errorAlert(page).filter({ hasText: installRefusedMessage }), `${app}: refused install alert`).toBeVisible()
    await settled(errorAlert(page))
    await errorAlertStillHovered[app](page)
  }
}

// Phase 18: the install request answers 422: the dialog closes (legacy `finally`, next `ctx.close()`) and the error alert shows the message.
export const instancePluginsInstallError: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-install-error',
  handlers: pluginsHandlers(installRefusedHandler),
  pointer: 'keep',
  actions: {
    legacy: [...instancePluginsDefault.actions.legacy, openAddNew.legacy, ...addFeaturedAnchor.legacy, openInstall.legacy, submitInstall('legacy'), refusedInstallAlert('legacy')],
    next: [...instancePluginsDefault.actions.next, openAddNew.next, ...addFeaturedAnchor.next, openInstall.next, submitInstall('next'), refusedInstallAlert('next')],
  },
  afterCapture: {
    legacy: [async page => {
      await expect(errorAlert(page), 'Harness error: legacy install alert closed during capture').toBeVisible()
    }],
    next: [async page => {
      await expect(errorAlert(page), 'Harness error: next install alert closed during capture').toBeVisible()
    }],
  },
  probes: [addTitleProbe, ...alertProbes(errorAlert)],
}

// Phase 18: the installed list with "Cache Boost" still installing (`async_status.install: 'pending'`): the card shows the loader and "Installing".
export const instancePluginsInstalling: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-installing',
  handlers: pluginsHandlers({ 'GET /projects/1/wordpress/plugins': pluginsList(installingRows) }),
  actions: {
    legacy: [waitFor(page => page.locator('.data-iterator-card', { hasText: 'Installing' }).first())],
    next: [waitFor(page => page.locator('.data-iterator-card', { hasText: 'Installing' }).first())],
  },
  probes: [pluginsTitleProbe, pluginsAddNewProbe, installingCardProbe, installingActionsProbe, pluginsFooterProbe],
}

// Phase 19: the action dialogs. The deactivate and the delete dialogs share the lite title "Deactivate Plugin", so they are told apart by message.
// The mass update message is the raw key in both apps (the lite copy has no `title_one`). Helpers and messages: `instance-plugins.ts`.
export const instancePluginsDeactivateModal: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-deactivate-modal',
  actions: {
    legacy: [...instancePluginsDefault.actions.legacy, openCardAction('Akismet Anti-Spam', 0, DEACTIVATE_MESSAGE).legacy],
    next: [...instancePluginsDefault.actions.next, openCardAction('Akismet Anti-Spam', 0, DEACTIVATE_MESSAGE).next],
  },
  probes: [...instancePluginsDefault.probes, ...actionDialogProbes(DEACTIVATE_MESSAGE, 'Deactivate')],
}

export const instancePluginsUpdateModal: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-update-modal',
  actions: {
    legacy: [...instancePluginsDefault.actions.legacy, openCardAction('Classic Editor', 1, UPDATE_MESSAGE).legacy],
    next: [...instancePluginsDefault.actions.next, openCardAction('Classic Editor', 1, UPDATE_MESSAGE).next],
  },
  probes: [...instancePluginsDefault.probes, ...actionDialogProbes(UPDATE_MESSAGE, 'Update')],
}

export const instancePluginsMassUpdateModal: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-mass-update-modal',
  actions: {
    legacy: [...instancePluginsDefault.actions.legacy, checkCards([3]).legacy, snackbarRowActions(5), openMassUpdate.legacy],
    next: [...instancePluginsDefault.actions.next, checkCards([3]).next, snackbarRowActions(5), openMassUpdate.next],
  },
  probes: [...instancePluginsDefault.probes, ...actionDialogProbes(MASS_UPDATE_MESSAGE, 'Update')],
}

// The Delete button is disabled until the confirm checkbox is ticked (`PluginsActionsMixin.js:430-438`): the state measures the disabled button.
export const instancePluginsDeleteModal: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-delete-modal',
  actions: {
    legacy: [...instancePluginsDefault.actions.legacy, openCardAction('Gallery Pro', 1, DELETE_MESSAGE).legacy],
    next: [...instancePluginsDefault.actions.next, openCardAction('Gallery Pro', 1, DELETE_MESSAGE).next],
  },
  probes: [
    ...instancePluginsDefault.probes,
    ...actionDialogProbes(DELETE_MESSAGE, 'Delete'),
    {
      key: 'delete-confirm',
      legacy: page => actionDialog(page, 'legacy', DELETE_MESSAGE).getByRole('checkbox'),
      next: page => actionDialog(page, 'next', DELETE_MESSAGE).getByRole('checkbox'),
    },
  ],
  afterCapture: {
    legacy: [async page => {
      await expect(actionDialog(page, 'legacy', DELETE_MESSAGE).getByRole('button', { name: 'Delete', exact: true }), 'legacy: delete disabled before confirm').toBeDisabled()
    }],
    next: [async page => {
      await expect(actionDialog(page, 'next', DELETE_MESSAGE).getByRole('button', { name: 'Delete', exact: true }), 'next: delete disabled before confirm').toBeDisabled()
    }],
  },
}

// Phase 20: the "Read more" dialog of the installed "Classic Editor" (update: red band, Update button) and of the catalogue "Featured Plugin 1"
// (Add New: Install button, no status chip). The link opens by `evaluate`; the dialog is `.readme-card` in both apps.
export const instancePluginsReadMore: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-read-more',
  handlers: pluginsHandlers({ 'GET /projects/1/wordpress/plugins': pluginsList(readMoreInstalledRows) }),
  actions: {
    legacy: [...instancePluginsDefault.actions.legacy, openReadMore('Classic Editor', 'legacy')],
    next: [...instancePluginsDefault.actions.next, openReadMore('Classic Editor', 'next')],
  },
  probes: [...instancePluginsDefault.probes, ...readMoreProbes(['Update'])],
}

export const instancePluginsReadMoreNew: ParityState = {
  ...instancePluginsDefault,
  id: 'instance-plugins-read-more-new',
  handlers: pluginsHandlers({ 'GET /projects/1/wordpress/plugins/new/featured': { json: { data: readMoreFeaturedRows } } }),
  actions: {
    legacy: [...instancePluginsDefault.actions.legacy, openAddNew.legacy, ...addFeaturedAnchor.legacy, openReadMore('Featured Plugin 1', 'legacy')],
    next: [...instancePluginsDefault.actions.next, openAddNew.next, ...addFeaturedAnchor.next, openReadMore('Featured Plugin 1', 'next')],
  },
  probes: [addTitleProbe, ...readMoreProbes(['Install'])],
}

const states: ParityState[] = [instancePluginsDefault, instancePluginsTable, instancePluginsPageTwo, instancePluginsHover, instancePluginsRowHover, instancePluginsFocus, instancePluginsDisabled, instancePluginsTableDisabled, instancePluginsActivateModal, instancePluginsError, instancePluginsEmpty, instancePluginsSearchEmpty, instancePluginsLoading, instancePluginsTableLoading, instancePluginsSelected, instancePluginsSelectedNoUpdate, instancePluginsAddFeatured, instancePluginsAddEmpty, instancePluginsAddLoading, instancePluginsAddResults, instancePluginsAddTable, instancePluginsInstallModal, instancePluginsInstallError, instancePluginsInstalling, instancePluginsDeactivateModal, instancePluginsUpdateModal, instancePluginsMassUpdateModal, instancePluginsDeleteModal, instancePluginsReadMore, instancePluginsReadMoreNew]

/** The table view exists on desktop only: on mobile the switch is hidden and the rows are cards. The Add New hover is desktop only (icon-only on mobile). */
const desktopOnly = new Set([instancePluginsTable.id, instancePluginsHover.id, instancePluginsRowHover.id, instancePluginsTableDisabled.id, instancePluginsTableLoading.id, instancePluginsAddTable.id])

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    test.skip(desktopOnly.has(state.id) && testInfo.project.name.endsWith('mobile'), 'the list/grid switch is hidden on mobile')
    await runState(browser, testInfo, state)
  })
}
