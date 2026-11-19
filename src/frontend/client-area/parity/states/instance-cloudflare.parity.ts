import type { ParityState, StateAction } from './state'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { buttonFocusState, buttonHoverState } from './auth'
import { waitFor } from './hosting'
import { clickDevelopmentSwitch, CLOUDFLARE_API, CLOUDFLARE_DNS, CLOUDFLARE_PATH, cloudflareCardsReady, cloudflareDefaultProbes, cloudflareDevelopmentFailureHandler, cloudflareErrorAlert, cloudflareErrorProbes, cloudflareHandlers, cloudflareLoadingProbes, cloudflarePurgeErrorProbes, cloudflarePurgeFailureHandler, cloudflarePurgeModalProbes, cloudflareSecurityMenuProbes, cloudflareSwitchBusyProbes, cloudflareWrongDnsCardsReady, cloudflareWrongDnsHoverProbes, cloudflareWrongDnsProbes, confirmPurge, expectDevelopmentSwitchBusy, openPurgeModal, openSecurityMenu, statusBadge, waitForPurgeModal, waitForPurgeModalClosed, WRONG_DNS } from './instance-cloudflare'
import { liteShellHome } from './instances'
import { NOW } from './shell'

// S-91 ui-instance-cloudflare: the Cloudflare page of a project, measured on app-lite (`target: 'lite'`, M-2 default). Each state id is a
// literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text. Builder and probes: `instance-cloudflare.ts`.

// Default: Active (the nameservers are Cloudflare's), development mode off, browser check on, security level medium.
export const instanceCloudflareDefault: ParityState = {
  id: 'instance-cloudflare-default',
  target: 'lite',
  path: CLOUDFLARE_PATH,
  signedIn: true,
  clock: NOW,
  home: liteShellHome(),
  handlers: cloudflareHandlers(),
  external: { 'dns.google': CLOUDFLARE_DNS },
  actions: cloudflareCardsReady,
  probes: cloudflareDefaultProbes,
}

// Empty replacement (the matrix marks `empty` N/A: the page has no collection). The domain answers with its A record only, no Cloudflare
// nameservers, so the badge reads "Wrong DNS" and carries its hover menu (`CloudflareView.vue`, the `v-menu` of the status column).
export const instanceCloudflareWrongDns: ParityState = {
  id: 'instance-cloudflare-wrong-dns',
  target: 'lite',
  path: CLOUDFLARE_PATH,
  signedIn: true,
  clock: NOW,
  home: liteShellHome(),
  handlers: cloudflareHandlers(),
  external: { 'dns.google': WRONG_DNS },
  actions: cloudflareWrongDnsCardsReady,
  probes: cloudflareWrongDnsProbes,
}

// Phase 7: hover of the Manage Records button of the Manage card (the only button of the card). The literal `id` line keeps the state
// visible to `registeredStates` (write-report.ts reads `id: '…',` lines; the helper sets the id at runtime only). The two switches have no
// hover effect in either app (`pointer-events: none`), so they are not measured here.
export const instanceCloudflareHover: ParityState = {
  ...buttonHoverState(instanceCloudflareDefault, 'instance-cloudflare-hover', 'button.cloudflare.manage', 'lite'),
  id: 'instance-cloudflare-hover',
  // The button sits in the Manage card, below the fold on narrow variants: the scroll is kept so the pointer stays on it (as `instance-wordpress-mcp-hover`).
  keepScroll: true,
}

// Phase 8: hover of the Wrong DNS badge, which opens its nameserver menu (`open-delay` 150 ms). The action waits for the list before the
// probes; the pointer must still rest on the badge after the capture (`afterCapture`), or the menu could close unnoticed. The literal `id`
// line keeps the state visible to `registeredStates`.
function hoverWrongDnsBadge (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await statusBadge(page, app, 'wrong-dns').hover()
    await page.locator(app === 'legacy' ? '.menuable__content__active ul li' : '.v-overlay--active .v-overlay__content ul li').first().waitFor({ state: 'visible', timeout: 10_000 })
  }
}

function stillHoveredWrongDnsBadge (app: 'legacy' | 'next'): StateAction {
  return async page => {
    expect(await statusBadge(page, app, 'wrong-dns').evaluate(element => element.matches(':hover')), 'pointer on the badge').toBe(true)
  }
}

export const instanceCloudflareWrongDnsHover: ParityState = {
  ...instanceCloudflareWrongDns,
  id: 'instance-cloudflare-wrong-dns-hover',
  pointer: 'keep',
  // The badge sits below the fold on narrow variants: the scroll is kept so the pointer stays on it.
  keepScroll: true,
  actions: {
    legacy: [...cloudflareWrongDnsCardsReady.legacy, hoverWrongDnsBadge('legacy')],
    next: [...cloudflareWrongDnsCardsReady.next, hoverWrongDnsBadge('next')],
  },
  probes: cloudflareWrongDnsHoverProbes,
  afterCapture: {
    legacy: [stillHoveredWrongDnsBadge('legacy')],
    next: [stillHoveredWrongDnsBadge('next')],
  },
}

// Phase 9: keyboard focus of the Manage Records button (`buttonFocusState`: no Tab, the programmatic focus counts as `:focus-visible`).
// The literal `id` line keeps the state visible to `registeredStates`. The two switches are not focusable in either app (a `div` with a
// click handler), so they are not measured here.
export const instanceCloudflareFocus: ParityState = {
  ...buttonFocusState(instanceCloudflareDefault, 'instance-cloudflare-focus', 'button.cloudflare.manage', 'lite'),
  id: 'instance-cloudflare-focus',
}

// Phase 10: the click on the development switch sends its PATCH, held, so the switch is `loading` (busy) and its input disabled. The literal
// `id` line keeps the state visible to `registeredStates`. The matrix's `disabled` is N/A: the switch has `:loading` and no `:disabled`.
export const instanceCloudflareSwitchBusy: ParityState = {
  ...instanceCloudflareDefault,
  id: 'instance-cloudflare-switch-busy',
  handlers: cloudflareHandlers({ [`PATCH ${CLOUDFLARE_API}/development-mode`]: 'hold' }),
  actions: {
    legacy: [...cloudflareCardsReady.legacy, clickDevelopmentSwitch(), expectDevelopmentSwitchBusy('legacy')],
    next: [...cloudflareCardsReady.next, clickDevelopmentSwitch(), expectDevelopmentSwitchBusy('next')],
  },
  probes: cloudflareSwitchBusyProbes,
}

// Phase 11: the development-mode PATCH answers 500: the switch stays OFF with no loader (no local flip on failure) and the error alert shows.
// The alert closes itself after 5 s, so the capture waits for it on both sides (`afterCapture`), as in the Security error states. The literal
// `id` line keeps the state visible to `registeredStates`.
export const instanceCloudflareError: ParityState = {
  ...instanceCloudflareDefault,
  id: 'instance-cloudflare-error',
  handlers: cloudflareHandlers(cloudflareDevelopmentFailureHandler),
  actions: {
    legacy: [...cloudflareCardsReady.legacy, clickDevelopmentSwitch(), waitFor(cloudflareErrorAlert)],
    next: [...cloudflareCardsReady.next, clickDevelopmentSwitch(), waitFor(cloudflareErrorAlert)],
  },
  probes: cloudflareErrorProbes,
  afterCapture: {
    legacy: [async page => {
      await expect(cloudflareErrorAlert(page), 'Harness error: legacy error alert closed during capture').toBeVisible()
    }],
    next: [async page => {
      await expect(cloudflareErrorAlert(page), 'Harness error: next error alert closed during capture').toBeVisible()
    }],
  },
}

// Phase 12: the three settings GETs are held, so the five cards stay skeletons. The readiness anchor is the title and the first skeleton
// bone; the skeleton animates, so no mask is set here (the mask is added only if the measurement needs it). The literal `id` line keeps the
// state visible to `registeredStates`.
export const instanceCloudflareLoading: ParityState = {
  ...instanceCloudflareDefault,
  id: 'instance-cloudflare-loading',
  handlers: cloudflareHandlers({
    [`GET ${CLOUDFLARE_API}/development-mode`]: 'hold',
    [`GET ${CLOUDFLARE_API}/browser-check`]: 'hold',
    [`GET ${CLOUDFLARE_API}/security`]: 'hold',
  }),
  actions: {
    legacy: [waitFor(page => page.locator('.page-title__title')), waitFor(page => page.locator('.v-skeleton-loader').first())],
    next: [waitFor(page => page.locator('.page-title__title')), waitFor(page => page.locator('.v-skeleton-loader').first())],
  },
  probes: cloudflareLoadingProbes,
}

// Phase 13: the Purge button of the Cache card opens the purge modal (`BasicModal`, icon `$restore`, Purge Everything and Cancel). Measured
// open: `openPurgeModal` clicks the button and `waitForPurgeModal` waits for the box to settle on both sides. Purge is not clicked (no POST).
// Only the dialog's probes are read. The literal `id` line keeps the state visible to `registeredStates`.
export const instanceCloudflarePurgeModal: ParityState = {
  ...instanceCloudflareDefault,
  id: 'instance-cloudflare-purge-modal',
  actions: {
    legacy: [...cloudflareCardsReady.legacy, openPurgeModal('legacy'), waitForPurgeModal],
    next: [...cloudflareCardsReady.next, openPurgeModal('next'), waitForPurgeModal],
  },
  probes: cloudflarePurgeModalProbes,
}

// Phase 14: Purge Everything answers 500: the modal closes anyway (legacy `finally`), and the error alert shows. The alert closes itself after
// 5 s, so the capture waits for it on both sides (`afterCapture`), as in the error state. The literal `id` line keeps the state visible to
// `registeredStates`.
export const instanceCloudflarePurgeError: ParityState = {
  ...instanceCloudflareDefault,
  id: 'instance-cloudflare-purge-error',
  handlers: cloudflareHandlers(cloudflarePurgeFailureHandler),
  actions: {
    legacy: [...cloudflareCardsReady.legacy, openPurgeModal('legacy'), waitForPurgeModal, confirmPurge(), waitForPurgeModalClosed, waitFor(cloudflareErrorAlert)],
    next: [...cloudflareCardsReady.next, openPurgeModal('next'), waitForPurgeModal, confirmPurge(), waitForPurgeModalClosed, waitFor(cloudflareErrorAlert)],
  },
  probes: cloudflarePurgeErrorProbes,
  afterCapture: {
    legacy: [async page => {
      await expect(cloudflareErrorAlert(page), 'Harness error: legacy purge alert closed during capture').toBeVisible()
    }],
    next: [async page => {
      await expect(cloudflareErrorAlert(page), 'Harness error: next purge alert closed during capture').toBeVisible()
    }],
  },
}

// Phase 15: the security level select opens its menu of six options, `medium` selected. The literal `id` line keeps the state visible to
// `registeredStates`. The menu is read on its own probes; the pixel capture waits for it to settle (`openSecurityMenu`).
export const instanceCloudflareSecurityMenu: ParityState = {
  ...instanceCloudflareDefault,
  id: 'instance-cloudflare-security-menu',
  actions: {
    legacy: [...cloudflareCardsReady.legacy, openSecurityMenu('legacy')],
    next: [...cloudflareCardsReady.next, openSecurityMenu('next')],
  },
  probes: cloudflareSecurityMenuProbes,
}

const states: ParityState[] = [instanceCloudflareDefault, instanceCloudflareWrongDns, instanceCloudflareHover, instanceCloudflareWrongDnsHover, instanceCloudflareFocus, instanceCloudflareSwitchBusy, instanceCloudflareError, instanceCloudflareLoading, instanceCloudflarePurgeModal, instanceCloudflarePurgeError, instanceCloudflareSecurityMenu]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
