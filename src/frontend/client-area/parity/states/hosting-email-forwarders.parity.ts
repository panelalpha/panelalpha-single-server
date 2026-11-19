import type { ParityState, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { clickForwardersRecordsChip, dnsAnswers, emailDomainsBody, emailForwardersBody, fillAndSubmitAdd, forwardersAddError, forwardersAddFieldProbes, forwardersAddOverlayProbe, forwardersAddProbe, forwardersBase, forwardersDeleteConfirmProbe, forwardersDeleteOverlayProbe, forwardersDeleteTooltipProbe, forwardersDomainDotProbe, forwardersDomainMenuDotProbe, forwardersDomainMenuProbe, forwardersEmptyAddProbe, forwardersEmptyProbe, forwardersFooterProbe, forwardersListError, forwardersModalProbe, forwardersModalSubmit, forwardersModalSubmitProbe, forwardersModalTitleProbe, forwardersNoResultsProbe, forwardersPageActiveProbe, forwardersPath, forwardersPostPath, forwardersRecordsActionsProbe, forwardersRecordsBoxTitleProbe, forwardersRecordsModalProbe, forwardersRecordsProbe, forwardersRecordsTextProbe, forwardersRecordsTitleProbe, forwardersRowDeleteProbe, manyForwarders, openAddModal, openForwarderDeleteModal, openForwardersDomainMenu, recordAnswers, recordDomains, submitAddWithErrors } from './email-forwarders'
import { alertManagerProbe, emailDomain, listSearch, waitFor } from './hosting'
import { isDesktopViewport } from './instances'
import { hovered } from './sftp'

// S-117 ui-email-forwarders (measured on app-lite, `target: 'lite'`, My server tab): `/hosting/email-forwarders`. Builder and fixtures:
// `email-forwarders.ts` (`forwardersBase`, `emailForwarder`, `emailForwardersBody`, `emailDomainsBody`). Each state id is a literal
// `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text. Plan: context/changes/ui-email-forwarders/plan.md.
// Phase 5 covers the default state (`email-forwarders-default`, the parity safety net for the frame and the list); Phase 6 the hover states.

// ---------------------------------------------------------------------------------------------
// Phase 5: default state
// ---------------------------------------------------------------------------------------------

export const hostingEmailForwardersDefault: ParityState = {
  id: 'email-forwarders-default',
  ...forwardersBase(),
}

// ---------------------------------------------------------------------------------------------
// Phase 6: hover states
// ---------------------------------------------------------------------------------------------

/** Hover of the header's Add button (icon-only on mobile, located by its class). The overlay is the probe; the pointer rests on Add. */
export const hostingEmailForwardersHover: ParityState = {
  ...hovered(hostingEmailForwardersDefault, { legacy: forwardersAddProbe.legacy, next: forwardersAddProbe.next }, [forwardersAddOverlayProbe]),
  id: 'email-forwarders-hover',
}

/** Hovers the first row's Delete icon and waits for its tooltip (`open-delay` 150 ms). Desktop only; mobile has a plain hover (the probes skip). */
function hoverRowDelete (next: boolean): StateAction {
  const locate = (page: Page) => (next ? forwardersRowDeleteProbe.next : forwardersRowDeleteProbe.legacy)(page)
  return async page => {
    const element = locate(page)
    if (await element.count() === 0) {
      return
    }
    if (!isDesktopViewport(page)) {
      await element.hover()
      return
    }
    const tooltip = next ? forwardersDeleteTooltipProbe.next : forwardersDeleteTooltipProbe.legacy
    // The row can reflow once the pointer lands and close the tooltip, so the pointer leaves and comes back until it shows.
    await expect(async () => {
      await page.mouse.move(0, 0)
      await element.hover()
      await expect(tooltip(page)).toBeVisible({ timeout: 2500 })
    }).toPass({ timeout: 15_000 })
  }
}

function stillHoveredRowDelete (next: boolean): StateAction {
  const locate = (page: Page) => (next ? forwardersRowDeleteProbe.next : forwardersRowDeleteProbe.legacy)(page)
  return async page => {
    const element = locate(page)
    if (await element.count() === 0) {
      return
    }
    expect(await element.evaluate(node => node.matches(':hover')), 'pointer on the Delete icon after the capture').toBe(true)
  }
}

export const hostingEmailForwardersRowHover: ParityState = {
  ...hostingEmailForwardersDefault,
  id: 'email-forwarders-row-hover',
  pointer: 'keep',
  actions: {
    legacy: [...hostingEmailForwardersDefault.actions.legacy, hoverRowDelete(false)],
    next: [...hostingEmailForwardersDefault.actions.next, hoverRowDelete(true)],
  },
  probes: [...hostingEmailForwardersDefault.probes, forwardersDeleteOverlayProbe, forwardersDeleteTooltipProbe],
  afterCapture: {
    legacy: [...(hostingEmailForwardersDefault.afterCapture?.legacy ?? []), stillHoveredRowDelete(false)],
    next: [...(hostingEmailForwardersDefault.afterCapture?.next ?? []), stillHoveredRowDelete(true)],
  },
}

// ---------------------------------------------------------------------------------------------
// Phase 7: focus-visible
// ---------------------------------------------------------------------------------------------

/**
 * Keyboard focus of the header's Add button, as `buttonFocusState` in auth.ts (Shift, `focus()`, `:focus-visible` asserted; V4 ring hidden
 * in next), located by the test id / class of the other probes: on mobile the button is icon-only, so it has no accessible name for `getByRole`.
 * The pointer is moved off first and stays where it is (the pattern of `ftp-focus-visible`).
 */
function focusAdd (locate: (page: Page) => Locator): StateAction {
  return async page => {
    await page.mouse.move(0, 0)
    await page.keyboard.press('Shift')
    const button = locate(page)
    await button.focus()
    await expect(button).toBeFocused()
    expect(await button.evaluate(node => node.matches(':focus-visible')), 'keyboard focus').toBe(true)
  }
}

/** Asserts that V4's focus ring (`::after`) of the Add button is hidden in next, where V2 has none. */
const noFocusRing: StateAction = async page => {
  const ring = await forwardersAddProbe.next(page).evaluate(node => getComputedStyle(node, '::after').opacity)
  expect(ring, 'V4 focus ring hidden').toBe('0')
}

export const hostingEmailForwardersFocus: ParityState = {
  ...hostingEmailForwardersDefault,
  id: 'email-forwarders-focus-visible',
  pointer: 'keep',
  actions: {
    legacy: [...hostingEmailForwardersDefault.actions.legacy, focusAdd(forwardersAddProbe.legacy)],
    next: [...hostingEmailForwardersDefault.actions.next, focusAdd(forwardersAddProbe.next)],
  },
  probes: [...hostingEmailForwardersDefault.probes, forwardersAddOverlayProbe],
  afterCapture: {
    legacy: [...(hostingEmailForwardersDefault.afterCapture?.legacy ?? [])],
    next: [...(hostingEmailForwardersDefault.afterCapture?.next ?? []), noFocusRing],
  },
}

// ---------------------------------------------------------------------------------------------
// Phase 8: the Add modal and its validation
// ---------------------------------------------------------------------------------------------

const addModalProbes = [forwardersModalProbe, forwardersModalTitleProbe, ...forwardersAddFieldProbes, forwardersModalSubmitProbe]

/** Opens the Add modal from the header's Add button (DOM click, the modal is the state). */
export const hostingEmailForwardersAddModal: ParityState = {
  ...hostingEmailForwardersDefault,
  id: 'email-forwarders-add-modal',
  actions: {
    legacy: [...hostingEmailForwardersDefault.actions.legacy, openAddModal(false)],
    next: [...hostingEmailForwardersDefault.actions.next, openAddModal(true)],
  },
  probes: addModalProbes,
}

/** The Add form submitted with the address blurred and the destination empty: the required message shows (legacy `validate()` blocks the POST). */
export const hostingEmailForwardersAddModalErrors: ParityState = {
  ...hostingEmailForwardersDefault,
  id: 'email-forwarders-add-modal-errors',
  actions: {
    legacy: [...hostingEmailForwardersDefault.actions.legacy, openAddModal(false), submitAddWithErrors(false)],
    next: [...hostingEmailForwardersDefault.actions.next, openAddModal(true), submitAddWithErrors(true)],
  },
  probes: addModalProbes,
}

// ---------------------------------------------------------------------------------------------
// Phase 9: error states (the alert of the failed request; the probes of `email-forwarders.ts`, `alertManagerProbe` from hosting.ts)
// ---------------------------------------------------------------------------------------------

/** The forwarders list answers 500: the alert shows and the table is gone (`isError`). Ready on the alert. */
export const hostingEmailForwardersError: ParityState = {
  id: 'email-forwarders-error',
  ...forwardersBase({
    handlers: { [forwardersPath(1)]: forwardersListError },
    ready: alertManagerProbe,
    probes: [alertManagerProbe],
  }),
}

/** The Add form filled, the POST answers 422: the modal stays open and the alert shows (legacy `catch` keeps the dialog open too). */
export const hostingEmailForwardersAddError: ParityState = {
  id: 'email-forwarders-add-error',
  ...forwardersBase({
    handlers: { [forwardersPostPath]: forwardersAddError },
    legacy: [openAddModal(false), fillAndSubmitAdd(false), waitFor(alertManagerProbe.legacy)],
    next: [openAddModal(true), fillAndSubmitAdd(true), waitFor(alertManagerProbe.next)],
    probes: [...addModalProbes, alertManagerProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 10: the Delete modal, the checkbox not ticked (Delete disabled). Legacy `showDeleteForwarderModal`, opened from the row's icon.
// ---------------------------------------------------------------------------------------------

/** Opens the Delete modal from the first row's icon; the `confirm` checkbox stays unticked, so the Delete button is disabled. */
export const hostingEmailForwardersDeleteModal: ParityState = {
  ...hostingEmailForwardersDefault,
  id: 'email-forwarders-delete-modal',
  actions: {
    legacy: [...hostingEmailForwardersDefault.actions.legacy, openForwarderDeleteModal(false)],
    next: [...hostingEmailForwardersDefault.actions.next, openForwarderDeleteModal(true)],
  },
  probes: [forwardersModalProbe, forwardersModalTitleProbe, forwardersDeleteConfirmProbe, forwardersModalSubmitProbe],
}

// ---------------------------------------------------------------------------------------------
// Phase 11: empty states. Without forwarders the header's search and Add are hidden; the table shows its no-data message (`HostingTable`).
// `-no-domains`: no domain, so no forwarders request is sent (`EmailForwardersView.vue`, `loadEmailDomains` else-branch).
// `-no-results`: a search without a match, the debounce runs on the frozen clock (`listSearch`).
// ---------------------------------------------------------------------------------------------

export const hostingEmailForwardersEmpty: ParityState = {
  id: 'email-forwarders-empty',
  ...forwardersBase({
    handlers: { [forwardersPath(1)]: { json: emailForwardersBody([]) } },
    probes: [forwardersEmptyProbe, forwardersEmptyAddProbe],
  }),
}

export const hostingEmailForwardersNoDomains: ParityState = {
  id: 'email-forwarders-no-domains',
  ...forwardersBase({
    emailDomains: { json: emailDomainsBody([]) },
    probes: [forwardersEmptyProbe, forwardersEmptyAddProbe],
  }),
}

export const hostingEmailForwardersNoResults: ParityState = {
  id: 'email-forwarders-no-results',
  ...forwardersBase({
    legacy: [listSearch('zzz-no-match')],
    next: [listSearch('zzz-no-match')],
    probes: [forwardersNoResultsProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 12: loading states. The list hangs (`'hold'`): the table keeps its skeleton, the header has no search and no Add while it loads
// (`v-if="!emailForwarders.loading"`). The skeleton bones are masked. `-domains-loading`: the domains hang, so the selector shows its
// loading bar and the table shows the empty state (`emailForwarders.loading` starts `false`, as in legacy). `-add-loading`: the POST hangs,
// so the Add button keeps its spinner (`BasicModal` `submitting`); the spinner is masked.
// ---------------------------------------------------------------------------------------------

const forwardersSkeletonMasks = {
  legacy: [(page: Page) => page.locator('.v-main .data-table .v-skeleton-loader')],
  next: [(page: Page) => page.getByTestId('email-forwarders-table').locator('.v-skeleton-loader')],
}

const forwardersSkeletonWait = {
  legacy: [waitFor(page => page.locator('.v-main .data-table .v-skeleton-loader').first())],
  next: [waitFor(page => page.getByTestId('email-forwarders-table').locator('.v-skeleton-loader').first())],
}

export const hostingEmailForwardersLoading: ParityState = {
  id: 'email-forwarders-loading',
  ...forwardersBase({
    handlers: { [forwardersPath(1)]: 'hold' },
    legacy: forwardersSkeletonWait.legacy,
    next: forwardersSkeletonWait.next,
    masks: forwardersSkeletonMasks,
  }),
}

export const hostingEmailForwardersDomainsLoading: ParityState = {
  id: 'email-forwarders-domains-loading',
  ...forwardersBase({
    emailDomains: 'hold',
    probes: [forwardersEmptyProbe],
  }),
}

export const hostingEmailForwardersAddLoading: ParityState = {
  id: 'email-forwarders-add-loading',
  ...forwardersBase({
    handlers: { [forwardersPostPath]: 'hold' },
    legacy: [openAddModal(false), fillAndSubmitAdd(false), waitFor(page => forwardersModalSubmit(page, false).locator('.v-progress-circular'))],
    next: [openAddModal(true), fillAndSubmitAdd(true), waitFor(page => forwardersModalSubmit(page, true).locator('.v-progress-circular'))],
    masks: {
      legacy: [(page: Page) => forwardersModalSubmit(page, false).locator('.v-progress-circular')],
      next: [(page: Page) => forwardersModalSubmit(page, true).locator('.v-progress-circular')],
    },
    probes: addModalProbes,
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 13: SPF/DKIM chip, records dot, domain menu, records modal (the probes and fixtures of `email-forwarders.ts`)
// ---------------------------------------------------------------------------------------------

/** The records chip: the records are published for both domains, so both verdicts are configured. */
export const hostingEmailForwardersRecordsOk: ParityState = {
  id: 'email-forwarders-records-ok',
  ...forwardersBase({
    emailDomains: { json: recordDomains },
    external: { 'dns.google': dnsAnswers(recordAnswers) },
    // No failing domain here, so the dot is absent on both sides and is not probed (a both-missing probe would pass silently).
    probes: [forwardersRecordsProbe],
  }),
}

/** No DNS record answers: the selected domain's chip is red and it has the dot. */
export const hostingEmailForwardersRecordsFailed: ParityState = {
  id: 'email-forwarders-records-failed',
  ...forwardersBase({
    emailDomains: { json: recordDomains },
    probes: [forwardersRecordsProbe, forwardersDomainDotProbe],
  }),
}

/** dns.google never answers: the chip shows its skeletons. */
export const hostingEmailForwardersRecordsLoading: ParityState = {
  id: 'email-forwarders-records-loading',
  ...forwardersBase({
    emailDomains: { json: recordDomains },
    external: { 'dns.google': 'hold' },
    probes: [forwardersRecordsProbe],
  }),
}

/** The records modal: the chip opens it for the selected domain; its DKIM list is empty, so it shows the no-records text. */
const modalDomain = emailDomain({
  dkim_records: [],
  spf_records: [{ name: 'example.com', type: 'TXT', value: 'v=spf1 include:mail.example.net -all' }],
})
export const hostingEmailForwardersRecordsModal: ParityState = {
  id: 'email-forwarders-records-modal',
  ...forwardersBase({
    emailDomains: { json: emailDomainsBody([modalDomain, emailDomain({ id: 2, domain: 'shop.example.com', spf_records: [{ name: 'shop.example.com', type: 'TXT', value: 'v=spf1 -all' }] })], true) },
    external: { 'dns.google': dnsAnswers(recordAnswers) },
    legacy: [clickForwardersRecordsChip(false), waitFor(page => page.locator('.record-configuration-modal'))],
    next: [clickForwardersRecordsChip(true), waitFor(page => page.locator('.record-configuration-modal'))],
    probes: [forwardersRecordsModalProbe, forwardersRecordsTitleProbe, forwardersRecordsTextProbe, forwardersRecordsActionsProbe, forwardersRecordsBoxTitleProbe],
  }),
}

/** The domain menu open: the failing second domain has the dot in its item. Only example.com has its records in DNS. */
export const hostingEmailForwardersDomainMenu: ParityState = {
  id: 'email-forwarders-domain-menu',
  ...forwardersBase({
    emailDomains: { json: recordDomains },
    external: {
      'dns.google': dnsAnswers({
        'default._domainkey.example.com': recordAnswers['default._domainkey.example.com'],
        'example.com': recordAnswers['example.com'],
      }),
    },
    pointer: 'keep',
    legacy: [openForwardersDomainMenu(false)],
    next: [openForwardersDomainMenu(true)],
    probes: [forwardersDomainMenuProbe, forwardersDomainMenuDotProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 14: pagination. Twelve forwarders: the first page of eight, the footer shows two pages and page 1 is active.
// ---------------------------------------------------------------------------------------------

export const hostingEmailForwardersPaged: ParityState = {
  id: 'email-forwarders-paged',
  ...forwardersBase({
    handlers: { [forwardersPath(1)]: { json: emailForwardersBody(manyForwarders) } },
    probes: [forwardersFooterProbe, forwardersPageActiveProbe],
  }),
}

const states: ParityState[] = [
  hostingEmailForwardersDefault,
  hostingEmailForwardersHover,
  hostingEmailForwardersRowHover,
  hostingEmailForwardersFocus,
  hostingEmailForwardersAddModal,
  hostingEmailForwardersAddModalErrors,
  hostingEmailForwardersError,
  hostingEmailForwardersAddError,
  hostingEmailForwardersDeleteModal,
  hostingEmailForwardersEmpty,
  hostingEmailForwardersNoDomains,
  hostingEmailForwardersNoResults,
  hostingEmailForwardersLoading,
  hostingEmailForwardersDomainsLoading,
  hostingEmailForwardersAddLoading,
  hostingEmailForwardersRecordsOk,
  hostingEmailForwardersRecordsFailed,
  hostingEmailForwardersRecordsLoading,
  hostingEmailForwardersRecordsModal,
  hostingEmailForwardersDomainMenu,
  hostingEmailForwardersPaged,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    // explicit lite (the default target): the same target as the project frame states of the hosting slices
    await runState(browser, testInfo, { ...state, target: 'lite' })
  })
}
