import type { ParityState, Probe, StateAction } from './state'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { buttonFocusState, buttonHoverState, settled, tr } from './auth'
import {
  alertManagerProbe,
  allHostingPrivileges,
  GB,
  hostingService,
  hostingState,
  instanceItem,
  instancesBody,
  nsSpinnerMasks,
  serverAccount,
  summaryChipProbe,
  summaryEmptyAddProbe,
  summaryEmptyProbe,
  summaryInstancesCardProbe,
  summaryLoadMoreProbe,
  summaryNsCardProbe,
  summaryNsSpinnerProbe,
  summaryPlanProbe,
  summaryRightColumnProbe,
  summaryRowAvatarProbe,
  summaryRowProbe,
  summaryRowSharesProbe,
  summaryRowSuspendedProbe,
  summarySelectorProbe,
  summarySsoIconProbe,
  summarySsoProbe,
  summaryTitleProbe,
  threeInstances,
  usageBody,
  usageMixed,
  whenVisible,
} from './hosting'
import { openLegacyMenu } from './shell'

// Stany ramy z S-30 nazywają się `hosting-summary-*` od S-114 (dawne: hosting-suspended, hosting-frame-plans, hosting-frame-plans-open, hosting-frame-email-dot; archiwum M-1 bez zmian).
// S-30 hosting-summary: the hosting frame (`/hosting/` -> `/hosting/summary`, sidebar, plan selector, suspended view) and the Summary screen.
// Builder and fixtures: `hosting.ts`. Each state id is a literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text.
// Plan: context/changes/hosting-summary/plan.md ("Stany parity").

/**
 * S-114 (ui-hosting-summary): every state of this spec is measured on app-lite with the multi-server-style `/home`
 * (`lite: 'multi'`): the Summary route then does not redirect to Usage. Target `lite` comes from the builder.
 */
const summaryState = (options: Parameters<typeof hostingState>[0] = {}) => hostingState({ lite: 'multi', ...options })

// ---------------------------------------------------------------------------------------------
// Phase 1: frame
// ---------------------------------------------------------------------------------------------

export const hostingSuspended: ParityState = {
  id: 'hosting-summary-suspended',
  ...summaryState({
    services: [hostingService({ status: 'suspended' })],
    home: { app: { support_link: 'https://example.com/support' } },
    frame: false,
    probes: [
      {
        key: 'suspended-card',
        legacy: page => page.locator('.v-main .intro-page'),
        next: page => page.getByTestId('hosting-suspended-card'),
      },
      {
        key: 'suspended-title',
        legacy: page => page.locator('.v-main .intro-page__title'),
        next: page => page.getByTestId('hosting-suspended-card').locator('.intro-page__title'),
        internal: true,
      },
      {
        key: 'suspended-upgrade',
        legacy: page => page.getByRole('link', { name: tr('general.upgradePlan') }),
        next: page => page.getByTestId('hosting-suspended-upgrade'),
      },
      {
        key: 'suspended-support',
        legacy: page => page.getByRole('link', { name: tr('general.contactSupport') }),
        next: page => page.getByTestId('hosting-suspended-support'),
      },
    ],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 2: Summary without instance rows (empty list, loading, diagnostic, usage error)
// ---------------------------------------------------------------------------------------------

const summaryReady = { legacy: summaryTitleProbe.legacy, next: summaryTitleProbe.next }
const instancesEmpty = { json: instancesBody([]) }

// A probe on an element both apps lack is a `missing` failure, so each state lists only what it shows.
const summaryProbesBase = [summaryTitleProbe, summaryNsCardProbe, summaryInstancesCardProbe]

export const hostingSummaryLoading: ParityState = {
  id: 'hosting-summary-loading',
  ...summaryState({
    usage: 'hold',
    instances: 'hold',
    ready: summaryReady,
    masks: nsSpinnerMasks,
    probes: [...summaryProbesBase, summaryRightColumnProbe, summaryPlanProbe('skeleton'), summaryNsSpinnerProbe, summaryChipProbe],
  }),
}

export const hostingSummaryInstancesEmpty: ParityState = {
  id: 'hosting-summary-instances-empty',
  ...summaryState({
    instances: instancesEmpty,
    ready: { legacy: summaryEmptyProbe.legacy, next: summaryEmptyProbe.next },
    probes: [...summaryProbesBase, summarySsoProbe, summaryRightColumnProbe, summaryPlanProbe('card'), summaryChipProbe, summaryEmptyProbe, summaryEmptyAddProbe],
  }),
}

// Both apps raise the error alert with `addAlert` and close it 5 s later unless the pointer is over it (legacy AlertMixin,
// next useAlertTimeout). The state hovers the text box before the capture and keeps the pointer there (lesson "Toast z timerem").
// Both apps fetch usage twice (and the diagnostic alert fires twice), so two alerts stack; only the hovered one survives its timer.
// The state waits until the unhovered one is gone, so the capture does not depend on which side is slower (S-114 phase 11).
const errorAlerts = (page: Page) => page.locator('.alert-manager .alert--error')
const errorAlert = (page: Page) => errorAlerts(page).first()

const hoverErrorAlert: StateAction = async page => {
  await settled(errorAlert(page))
  await errorAlert(page).locator('.alert__text-box').hover()
  await expect(errorAlerts(page)).toHaveCount(1, { timeout: 9000 })
}

export const hostingSummaryDiagnostic: ParityState = {
  id: 'hosting-summary-diagnostic',
  ...summaryState({
    services: [hostingService({ server_accounts: [serverAccount({ diagnostic_mode: true })] })],
    instances: instancesEmpty,
    ready: { legacy: summaryEmptyProbe.legacy, next: summaryEmptyProbe.next },
    masks: nsSpinnerMasks,
    pointer: 'keep',
    legacy: [hoverErrorAlert],
    next: [hoverErrorAlert],
    probes: [...summaryProbesBase, summaryChipProbe, summaryEmptyProbe, alertManagerProbe],
  }),
}

export const hostingSummaryUsageError: ParityState = {
  id: 'hosting-summary-usage-error',
  ...summaryState({
    usage: { status: 500, json: { message: 'Server Error' } },
    instances: instancesEmpty,
    ready: { legacy: summaryEmptyProbe.legacy, next: summaryEmptyProbe.next },
    masks: nsSpinnerMasks,
    pointer: 'keep',
    legacy: [hoverErrorAlert],
    next: [hoverErrorAlert],
    probes: [...summaryProbesBase, summaryRightColumnProbe, summaryPlanProbe('skeleton'), summaryNsSpinnerProbe, summaryChipProbe, summaryEmptyProbe, alertManagerProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 3: instance rows, plan card with data, the frame's selectors, the share modal
// ---------------------------------------------------------------------------------------------

const rowProbes = [summaryRowProbe, summaryRowAvatarProbe, summaryRowSharesProbe, summaryRowSuspendedProbe]
const fullProbes = [...summaryProbesBase, summarySsoProbe, summarySsoIconProbe, summaryRightColumnProbe, summaryPlanProbe('card'), summaryChipProbe, ...rowProbes]
const rowsReady = { legacy: summaryRowProbe.legacy, next: summaryRowProbe.next }

export const hostingSummary: ParityState = {
  id: 'hosting-summary',
  ...summaryState({
    usage: { json: usageMixed },
    instances: { json: instancesBody(threeInstances) },
    ready: rowsReady,
    probes: fullProbes,
  }),
}

const twoAccounts = hostingService({ server_accounts: [serverAccount(), serverAccount({ id: 12, domain: 'second.example.com', username: 'second' })] })

export const hostingSummaryAccounts: ParityState = {
  id: 'hosting-summary-accounts',
  ...summaryState({
    services: [twoAccounts],
    usage: { json: usageMixed },
    instances: { json: instancesBody(threeInstances) },
    ready: rowsReady,
    probes: [
      ...fullProbes,
      summarySelectorProbe,
    ],
  }),
}

const legacyAccountSelector = (page: Page) => page.locator('.v-main .acc-select-group .v-select')
const nextAccountSelector = (page: Page) => page.getByTestId('summary-account-selector').locator('.v-field')
const nextMenu = (page: Page) => page.locator('.v-overlay--active .v-overlay__content')

export const hostingSummaryAccountsOpen: ParityState = {
  id: 'hosting-summary-accounts-open',
  ...summaryState({
    services: [twoAccounts],
    usage: { json: usageMixed },
    instances: { json: instancesBody(threeInstances) },
    ready: rowsReady,
    pointer: 'keep',
    legacy: [openLegacyMenu(legacyAccountSelector)],
    next: [async page => {
      await whenVisible(nextAccountSelector(page), async () => {
        await nextAccountSelector(page).click()
        await settled(nextMenu(page))
      })
    }],
    probes: [
      ...fullProbes,
      summarySelectorProbe,
      { key: 'selector-menu', legacy: page => page.locator('.menuable__content__active'), next: nextMenu },
    ],
  }),
}

const limitedPrivileges = allHostingPrivileges.filter(privilege => !['hosting.control_panel_sso', 'hosting.manage_ftp', 'hosting.manage_mysql'].includes(privilege))

export const hostingSummaryLimited: ParityState = {
  id: 'hosting-summary-limited',
  ...summaryState({
    services: [hostingService({
      privileges: limitedPrivileges,
      plan_upgrade_link: null,
      instances_count: 3,
      plan_settings: { instance_limit: null, dns_management_enabled: true },
      server_accounts: [serverAccount({ privileges: limitedPrivileges })],
    })],
    usage: {
      json: usageBody({
        data: {
          disk_usage: { usage: GB, maximum: null },
          bandwidth: { usage: 2 * GB, maximum: null },
          ftp_accounts: { usage: 1, maximum: 10 },
          email_accounts: { usage: 4, maximum: null },
        },
        supported: { email_accounts: true },
      }),
    },
    instances: { json: instancesBody(threeInstances) },
    ready: rowsReady,
    probes: [...summaryProbesBase, summaryRightColumnProbe, summaryPlanProbe('card'), summaryChipProbe, ...rowProbes],
  }),
}

export const hostingSummaryLoadMore: ParityState = {
  id: 'hosting-summary-load-more',
  ...summaryState({
    usage: { json: usageMixed },
    instances: { json: instancesBody([101, 102, 103, 104, 105].map(id => instanceItem(id)), 12) },
    ready: rowsReady,
    probes: [...fullProbes.filter(probe => !['summary-instance-shares', 'summary-instance-suspended'].includes(probe.key)), summaryLoadMoreProbe],
  }),
}

const legacyShareChip = (page: Page) => page.locator('.v-main a.instance').nth(1).locator('.v-chip')
const nextShareChip = (page: Page) => page.getByTestId('summary-instance-row').nth(1).getByTestId('shares-label')

export const hostingSummaryShareOpen: ParityState = {
  id: 'hosting-summary-share-open',
  ...summaryState({
    usage: { json: usageMixed },
    instances: { json: instancesBody(threeInstances) },
    handlers: {
      'GET /instances/102/wordpress/users': { json: { data: [] } },
      'GET /invitation-suggestions': { json: { data: [{ name: 'Sam Smith', email: 'sam@example.com' }] } },
    },
    ready: rowsReady,
    legacy: [async page => {
      await legacyShareChip(page).click()
      await settled(page.locator('.v-dialog--active .v-card'))
    }],
    next: [async page => {
      await whenVisible(nextShareChip(page), async () => {
        await nextShareChip(page).click()
        await settled(page.getByTestId('share-modal'))
      })
    }],
    probes: [
      ...fullProbes,
      { key: 'share-modal', legacy: page => page.locator('.v-dialog--active .v-card'), next: page => page.getByTestId('share-modal') },
    ],
  }),
}

const plans = [
  hostingService(),
  hostingService({ id: 2, domain: 'other.example.com', plan_name: 'Starter', server_accounts: [serverAccount({ id: 21, domain: 'other.example.com', service_id: 2 })] }),
]

const planSelectorProbe: Probe = {
  key: 'plan-selector',
  legacy: page => page.locator('.v-main .sticky-sidebar .v-select'),
  next: page => page.getByTestId('hosting-plan-selector'),
}

export const hostingFramePlans: ParityState = {
  id: 'hosting-summary-plans',
  ...summaryState({
    services: plans,
    usage: { json: usageMixed },
    instances: { json: instancesBody(threeInstances) },
    ready: rowsReady,
    probes: [...fullProbes, planSelectorProbe],
  }),
}

export const hostingFramePlansOpen: ParityState = {
  id: 'hosting-summary-plans-open',
  ...summaryState({
    services: plans,
    usage: { json: usageMixed },
    instances: { json: instancesBody(threeInstances) },
    ready: rowsReady,
    pointer: 'keep',
    legacy: [openLegacyMenu(page => page.locator('.v-main .sticky-sidebar .v-select'))],
    next: [async page => {
      const selector = page.getByTestId('hosting-plan-selector').locator('.v-field')
      // The page keeps re-rendering while the rows load (avatars, DNS checks); a menu opened before that settles is closed again.
      await page.waitForLoadState('networkidle')
      await whenVisible(selector, async () => {
        // The full-page screenshot resizes the window and Chromium drops focus meanwhile; V4's select closes its menu on the list's
        // `blur`, legacy's does not. Swallow both events for the capture (a real window resize never blurs the page). Installed before
        // the first click, so a focus loss while the rows still load cannot close the menu either.
        await page.evaluate(() => {
          for (const type of ['blur', 'focusout', 'resize']) {
            window.addEventListener(type, event => event.stopImmediatePropagation(), true)
          }
        })
        // A menu opened while the page was still re-rendering is closed again: open it until it stays (3 tries).
        for (let attempt = 0; attempt < 3; attempt++) {
          await selector.click()
          await page.waitForTimeout(1500)
          if (await nextMenu(page).isVisible()) {
            break
          }
        }
        await settled(nextMenu(page))
        // Under load the header avatar and the row images finish after the menu opened and the re-render closes it (S-114 phase 11,
        // 3 full-gate runs): wait until every image is loaded, then re-open the menu if it was closed meanwhile (3 rounds).
        for (let round = 0; round < 3; round++) {
          await page.waitForLoadState('networkidle')
          await page.waitForFunction(() => [...document.images].every(img => img.complete))
          await page.waitForTimeout(3000)
          if (await nextMenu(page).isVisible()) {
            break
          }
          await selector.click()
          await settled(nextMenu(page))
        }
        await page.waitForLoadState('networkidle')
        await expect(nextMenu(page), 'Harness error: the plan menu closed before the capture').toBeVisible()
      })
    }],
    probes: [
      ...fullProbes,
      planSelectorProbe,
      { key: 'plan-menu', legacy: page => page.locator('.menuable__content__active'), next: nextMenu },
    ],
  }),
}

/** The email DNS records are reported as not configured: dns.google answers a TXT that matches no record. */
export const hostingFrameEmailDot: ParityState = {
  id: 'hosting-summary-email-dot',
  ...summaryState({
    services: [hostingService({
      email_server_enabled: true,
      dns_server_enabled: true,
      plan_settings: { instance_limit: 10, dns_management_enabled: true, default_ssh_access_enabled: true, allow_user_enable_ssh_access: false },
    })],
    usage: { json: usageMixed },
    instances: { json: instancesBody(threeInstances) },
    emailDomains: {
      json: {
        data: [{
          id: 1,
          domain: 'example.com',
          dkim_records: [{ name: 'default._domainkey.example.com', value: 'v=DKIM1; p=KEY' }],
          spf_records: [{ name: 'example.com', value: 'v=spf1 include:mail.example.net -all' }],
        }],
        meta: { is_email_dns_records_showed: true },
      },
    },
    external: { 'dns.google': { json: { Status: 0, Answer: [{ type: 16, data: '"other"' }] } } },
    ready: rowsReady,
    probes: [
      ...fullProbes,
      {
        key: 'email-dot',
        legacy: page => page.locator('.v-main .sticky-sidebar .select-dot'),
        // Mobile renders the dot in the tabs, desktop in the sidebar.
        next: page => page.getByTestId('hosting-sidebar-email-dot').or(page.getByTestId('hosting-tab-email-dot')),
      },
    ],
  }),
}

// ---------------------------------------------------------------------------------------------
// S-09c phase 4: the nameserver card when the DNS check fails (dns.google has no record, so the card lists what to set)
// ---------------------------------------------------------------------------------------------

/** The first account's card: the legacy `.v-main` column, the first card of it (the next locator is the testid). */
const legacyNsCard = (page: Page) => page.locator('.v-main .container.mt-3 > .row > .col-md-6').first().locator(':scope > .v-card').first()

/** The failed-check block of the card: its message and the `DnsOptions` it renders. The state is ready when the block shows. */
const nsErrorProbe: Probe = {
  key: 'summary-ns-error',
  legacy: page => legacyNsCard(page).locator('.v-card__text'),
  next: page => page.getByTestId('summary-ns-error'),
}

const nsDnsOptionsProbe: Probe = {
  key: 'summary-ns-dns-options',
  legacy: page => legacyNsCard(page).locator('.v-expansion-panels--dns'),
  next: page => page.getByTestId('summary-ns-card').locator('.v-expansion-panels--dns'),
  internal: true,
}

export const hostingSummaryDnsFailure: ParityState = {
  id: 'hosting-summary-dns-failure',
  ...summaryState({
    // Verification methods on: the A record check runs, and `display_options` lets `DnsOptions` list the A record.
    services: [hostingService({ dns_settings: { verification_methods: ['resolve_a_record'], verification_mode: 'any', display_options: ['a_records'], valid_cname_addresses: [] } })],
    instances: instancesEmpty,
    external: { 'dns.google': { json: { Status: 3 } } },
    ready: { legacy: nsErrorProbe.legacy, next: nsErrorProbe.next },
    probes: [...summaryProbesBase, summarySsoProbe, summaryRightColumnProbe, summaryPlanProbe('card'), summaryChipProbe, summaryEmptyProbe, summaryEmptyAddProbe, nsErrorProbe, nsDnsOptionsProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 7: hover on the first instance row (`pointer: 'keep'`); the row background is in the row probe
// ---------------------------------------------------------------------------------------------

const rowHoverLegacy: StateAction = async page => {
  await summaryRowProbe.legacy(page).hover()
}

const rowHoverNext: StateAction = async page => {
  await summaryRowProbe.next(page).hover()
}

// The pointer must still rest on the row after the capture (the scroll reset before the probes can move it away), as in `hosting-usage-hover`.
const rowStillHoveredLegacy: StateAction = async page => {
  expect(await summaryRowProbe.legacy(page).evaluate(element => element.matches(':hover')), 'pointer on the first instance row').toBe(true)
}

const rowStillHoveredNext: StateAction = async page => {
  expect(await summaryRowProbe.next(page).evaluate(element => element.matches(':hover')), 'pointer on the first instance row').toBe(true)
}

export const hostingSummaryHover: ParityState = {
  ...hostingSummary,
  id: 'hosting-summary-hover',
  pointer: 'keep',
  actions: {
    legacy: [...hostingSummary.actions.legacy, rowHoverLegacy],
    next: [...hostingSummary.actions.next, rowHoverNext],
  },
  afterCapture: {
    legacy: [rowStillHoveredLegacy],
    next: [rowStillHoveredNext],
  },
}

// ---------------------------------------------------------------------------------------------
// Phase 8: hover on the SSO button "Control Panel" (`buttonHoverState`; the button is an `<a href="#">` in both apps, so role `link`)
// ---------------------------------------------------------------------------------------------

export const hostingSummarySsoHover: ParityState = {
  ...buttonHoverState(hostingSummary, 'hosting-summary-sso-hover', 'button.login.controlPanel', 'lite', 'link'),
  id: 'hosting-summary-sso-hover',
}

// ---------------------------------------------------------------------------------------------
// Phase 9: keyboard focus-visible on the SSO button "Control Panel" (`buttonFocusState`, no Tab: the helper focuses the button directly).
// The URL link of the row and the shares chip stay out of this state (one focus per state, main action of the view).
// ---------------------------------------------------------------------------------------------

export const hostingSummaryFocus: ParityState = {
  ...buttonFocusState(hostingSummary, 'hosting-summary-focus', 'button.login.controlPanel', 'lite', 'link'),
  id: 'hosting-summary-focus',
}

const states: ParityState[] = [
  hostingSuspended,
  hostingSummaryLoading,
  hostingSummaryInstancesEmpty,
  hostingSummaryDiagnostic,
  hostingSummaryUsageError,
  hostingSummary,
  hostingSummaryAccounts,
  hostingSummaryAccountsOpen,
  hostingSummaryLimited,
  hostingSummaryLoadMore,
  hostingSummaryShareOpen,
  hostingFramePlans,
  hostingFramePlansOpen,
  hostingFrameEmailDot,
  hostingSummaryDnsFailure,
  hostingSummaryHover,
  hostingSummarySsoHover,
  hostingSummaryFocus,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
