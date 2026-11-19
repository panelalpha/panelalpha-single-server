import type { ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { alertManagerProbe, hostingService, hostingState, listSearch, serverAccount, waitFor } from './hosting'
import { DNS_POST_KEY, DNS_RECORDS_KEY, DNS_TYPES_KEY, DNS_ZONES_KEY, dnsAddOverlayProbe, dnsAddProbe, dnsCannotManageProbe, dnsDefaultProbes, dnsDeleteProbes, dnsEmptyProbe, dnsHandlers, dnsLoadingProbe, dnsModalProbe, dnsModalProbes, dnsModalSubmitProbe, dnsModalTitleProbe, dnsNoResultsProbe, dnsProxyHandlers, dnsProxyProbe, dnsProxyWarningProbes, dnsRowEditOverlayProbe, dnsSearchProbe, dnsSelectorProbe, dnsService, dnsTableProbe, dnsTitleProbe, fillAddForm, openAdd, openProxyWarning, openRowModal, pressSubmit, rowEditButton, rowsReady, waitForSubmitSpinner } from './hosting-dns'

// S-38 hosting-dns, S-115 ui-hosting-dns (measured on app-lite, `target: 'lite'`, My server tab): `/hosting/dns` (default and proxy).
// Builder: `hosting.ts`; probes, fixtures and handlers: `hosting-dns.ts`. Each state id is a literal `id: '…',` line, which
// `registeredStates` in report/write-report.ts reads as text. Plan: context/changes/ui-hosting-dns/plan.md.

// ---------------------------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------------------------

export const hostingDns: ParityState = {
  id: 'hosting-dns',
  ...hostingState({
    path: '/hosting/dns',
    lite: true,
    services: [dnsService],
    handlers: dnsHandlers(),
    ready: rowsReady,
    probes: dnsDefaultProbes,
  }),
}

export const hostingDnsProxy: ParityState = {
  id: 'hosting-dns-proxy',
  ...hostingState({
    path: '/hosting/dns',
    lite: true,
    services: [dnsService],
    handlers: dnsProxyHandlers(),
    ready: rowsReady,
    probes: [...dnsDefaultProbes, dnsProxyProbe],
  }),
}

type Target = (page: Page) => Locator

/**
 * `base` with the pointer resting on the element of `target` (transitions are frozen, so the hover is final), the pattern of `hovered` in
 * `instance-advanced-cron.parity.ts` (not exported, so it is written here). A target the variant does not render is skipped in that
 * variant. The pointer stays where the action left it and is asserted on the element after the capture.
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

// Phase 6: hover of the header's Add button (on mobile it is icon-only, located by the same test id / class as the other probes) and hover
// of the Edit icon of the first row (desktop `.actions-row`; on mobile the icon sits in the card, so the row state is not run there).
export const hostingDnsAddHover: ParityState = {
  ...hovered(hostingDns, { legacy: dnsAddProbe.legacy, next: dnsAddProbe.next }, [dnsAddOverlayProbe]),
  id: 'hosting-dns-add-hover',
}

export const hostingDnsRowHover: ParityState = {
  ...hovered(hostingDns, { legacy: page => rowEditButton(page, false), next: page => rowEditButton(page, true) }, [dnsRowEditOverlayProbe]),
  id: 'hosting-dns-row-hover',
}

// Phase 7: keyboard focus of the header's Add button, as `buttonFocusState` in auth.ts (Shift, `focus()`, `:focus-visible` asserted; V4 ring
// hidden in next) but located by the test id / class of the other probes: on mobile the button is icon-only, so it has no accessible name
// for `getByRole`. The pointer is moved off first and stays where it is (the pattern of `cron-focus-visible`).
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
  const ring = await dnsAddProbe.next(page).evaluate(node => getComputedStyle(node, '::after').opacity)
  expect(ring, 'V4 focus ring hidden').toBe('0')
}

export const hostingDnsAddFocus: ParityState = {
  ...hostingDns,
  id: 'hosting-dns-add-focus',
  pointer: 'keep',
  actions: {
    legacy: [...hostingDns.actions.legacy, focusAdd(dnsAddProbe.legacy)],
    next: [...hostingDns.actions.next, focusAdd(dnsAddProbe.next)],
  },
  probes: [...dnsDefaultProbes, dnsAddOverlayProbe],
  afterCapture: {
    legacy: [],
    next: [noFocusRing],
  },
}

// Phase 8: the Delete modal of the first row before its `confirm` checkbox is ticked: the submit button is disabled (looks like app, decision
// `ui-buttons-tokens`). Opened by a DOM click on the row's Delete icon (index 1); only the modal's probes are read, as in `hosting-cron-delete-open`.
export const hostingDnsDeleteOpen: ParityState = {
  id: 'hosting-dns-delete-open',
  ...hostingState({
    path: '/hosting/dns',
    lite: true,
    services: [dnsService],
    handlers: dnsHandlers(),
    ready: rowsReady,
    legacy: [openRowModal(false, 1)],
    next: [openRowModal(true, 1)],
    probes: dnsDeleteProbes,
  }),
}

// Phase 9: the zones request fails (500 `Server Error`): the shell's alert and the table's skeleton (legacy `Dns.vue:424-447`, D2 R38). The
// readiness anchor is the alert stack; the toast is pinned by a hover on its text (`mouseover` stops its 5 s timer) on both sides.
export const hostingDnsError: ParityState = {
  id: 'hosting-dns-error',
  ...hostingState({
    path: '/hosting/dns',
    lite: true,
    services: [dnsService],
    handlers: dnsHandlers({ [DNS_ZONES_KEY]: { status: 500, json: { message: 'Server Error' } } }),
    ready: { legacy: alertManagerProbe.legacy, next: alertManagerProbe.next },
    pointer: 'keep',
    legacy: [page => page.locator('.alert-manager').getByText('Server Error').hover()],
    next: [page => page.getByTestId('shell-alert-manager').getByText('Server Error').hover()],
    probes: [dnsTitleProbe, dnsTableProbe, alertManagerProbe],
  }),
}

// Phase 10: the Add modal (legacy `showAddRecordModal`, `DnsActionsMixin.js:406-421`: an A record) and the Edit modal of the first row (A, type
// readonly). Both use the default answers; the fields are read by `dnsModalProbes`.
export const hostingDnsAddOpen: ParityState = {
  id: 'hosting-dns-add-open',
  ...hostingState({
    path: '/hosting/dns',
    lite: true,
    services: [dnsService],
    handlers: dnsHandlers(),
    ready: rowsReady,
    legacy: [openAdd(false)],
    next: [openAdd(true)],
    probes: dnsModalProbes,
  }),
}

// Phase 11: the Add form is submitted and the POST answers 422 (legacy `addDnsRecord`, `DnsActionsMixin.js:447`): the alert shows the
// message and the modal stays open. The alert closes itself after 5 s, so the pointer rests on its text (the toast pattern of phase 9).
const NAME_TAKEN = 'The name has already been taken.'

function hoverAlertText (next: boolean): StateAction {
  return async page => {
    const alert = next ? page.getByTestId('shell-alert-manager') : page.locator('.alert-manager')
    const text = alert.getByText(NAME_TAKEN)
    await expect(text).toBeVisible()
    await text.hover()
  }
}

export const hostingDnsAddError: ParityState = {
  id: 'hosting-dns-add-error',
  ...hostingState({
    path: '/hosting/dns',
    lite: true,
    services: [dnsService],
    handlers: dnsHandlers({
      [DNS_POST_KEY]: { status: 422, json: { message: NAME_TAKEN, errors: { name: [NAME_TAKEN] } } },
    }),
    ready: rowsReady,
    pointer: 'keep',
    legacy: [openAdd(false), fillAddForm(false), pressSubmit(false), hoverAlertText(false)],
    next: [openAdd(true), fillAddForm(true), pressSubmit(true), hoverAlertText(true)],
    probes: [dnsModalProbe, dnsModalTitleProbe, dnsModalSubmitProbe, alertManagerProbe],
  }),
}

export const hostingDnsEditOpen: ParityState = {
  id: 'hosting-dns-edit-open',
  ...hostingState({
    path: '/hosting/dns',
    lite: true,
    services: [dnsService],
    handlers: dnsHandlers(),
    ready: rowsReady,
    legacy: [openRowModal(false, 0)],
    next: [openRowModal(true, 0)],
    probes: dnsModalProbes,
  }),
}

// Phase 12: the proxy-off icon of the first proxiable row (AAAA, line 2) is clicked; the proxy warning opens with the enable button first and
// Cancel second (legacy `showProxyCloudflareWarningModal`, `Dns.vue:448-486`). The proxy handlers answer `allow_proxy: true`.
export const hostingDnsProxyWarningOpen: ParityState = {
  id: 'hosting-dns-proxy-warning-open',
  ...hostingState({
    path: '/hosting/dns',
    lite: true,
    services: [dnsService],
    handlers: dnsProxyHandlers(),
    ready: rowsReady,
    legacy: [openProxyWarning(false)],
    next: [openProxyWarning(true)],
    probes: dnsProxyWarningProbes,
  }),
}

// Phase 13: no zones at all (`zones: []`): the table shows the full-screen empty message (legacy `Dns.vue:143-152`), Add stays.
export const hostingDnsEmpty: ParityState = {
  id: 'hosting-dns-empty',
  ...hostingState({
    path: '/hosting/dns',
    lite: true,
    services: [dnsService],
    handlers: dnsHandlers({ [DNS_ZONES_KEY]: { json: { data: [] } } }),
    ready: { legacy: dnsEmptyProbe.legacy, next: dnsEmptyProbe.next },
    probes: [dnsTitleProbe, dnsTableProbe, dnsEmptyProbe],
  }),
}

// Phase 13: a search term that matches no record: the table shows `NoResults` with Clear filter. `listSearch` types the term and steps the
// clock until the message renders (legacy's lodash debounce, the pattern of `cron-no-results`).
export const hostingDnsNoResults: ParityState = {
  id: 'hosting-dns-no-results',
  ...hostingState({
    path: '/hosting/dns',
    lite: true,
    services: [dnsService],
    handlers: dnsHandlers(),
    ready: rowsReady,
    legacy: [listSearch('zzz-no-such-record')],
    next: [listSearch('zzz-no-such-record')],
    probes: [dnsTitleProbe, dnsSearchProbe, dnsTableProbe, dnsNoResultsProbe],
  }),
}

// Phase 13: the provider has no record types (`record-types: []`): the warning alert shows under the title row and Add is hidden.
export const hostingDnsCannotManage: ParityState = {
  id: 'hosting-dns-cannot-manage',
  ...hostingState({
    path: '/hosting/dns',
    lite: true,
    services: [dnsService],
    handlers: dnsHandlers({ [DNS_TYPES_KEY]: { json: { data: [] } } }),
    ready: rowsReady,
    legacy: [waitFor(dnsCannotManageProbe.legacy)],
    next: [waitFor(dnsCannotManageProbe.next)],
    probes: [dnsTitleProbe, dnsSearchProbe, dnsCannotManageProbe, dnsTableProbe],
  }),
}

// Phase 14: the records request is held, so the table shows its skeleton (`data-table--loading`); the zone select and Add stay hidden
// (legacy `Dns.vue:314,378`, next `DnsView.vue` `v-if="!records.loading"`). The readiness anchor is the skeleton.
export const hostingDnsLoading: ParityState = {
  id: 'hosting-dns-loading',
  ...hostingState({
    path: '/hosting/dns',
    lite: true,
    services: [dnsService],
    handlers: dnsHandlers({ [DNS_RECORDS_KEY]: 'hold' }),
    ready: { legacy: dnsLoadingProbe.legacy, next: dnsLoadingProbe.next },
    probes: [dnsTitleProbe, dnsTableProbe, dnsLoadingProbe],
  }),
}

// Phase 14: the Add form is submitted and the POST is held: the submit button shows its spinner (legacy `submitting` on the `BasicModal`).
// The spinner is masked on both sides, so only the button box and the modal are compared; the submit delta in loading is an exception (phase 16).
export const hostingDnsSaveLoading: ParityState = {
  id: 'hosting-dns-save-loading',
  ...hostingState({
    path: '/hosting/dns',
    lite: true,
    services: [dnsService],
    handlers: dnsHandlers({ [DNS_POST_KEY]: 'hold' }),
    ready: rowsReady,
    legacy: [openAdd(false), fillAddForm(false), pressSubmit(false), waitForSubmitSpinner(false)],
    next: [openAdd(true), fillAddForm(true), pressSubmit(true), waitForSubmitSpinner(true)],
    masks: {
      legacy: [(page: Page) => dnsModalSubmitProbe.legacy(page).locator('.v-progress-circular')],
      next: [(page: Page) => dnsModalSubmitProbe.next(page).locator('.v-progress-circular')],
    },
    probes: [dnsModalProbe, dnsModalTitleProbe, dnsModalSubmitProbe],
  }),
}

// Two server accounts: the account selector sits in the title row next to the zone select (legacy `Dns.vue:75-80`).
export const hostingDnsAccounts: ParityState = {
  id: 'hosting-dns-accounts',
  ...hostingState({
    path: '/hosting/dns',
    lite: true,
    services: [hostingService({ dns_server_enabled: true, server_accounts: [serverAccount(), serverAccount({ id: 12, domain: 'second.example.com', username: 'second' })] })],
    handlers: dnsHandlers(),
    ready: rowsReady,
    probes: [...dnsDefaultProbes, dnsSelectorProbe],
  }),
}

// Diagnostic mode: no zone select and no record table, the filters stay (legacy `Dns.vue:56,121`). Ready on the search filter.
export const hostingDnsDiagnostic: ParityState = {
  id: 'hosting-dns-diagnostic',
  ...hostingState({
    path: '/hosting/dns',
    lite: true,
    services: [hostingService({ dns_server_enabled: true, server_accounts: [serverAccount({ diagnostic_mode: true })] })],
    handlers: dnsHandlers(),
    ready: { legacy: dnsSearchProbe.legacy, next: dnsSearchProbe.next },
    probes: [dnsTitleProbe, dnsSearchProbe, dnsAddProbe],
  }),
}

const states: ParityState[] = [
  hostingDns,
  hostingDnsProxy,
  hostingDnsAddHover,
  hostingDnsRowHover,
  hostingDnsAddFocus,
  hostingDnsDeleteOpen,
  hostingDnsError,
  hostingDnsAddOpen,
  hostingDnsAddError,
  hostingDnsEditOpen,
  hostingDnsProxyWarningOpen,
  hostingDnsEmpty,
  hostingDnsNoResults,
  hostingDnsCannotManage,
  hostingDnsLoading,
  hostingDnsSaveLoading,
  hostingDnsAccounts,
  hostingDnsDiagnostic,
]

// Variants a state cannot be reached in: the row's Edit icon is in the mobile card, not in `.actions-row`, so the row hover has no target there.
// The proxy icon is in the desktop row only (no proxy column in the mobile card), so the proxy warning cannot be opened there either.
const notInVariant: Record<string, string[]> = {
  [hostingDnsRowHover.id]: ['light-mobile'],
  [hostingDnsProxyWarningOpen.id]: ['light-mobile'],
}

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    test.skip(notInVariant[state.id]?.includes(testInfo.project.name) ?? false, 'the row icons sit in the card on mobile')
    await runState(browser, testInfo, state)
  })
}
