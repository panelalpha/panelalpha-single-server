import type { ParityState } from './state'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { buttonFocusState, buttonHoverState } from './auth'
import { waitFor } from './hosting'
import { INSTANCE_PAGE_DNS } from './instance'
import { ADVANCED_PROJECT_ID } from './instance-advanced-frame'
import {
  clickEdgeCacheSwitch,
  confirmEdgeCachePurge,
  EDGE_CACHE_API,
  EDGE_CACHE_PATH,
  edgeCacheCardsReady,
  edgeCacheCloudflareConflictProbes,
  edgeCacheCloudflareModalProbes,
  edgeCacheDefaultProbes,
  edgeCacheDefensiveOnProbes,
  edgeCacheErrorProbes,
  edgeCacheFailureHandler,
  edgeCacheHandlers,
  edgeCacheInstance,
  edgeCacheLoadingProbes,
  edgeCachePurgeErrorProbes,
  edgeCachePurgeFailureHandler,
  edgeCachePurgeModalProbes,
  edgeCacheSwitchBusyProbes,
  edgeCacheTtlMenuProbes,
  expectEdgeCacheSwitchBusy,
  hoverEdgeCacheErrorAlert,
  openEdgeCachePurgeModal,
  openEdgeCacheTtlMenu,
  waitForEdgeCacheCloudflareModal,
  waitForEdgeCachePurgeModal,
  waitForEdgeCachePurgeModalClosed,
} from './instance-edge-cache'
import { liteShellHome } from './instances'
import { NOW } from './shell'

// S-92 ui-instance-edge-cache: the Edge Cache page of a project, measured on app-lite (`target: 'lite'`, M-2 default). Each state id is a
// literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text. Builder and probes: `instance-edge-cache.ts`.

// Default: both switches off (the cache and the defensive mode), the TTL select on its default (30 minutes), the Purge button without a modal.
export const instanceEdgeCacheDefault: ParityState = {
  id: 'instance-edge-cache-default',
  target: 'lite',
  path: EDGE_CACHE_PATH,
  signedIn: true,
  clock: NOW,
  home: liteShellHome(),
  handlers: edgeCacheHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: edgeCacheCardsReady,
  probes: edgeCacheDefaultProbes,
}

// Phase 5: hover of the Purge button of the Purge card (`buttonHoverState`: the overlay probe on `.v-btn__overlay` / the legacy `::before`).
// The two switches have `pointer-events: none` in both apps (no hover effect), so they are not measured. The button sits below the fold on
// narrow variants: the scroll is kept so the pointer stays on it (as `instance-cloudflare-hover`). The literal `id` line keeps the state
// visible to `registeredStates`.
export const instanceEdgeCacheHover: ParityState = {
  ...buttonHoverState(instanceEdgeCacheDefault, 'instance-edge-cache-hover', 'button.purge', 'lite'),
  id: 'instance-edge-cache-hover',
  keepScroll: true,
}

// Phase 6: keyboard focus of the Purge button (`buttonFocusState`: Shift, `focus()`, `:focus-visible`; no `Tab`, see lessons "buttonFocusState nie używa Tab").
// The two switches are not focusable in either app (a click `div` and a `v-switch` with `pointer-events: none`), so no focus state for them.
// The literal `id` line keeps the state visible to `registeredStates`.
export const instanceEdgeCacheFocus: ParityState = {
  ...buttonFocusState(instanceEdgeCacheDefault, 'instance-edge-cache-focus', 'button.purge', 'lite'),
  id: 'instance-edge-cache-focus',
}

// Phase 7: the cache switch while its PUT is held (`edgeCacheHandlers` with `PUT .../edge-cache` = 'hold'). The click on the switch container
// is the user's click; the switch shows its loader (`:loading`). The matrix's `disabled` is N/A: the switch has `:loading`, no `:disabled`.
// The literal `id` line keeps the state visible to `registeredStates`.
export const instanceEdgeCacheSwitchBusy: ParityState = {
  ...instanceEdgeCacheDefault,
  id: 'instance-edge-cache-switch-busy',
  handlers: edgeCacheHandlers({ [`PUT ${EDGE_CACHE_API}`]: 'hold' }),
  actions: {
    legacy: [...edgeCacheCardsReady.legacy, clickEdgeCacheSwitch(), expectEdgeCacheSwitchBusy('legacy')],
    next: [...edgeCacheCardsReady.next, clickEdgeCacheSwitch(), expectEdgeCacheSwitchBusy('next')],
  },
  probes: edgeCacheSwitchBusyProbes,
}

// Phase 8: the cache switch's PUT answers 500: the switch stays OFF with no loader and the error alert shows. The alert closes itself after
// 5 s, so the action holds it with the pointer (`pointer: 'keep'`, as `instance-auto-updates-error`). The literal `id` line keeps the state
// visible to `registeredStates`.
export const instanceEdgeCacheError: ParityState = {
  ...instanceEdgeCacheDefault,
  id: 'instance-edge-cache-error',
  pointer: 'keep',
  handlers: edgeCacheHandlers(edgeCacheFailureHandler),
  actions: {
    legacy: [...edgeCacheCardsReady.legacy, clickEdgeCacheSwitch(), hoverEdgeCacheErrorAlert],
    next: [...edgeCacheCardsReady.next, clickEdgeCacheSwitch(), hoverEdgeCacheErrorAlert],
  },
  probes: edgeCacheErrorProbes,
}

// Phase 9: the GET of the switch positions is held, so the page shows its loading state: the skeletons of the Manage and Defensive mode cards,
// the Purge card without one. The anchor is the title and the first skeleton loader (the cards are not there yet, so no `edgeCacheCardsReady`).
// The literal `id` line keeps the state visible to `registeredStates`.
export const instanceEdgeCacheLoading: ParityState = {
  ...instanceEdgeCacheDefault,
  id: 'instance-edge-cache-loading',
  handlers: edgeCacheHandlers({ [`GET ${EDGE_CACHE_API}`]: 'hold' }),
  actions: {
    legacy: [waitFor(page => page.locator('.page-title__title')), waitFor(page => page.locator('.v-skeleton-loader').first())],
    next: [waitFor(page => page.locator('.page-title__title')), waitFor(page => page.locator('.v-skeleton-loader').first())],
  },
  probes: edgeCacheLoadingProbes,
}

// Phase 10: the cache is on and the instance has DNS on Cloudflare, so the Manage card shows the `.warning-box` note under the switch. The
// empty-state slot of the matrix is N/A (no collection; `attempts.md`). The literal `id` line keeps the state visible to `registeredStates`.
export const instanceEdgeCacheCloudflareConflict: ParityState = {
  ...instanceEdgeCacheDefault,
  id: 'instance-edge-cache-cloudflare-conflict',
  handlers: edgeCacheHandlers({
    [`GET /projects/${ADVANCED_PROJECT_ID}`]: { json: { data: edgeCacheInstance({ service_has_dns_cloudflare: true }) } },
    [`GET ${EDGE_CACHE_API}`]: { json: { isActive: true, isDefensiveMode: false } },
  }),
  actions: {
    legacy: [...edgeCacheCardsReady.legacy, waitFor(page => page.locator('.warning-box').first())],
    next: [...edgeCacheCardsReady.next, waitFor(page => page.locator('.warning-box').first())],
  },
  probes: edgeCacheCloudflareConflictProbes,
}

// Phase 11: the defensive mode is on (GET `isDefensiveMode: true`, the cache off): the divider and the TTL select are gone, and the Defensive
// mode card ends after its subtitle. The literal `id` line keeps the state visible to `registeredStates`.
export const instanceEdgeCacheDefensiveOn: ParityState = {
  ...instanceEdgeCacheDefault,
  id: 'instance-edge-cache-defensive-on',
  handlers: edgeCacheHandlers({ [`GET ${EDGE_CACHE_API}`]: { json: { isActive: false, isDefensiveMode: true } } }),
  probes: edgeCacheDefensiveOnProbes,
}

// Phase 12: the Purge button of the Purge card opens the purge modal (`BasicModal`, icon `$restore`, Purge and Cancel, no alert). Measured
// open; Purge is not clicked (no PUT). The page behind the dialog is read with the default probes. The literal `id` line keeps the state
// visible to `registeredStates`.
export const instanceEdgeCachePurgeModal: ParityState = {
  ...instanceEdgeCacheDefault,
  id: 'instance-edge-cache-purge-modal',
  actions: {
    legacy: [...edgeCacheCardsReady.legacy, openEdgeCachePurgeModal('legacy'), waitForEdgeCachePurgeModal],
    next: [...edgeCacheCardsReady.next, openEdgeCachePurgeModal('next'), waitForEdgeCachePurgeModal],
  },
  probes: edgeCachePurgeModalProbes,
}

// Phase 13: the purge's PUT answers 500 after the modal's Purge: the modal closes anyway and the error alert shows. The alert closes itself
// after 5 s, so the action holds it with the pointer (`pointer: 'keep'`, as the switch error state). The literal `id` line keeps the state
// visible to `registeredStates`.
export const instanceEdgeCachePurgeError: ParityState = {
  ...instanceEdgeCacheDefault,
  id: 'instance-edge-cache-purge-error',
  pointer: 'keep',
  handlers: edgeCacheHandlers(edgeCachePurgeFailureHandler),
  actions: {
    legacy: [...edgeCacheCardsReady.legacy, openEdgeCachePurgeModal('legacy'), waitForEdgeCachePurgeModal, confirmEdgeCachePurge, waitForEdgeCachePurgeModalClosed, hoverEdgeCacheErrorAlert],
    next: [...edgeCacheCardsReady.next, openEdgeCachePurgeModal('next'), waitForEdgeCachePurgeModal, confirmEdgeCachePurge, waitForEdgeCachePurgeModalClosed, hoverEdgeCacheErrorAlert],
  },
  probes: edgeCachePurgeErrorProbes,
}

// Phase 14: the instance has DNS on Cloudflare and the cache is off, so the click on the cache switch opens the Cloudflare warning instead of
// the PUT (legacy `EC:233-249`). Measured open, narrowed to the dialog; no PUT handler is set, and the switch is clicked as the user does
// (`clickEdgeCacheSwitch`). The literal `id` line keeps the state visible to `registeredStates`.
export const instanceEdgeCacheCloudflareModal: ParityState = {
  ...instanceEdgeCacheDefault,
  id: 'instance-edge-cache-cloudflare-modal',
  handlers: edgeCacheHandlers({ [`GET /projects/${ADVANCED_PROJECT_ID}`]: { json: { data: edgeCacheInstance({ service_has_dns_cloudflare: true }) } } }),
  actions: {
    legacy: [...edgeCacheCardsReady.legacy, clickEdgeCacheSwitch(), waitForEdgeCacheCloudflareModal],
    next: [...edgeCacheCardsReady.next, clickEdgeCacheSwitch(), waitForEdgeCacheCloudflareModal],
  },
  probes: edgeCacheCloudflareModalProbes,
}

// Phase 15: the TTL select of the defensive mode card opens its menu (five options, `general.time.*`, 30 minutes selected). The menu is
// measured on its own probes, after the page's default probes (`openEdgeCacheTtlMenu`). The literal `id` line keeps the state visible to
// `registeredStates`.
export const instanceEdgeCacheTtlMenu: ParityState = {
  ...instanceEdgeCacheDefault,
  id: 'instance-edge-cache-ttl-menu',
  actions: {
    legacy: [...edgeCacheCardsReady.legacy, openEdgeCacheTtlMenu('legacy')],
    next: [...edgeCacheCardsReady.next, openEdgeCacheTtlMenu('next')],
  },
  probes: edgeCacheTtlMenuProbes,
}

const states: ParityState[] = [
  instanceEdgeCacheDefault,
  instanceEdgeCacheHover,
  instanceEdgeCacheFocus,
  instanceEdgeCacheSwitchBusy,
  instanceEdgeCacheError,
  instanceEdgeCacheLoading,
  instanceEdgeCacheCloudflareConflict,
  instanceEdgeCacheDefensiveOn,
  instanceEdgeCachePurgeModal,
  instanceEdgeCachePurgeError,
  instanceEdgeCacheCloudflareModal,
  instanceEdgeCacheTtlMenu,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
