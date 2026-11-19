import type { ParityState } from './state'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { buttonFocusState, buttonHoverState } from './auth'
import { waitFor } from './hosting'
import { CDN_API, CDN_DEFAULT_BASE, CDN_STATUS_EMPTY, CDN_STATUS_UNDER_ATTACK, cdnCardsReady, cdnDefaultProbes, cdnDisabledCardsReady, cdnDisabledHandlers, cdnDisabledProbes, cdnEmptyCardsReady, cdnEmptyProbes, cdnErrorAlert, cdnHandlers, cdnLoadingCardsReady, cdnLoadingProbes, cdnPurgeErrorProbes, cdnPurgeFailureHandler, cdnPurgeLoadingProbes, cdnPurgeModalProbes, cdnPurgePending, cdnUnderAttackErrorProbes, cdnUnderAttackFailureHandler, cdnUnderAttackOnProbes, clickUnderAttackSwitch, confirmPurge, holdCdnErrorAlert, openPurgeModal, waitForPurgeModal, waitForPurgeModalClosed } from './instance-cdn'

// S-93 ui-instance-cdn: the CDN page of a project, measured on app-lite (`target: 'lite'`, M-2 default). Each state id is a literal
// `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text. Builder and probes: `instance-cdn.ts`.

// Default: a plan with a CDN, Under Attack off, the three features listed. Phase 5 is the first state; the others follow in their phases.
export const instanceCdnDefault: ParityState = {
  ...CDN_DEFAULT_BASE,
  id: 'instance-cdn-default',
  target: 'lite',
  handlers: cdnHandlers(),
  actions: cdnCardsReady,
  probes: cdnDefaultProbes,
}

// Phase 6: hover of the Purge button of the Purge card (`buttonHoverState`: the pointer rests on it after the capture). The card sits below
// the fold on narrow variants, so the scroll is kept (as `instance-cloudflare-hover`). The literal `id` line keeps the state visible to
// `registeredStates`. The Under Attack switch has no hover in either app (`pointer-events: none`), so it is not measured here.
export const instanceCdnHover: ParityState = {
  ...buttonHoverState(instanceCdnDefault, 'instance-cdn-hover', 'button.purge', 'lite'),
  id: 'instance-cdn-hover',
  keepScroll: true,
}

// Phase 6: keyboard focus of the Purge button (`buttonFocusState`: no Tab, the programmatic focus counts as `:focus-visible`). The literal
// `id` line keeps the state visible to `registeredStates`. The switch is not focusable in either app (a `div` with a click handler).
export const instanceCdnFocus: ParityState = {
  ...buttonFocusState(instanceCdnDefault, 'instance-cdn-focus', 'button.purge', 'lite'),
  id: 'instance-cdn-focus',
}

// Phase 7: a plan without a CDN (`provider_slug: 'none'`). Both cards stay, disabled (the Purge button, the switch); the features card and
// the status request are absent on both apps. The literal `id` line keeps the state visible to `registeredStates`. The Under Attack
// switch's dimming (V4 `opacity: .38`, V2 none) is a delta measured in phase 13, not fixed here.
export const instanceCdnDisabled: ParityState = {
  ...CDN_DEFAULT_BASE,
  id: 'instance-cdn-disabled',
  target: 'lite',
  handlers: cdnDisabledHandlers(),
  actions: cdnDisabledCardsReady,
  probes: cdnDisabledProbes,
}

// Phase 9: the plan has a CDN and the status answers with no features. The features card keeps its title and an empty list. The status
// failure (`CDN:159-162`) gives the same render, so it is not a state of its own. The literal `id` line keeps the state visible to `registeredStates`.
export const instanceCdnEmpty: ParityState = {
  ...CDN_DEFAULT_BASE,
  id: 'instance-cdn-empty',
  target: 'lite',
  handlers: cdnHandlers({ [`GET ${CDN_API}/status`]: { json: CDN_STATUS_EMPTY } }),
  actions: cdnEmptyCardsReady,
  probes: cdnEmptyProbes,
}

// Phase 10 (a): the status GET is held, so the Purge and Under Attack cards stay skeletons and the features card shows its empty list
// (`CDN:13,43`, `CDN:65`). The literal `id` line keeps the state visible to `registeredStates`.
export const instanceCdnLoading: ParityState = {
  ...CDN_DEFAULT_BASE,
  id: 'instance-cdn-loading',
  target: 'lite',
  handlers: cdnHandlers({ [`GET ${CDN_API}/status`]: 'hold' }),
  actions: cdnLoadingCardsReady,
  probes: cdnLoadingProbes,
}

// Phase 10 (b): the purge POST is held. The dialog stays open and persistent, its submit button and the card's Purge button show a loader.
// The loader is the readiness anchor (`cdnPurgePending`). The literal `id` line keeps the state visible to `registeredStates`.
export const instanceCdnPurgeLoading: ParityState = {
  ...CDN_DEFAULT_BASE,
  id: 'instance-cdn-purge-loading',
  target: 'lite',
  handlers: cdnHandlers({ [`POST ${CDN_API}/purge`]: 'hold' }),
  actions: {
    legacy: [...cdnCardsReady.legacy, openPurgeModal('legacy'), waitForPurgeModal, confirmPurge(), cdnPurgePending],
    next: [...cdnCardsReady.next, openPurgeModal('next'), waitForPurgeModal, confirmPurge(), cdnPurgePending],
  },
  probes: cdnPurgeLoadingProbes,
}

// Phase 8 (a): Purge answers 500. The modal closes anyway (`CdnView.vue` `finally`), the error alert shows, no dialog stays and the button has
// no loader. The alert closes itself after 5 s, so the state holds it with a hover (lessons, "Toast z timerem") and keeps the pointer there.
// The alert is checked to be visible after the capture on both sides. The literal `id` line keeps the state visible to `registeredStates`.
export const instanceCdnError: ParityState = {
  ...instanceCdnDefault,
  id: 'instance-cdn-error',
  pointer: 'keep',
  handlers: cdnHandlers(cdnPurgeFailureHandler),
  actions: {
    legacy: [...cdnCardsReady.legacy, openPurgeModal('legacy'), waitForPurgeModal, confirmPurge(), waitForPurgeModalClosed, waitFor(cdnErrorAlert), holdCdnErrorAlert],
    next: [...cdnCardsReady.next, openPurgeModal('next'), waitForPurgeModal, confirmPurge(), waitForPurgeModalClosed, waitFor(cdnErrorAlert), holdCdnErrorAlert],
  },
  probes: cdnPurgeErrorProbes,
  afterCapture: {
    legacy: [async page => {
      await expect(cdnErrorAlert(page), 'Harness error: legacy purge alert closed during capture').toBeVisible()
    }],
    next: [async page => {
      await expect(cdnErrorAlert(page), 'Harness error: next purge alert closed during capture').toBeVisible()
    }],
  },
}

// Phase 8 (b): the under-attack POST answers 422. The switch stays OFF with no loader (the view flips it only after the server accepts), and
// the error alert shows. Held and captured as the purge error. The literal `id` line keeps the state visible to `registeredStates`.
export const instanceCdnUnderAttackError: ParityState = {
  ...instanceCdnDefault,
  id: 'instance-cdn-under-attack-error',
  pointer: 'keep',
  handlers: cdnHandlers(cdnUnderAttackFailureHandler),
  actions: {
    legacy: [...cdnCardsReady.legacy, clickUnderAttackSwitch(), waitFor(cdnErrorAlert), holdCdnErrorAlert],
    next: [...cdnCardsReady.next, clickUnderAttackSwitch(), waitFor(cdnErrorAlert), holdCdnErrorAlert],
  },
  probes: cdnUnderAttackErrorProbes,
  afterCapture: {
    legacy: [async page => {
      await expect(cdnErrorAlert(page), 'Harness error: legacy under-attack alert closed during capture').toBeVisible()
    }],
    next: [async page => {
      await expect(cdnErrorAlert(page), 'Harness error: next under-attack alert closed during capture').toBeVisible()
    }],
  },
}

// Phase 11: the status answers with Under Attack on. The switch is ON (track in the primary colour, white thumb), the rest of the page is the
// default. The literal `id` line keeps the state visible to `registeredStates`.
export const instanceCdnUnderAttack: ParityState = {
  ...CDN_DEFAULT_BASE,
  id: 'instance-cdn-under-attack',
  target: 'lite',
  handlers: cdnHandlers({ [`GET ${CDN_API}/status`]: { json: CDN_STATUS_UNDER_ATTACK } }),
  actions: cdnCardsReady,
  probes: cdnUnderAttackOnProbes,
}

// Phase 12: Purge opens the modal with nothing held (the default of the dialog). Opened by `evaluate` (no scroll, lesson "Modal w stanie
// parity"), then the box is waited for. The literal `id` line keeps the state visible to `registeredStates`.
export const instanceCdnPurgeModal: ParityState = {
  ...instanceCdnDefault,
  id: 'instance-cdn-purge-modal',
  actions: {
    legacy: [...cdnCardsReady.legacy, openPurgeModal('legacy'), waitForPurgeModal],
    next: [...cdnCardsReady.next, openPurgeModal('next'), waitForPurgeModal],
  },
  probes: cdnPurgeModalProbes,
}

const states: ParityState[] = [instanceCdnDefault, instanceCdnHover, instanceCdnFocus, instanceCdnDisabled, instanceCdnEmpty, instanceCdnLoading, instanceCdnPurgeLoading, instanceCdnError, instanceCdnUnderAttackError, instanceCdnUnderAttack, instanceCdnPurgeModal]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
