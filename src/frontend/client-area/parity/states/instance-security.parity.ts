import type { ParityState, Probe } from './state'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { buttonFocusState, buttonHoverState } from './auth'
import { waitFor } from './hosting'
import { INSTANCE_PAGE_DNS, INSTANCE_PAGE_PRIVILEGES } from './instance'
import { clickHttpsSwitch, clickIndexingSwitch, httpsDisabledWrapperProbe, httpsVSwitchProbe, openSharedDomainModal, openSslManage, SECURITY_DOMAIN, SECURITY_HOME, SECURITY_SHARED_INSTANCES, securityCardsContainerProbe, securityErrorAlert, securityErrorProbes, securityHandlers, securityIndexingFailureHandler, securityProbes, securitySaveFailureHandler, securitySharedModal, securitySharedModalProbes, securitySslLegacyDialog, securitySslModalHandlers, securitySslModalProbes, securitySslNextDialog, securityTitleProbe, sslCardProbe, sslManageProbe, waitForCards } from './instance-security'
import { NOW } from './shell'

// S-94 ui-instance-security: the Security page of a project, measured on app-lite (`target: 'lite'`, M-2 default). Each state id is a literal
// `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text. Builder and probes: `instance-security.ts`.
// Plan: context/changes/ui-instance-security/plan.md ("Phase 4" and the state phases).

// Phase 4: the default state. A trusted certificate, HTTPS redirect allowed and on, indexing on (switch OFF): the three cards.
export const instanceSecurityDefault: ParityState = {
  id: 'instance-security-default',
  target: 'lite',
  path: '/projects/1/advanced/security',
  signedIn: true,
  clock: NOW,
  home: SECURITY_HOME,
  handlers: securityHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForCards,
  probes: securityProbes,
}

// Phase 5: a self-signed certificate that does not match the domain. The Engine's verdict (`status`) is set explicitly: without it the
// fallback reads the flags, and the trusted fixture would keep `status: 'trusted'`. The label turns `text-error`, the lock turns red.
export const instanceSecuritySslInvalid: ParityState = {
  id: 'instance-security-ssl-invalid',
  target: 'lite',
  path: '/projects/1/advanced/security',
  signedIn: true,
  clock: NOW,
  home: SECURITY_HOME,
  handlers: securityHandlers({
    certificate: { status: 'self_signed', self_signed: true, name_match: false },
  }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForCards,
  probes: securityProbes,
}

// Phase 6: the 7-state matrix, hover of the Manage button of the SSL card (the only button of the page). The literal `id` line keeps the
// state visible to `registeredStates` (write-report.ts reads `id: '…',` lines; the helper sets the id at runtime only). Switches have no
// hover effect in either app (`pointer-events: none` in both), so they are not measured here.
export const instanceSecurityHover: ParityState = {
  ...buttonHoverState(instanceSecurityDefault, 'instance-security-hover', 'button.manage', 'lite'),
  id: 'instance-security-hover',
}

// Phase 7: the matrix state `focus-visible` on the same Manage button, keyboard focus through `buttonFocusState` (pattern of auth.ts:357:
// the pointer is moved off, a key that moves no focus is pressed, the button is focused programmatically). Tab is not used: the helper
// documents why. Switches are not focusable in either app (zarzut 4, deferred Q5), so they are outside this state. The Manage button has
// a text name, so the missing name of the switches does not block the locator.
export const instanceSecurityFocus: ParityState = {
  ...buttonFocusState(instanceSecurityDefault, 'instance-security-focus', 'button.manage', 'lite'),
  id: 'instance-security-focus',
}

// Phase 8: HTTPS redirect not allowed (`can_https_redirect: false`): the HTTPS switch is disabled, its wrapper gets `cursor-not-allowed` and
// the `switch-container--disabled` class (ForceHttpsCard.vue:23-28). The other settings keep the default fixture.
export const instanceSecurityDisabled: ParityState = {
  id: 'instance-security-disabled',
  target: 'lite',
  path: '/projects/1/advanced/security',
  signedIn: true,
  clock: NOW,
  home: SECURITY_HOME,
  handlers: securityHandlers({ settings: { can_https_redirect: false } }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForCards,
  probes: [...securityProbes, httpsDisabledWrapperProbe, httpsVSwitchProbe],
}

// Phase 9: a pending SSL order (`ssl_order_status: 'pending'`) blocks Manage SSL: the certificate label is replaced by `PendingSslIndicator`
// and the Manage button is disabled and loading (SslCertificateCard.vue:26, :46, :63). The order is blocking, so the certificate verdict is
// set explicitly to self-signed: the order indicator is shown whatever the certificate, and the label would otherwise read `trusted`.
// The tooltip (`pending.alert`) is display none at rest and is not probed.
export const instanceSecuritySslPending: ParityState = {
  id: 'instance-security-ssl-pending',
  target: 'lite',
  path: '/projects/1/advanced/security',
  signedIn: true,
  clock: NOW,
  home: SECURITY_HOME,
  handlers: securityHandlers({
    instance: { ssl_order_status: 'pending' },
    certificate: { status: 'self_signed', self_signed: true, name_match: false },
  }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForCards,
  probes: securityProbes,
}

// Phase 10: the HTTPS redirect is off and no other project shares the domain, so the click saves at once (no shared-domain modal). The PUT
// answers 500: the switch goes back to OFF with no loader, and the error alert shows. The alert closes itself after 5 s, so the capture
// waits for it on both sides (`afterCapture`).
export const instanceSecurityError: ParityState = {
  id: 'instance-security-error',
  target: 'lite',
  path: '/projects/1/advanced/security',
  signedIn: true,
  clock: NOW,
  home: SECURITY_HOME,
  handlers: securityHandlers({ settings: { force_https_redirect: false } }, securitySaveFailureHandler),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [...waitForCards.legacy, clickHttpsSwitch('legacy'), waitFor(securityErrorAlert)],
    next: [...waitForCards.next, clickHttpsSwitch('next'), waitFor(securityErrorAlert)],
  },
  afterCapture: {
    legacy: [async page => {
      await expect(securityErrorAlert(page), 'Harness error: legacy error alert closed during capture').toBeVisible()
    }],
    next: [async page => {
      await expect(securityErrorAlert(page), 'Harness error: next error alert closed during capture').toBeVisible()
    }],
  },
  probes: [...securityProbes, ...securityErrorProbes],
}

// Phase 11: the indexing switch is clicked and its PUT answers 500: the switch stays OFF (no local flip on failure) and the error alert shows.
// The alert closes itself after 5 s, so the capture waits for it on both sides (`afterCapture`), as in the HTTPS error state.
export const instanceSecurityIndexingError: ParityState = {
  id: 'instance-security-indexing-error',
  target: 'lite',
  path: '/projects/1/advanced/security',
  signedIn: true,
  clock: NOW,
  home: SECURITY_HOME,
  handlers: securityHandlers({}, securityIndexingFailureHandler),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [...waitForCards.legacy, clickIndexingSwitch('legacy'), waitFor(securityErrorAlert)],
    next: [...waitForCards.next, clickIndexingSwitch('next'), waitFor(securityErrorAlert)],
  },
  afterCapture: {
    legacy: [async page => {
      await expect(securityErrorAlert(page), 'Harness error: legacy error alert closed during capture').toBeVisible()
    }],
    next: [async page => {
      await expect(securityErrorAlert(page), 'Harness error: next error alert closed during capture').toBeVisible()
    }],
  },
  probes: [...securityProbes, ...securityErrorProbes],
}

// Phase 12: no certificate installed and none detected on the domain. The SSL card keeps only its Manage button: no certificate label and
// no `SslIndicator` (the probes measure the card and the button only).
export const instanceSecurityEmpty: ParityState = {
  id: 'instance-security-empty',
  target: 'lite',
  path: '/projects/1/advanced/security',
  signedIn: true,
  clock: NOW,
  home: SECURITY_HOME,
  handlers: securityHandlers({
    settings: { certificate_installed: false, certificate: null },
    certificate: null,
  }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForCards,
  probes: [sslCardProbe, sslManageProbe],
}

// Phase 13: the project without `hosting.manage_ssl` and `wordpress.manage_search_engine_indexing`. No card renders (the page has no guard,
// Q1: as lite), so the page is the title and an empty cards container. Lite still asks for the SSL settings and the detected certificate
// and next asks for nothing (D2); the handlers stay, so legacy finds its answers. The anchor is the title: `waitForCards` waits for a third
// card that this page never shows.
const NO_SSL_NO_INDEXING_PRIVILEGES = INSTANCE_PAGE_PRIVILEGES.filter(
  privilege => privilege !== 'hosting.manage_ssl' && privilege !== 'wordpress.manage_search_engine_indexing',
)

export const instanceSecurityNoPrivileges: ParityState = {
  id: 'instance-security-no-privileges',
  target: 'lite',
  path: '/projects/1/advanced/security',
  signedIn: true,
  clock: NOW,
  home: SECURITY_HOME,
  handlers: securityHandlers({ instance: { privileges: NO_SSL_NO_INDEXING_PRIVILEGES } }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [waitFor(page => page.locator('.page-title__title'))],
    next: [waitFor(page => page.locator('.page-title__title'))],
  },
  probes: [securityTitleProbe, securityCardsContainerProbe],
}

// Phase 14: both pending requests are held: the SSL settings and the search-engine indexing answer never arrive. Next keeps the skeletons of
// the SSL and HTTPS cards until the requests end (odstępstwo 1, Q3), and the indexing card is an `AutoUpdatesCardSkeleton` on both sides.
// Lite shows the SSL and HTTPS cards with an empty `sslInfo` (switch OFF, disabled), so their probes are a structural delta, expected and
// written to exceptions.json at the parity gate (phase 17), not fixed towards lite. The cards are measured by their position (nth), since
// a skeleton has no title `h6`. The anchor is the title and the first skeleton loader.
const securityLoadingProbes: Probe[] = [
  securityTitleProbe,
  securityCardsContainerProbe,
  { key: 'card-ssl-loading', legacy: page => page.locator('.page-title + .v-container .v-card').nth(0), next: page => page.locator('.page-title + .v-container .v-card').nth(0) },
  { key: 'card-https-loading', legacy: page => page.locator('.page-title + .v-container .v-card').nth(1), next: page => page.locator('.page-title + .v-container .v-card').nth(1) },
  { key: 'card-indexing-skeleton', legacy: page => page.locator('.page-title + .v-container .v-card').nth(2), next: page => page.locator('.page-title + .v-container .v-card').nth(2) },
]

export const instanceSecurityLoading: ParityState = {
  id: 'instance-security-loading',
  target: 'lite',
  path: '/projects/1/advanced/security',
  signedIn: true,
  clock: NOW,
  home: SECURITY_HOME,
  handlers: securityHandlers({}, {
    [`GET /server-accounts/1/ssl/settings/${SECURITY_DOMAIN}`]: 'hold',
    'GET /projects/1/wordpress/search-engine-indexing': 'hold',
  }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [waitFor(page => page.locator('.page-title__title')), waitFor(page => page.locator('.v-skeleton-loader').first())],
    next: [waitFor(page => page.locator('.page-title__title')), waitFor(page => page.locator('.v-skeleton-loader').first())],
  },
  probes: securityLoadingProbes,
}

// Phase 15: the domain is shared with two other instances, so the HTTPS switch opens the warning modal instead of saving. The modal is
// measured open: `openSharedDomainModal` clicks the switch and the modal box is awaited on both sides. Confirm is not clicked (odstępstwo 2,
// Q3: lite only flips the switch; the Confirm button is probed as it stands, not pressed).
export const instanceSecuritySharedModal: ParityState = {
  id: 'instance-security-shared-modal',
  target: 'lite',
  path: '/projects/1/advanced/security',
  signedIn: true,
  clock: NOW,
  home: SECURITY_HOME,
  handlers: securityHandlers({ settings: { domain_shared_instances: SECURITY_SHARED_INSTANCES } }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [...waitForCards.legacy, openSharedDomainModal('legacy'), waitFor(securitySharedModal)],
    next: [...waitForCards.next, openSharedDomainModal('next'), waitFor(securitySharedModal)],
  },
  probes: [...securityProbes, ...securitySharedModalProbes],
}

// Phase 16: Manage opens `SslEditModal` (lite): the SSL card's Manage button is clicked (evaluate) and the modal is awaited on both sides.
// Only the default page is measured (the modal's own error belongs to the SSL kit). Handlers: `securitySslModalHandlers` (offers, installed).
export const instanceSecuritySslModal: ParityState = {
  id: 'instance-security-ssl-modal',
  target: 'lite',
  path: '/projects/1/advanced/security',
  signedIn: true,
  clock: NOW,
  home: SECURITY_HOME,
  handlers: securityHandlers({}, securitySslModalHandlers),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [...waitForCards.legacy, openSslManage('legacy'), waitFor(securitySslLegacyDialog)],
    next: [...waitForCards.next, openSslManage('next'), waitFor(securitySslNextDialog)],
  },
  probes: [...securityProbes, ...securitySslModalProbes],
}

const states: ParityState[] = [
  instanceSecurityDefault,
  instanceSecuritySslInvalid,
  instanceSecurityEmpty,
  instanceSecurityHover,
  instanceSecurityFocus,
  instanceSecurityDisabled,
  instanceSecuritySslPending,
  instanceSecurityError,
  instanceSecurityIndexingError,
  instanceSecurityNoPrivileges,
  instanceSecurityLoading,
  instanceSecuritySharedModal,
  instanceSecuritySslModal,
]

/**
 * Hover is measured on desktop only (precedent: `instance-backups.parity.ts`). On mobile there is no pointer hover, and the helper's
 * `:hover` check failed: the label bug of legacy (see exceptions.json) lowers the Manage button by 34px in next, under the fixed "Add Project" FAB.
 */
const desktopOnlyStates = new Set([instanceSecurityHover.id])

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    test.skip(desktopOnlyStates.has(state.id) && testInfo.project.name.endsWith('mobile'), 'no pointer hover on mobile; the FAB covers the lowered Manage button')
    await runState(browser, testInfo, state)
  })
}
