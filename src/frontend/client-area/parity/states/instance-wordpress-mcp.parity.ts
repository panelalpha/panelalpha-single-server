import type { ParityState } from './state'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { alertProbes, buttonFocusState, buttonHoverState } from './auth'
import { INSTANCE_PAGE_DNS } from './instance'
import { errorAlert, errorAlertStillHovered } from './instance-plugins'
import { clickSwitch, expectBusySwitch, expectDisableDialog, MCP_DOCS_HOME, MCP_GET_ERROR, MCP_PATH, mcpActiveProbes, mcpCardReady, mcpDialogProbes, mcpDocsLinkProbe, mcpEndpointWarningProbe, mcpHandlers, mcpHintProbe, mcpSkeletonProbe, mcpStatus, mcpStepsCardProbe, mcpSwitchProbe, mcpTitleProbe } from './instance-wordpress-mcp'
import { liteShellHome } from './instances'
import { NOW } from './shell'

// S-101 ui-instance-wordpress-mcp: the WordPress MCP page of a project, measured on app-lite (`target: 'lite'`, M-2 default). Each state id is a
// literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text. Builder and probes: `instance-wordpress-mcp.ts`.
// Matrix of 7 states (research.md): default, hover, focus-visible, disabled (+ busy), error (+ endpoint-unavailable), loading; empty is N/A.

// Default: MCP is active (switch on, "How to connect" with the three steps).
export const instanceWordpressMcpDefault: ParityState = {
  id: 'instance-wordpress-mcp-default',
  target: 'lite',
  path: MCP_PATH,
  signedIn: true,
  clock: NOW,
  home: liteShellHome(),
  handlers: mcpHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: mcpCardReady,
  probes: mcpActiveProbes,
}

// Hover and keyboard focus of the main action of the steps card, "Open WP-Admin" (`buttonHoverState`, `buttonFocusState`).
// The button sits in the steps card, below the fold on narrow variants: the scroll is kept so the pointer stays on it (as `settings-backups-hover`).
export const instanceWordpressMcpHover: ParityState = {
  ...buttonHoverState(instanceWordpressMcpDefault, 'instance-wordpress-mcp-hover', 'heading.instance.advanced.wordpressMcp.step1Link', 'lite'),
  keepScroll: true,
}

export const instanceWordpressMcpFocus: ParityState = buttonFocusState(instanceWordpressMcpDefault, 'instance-wordpress-mcp-focus', 'heading.instance.advanced.wordpressMcp.step1Link', 'lite')

// Disabled: MCP is off. The switch is off, the hint explains the adapter plugin, the steps card is absent.
export const instanceWordpressMcpDisabled: ParityState = {
  ...instanceWordpressMcpDefault,
  id: 'instance-wordpress-mcp-disabled',
  handlers: mcpHandlers(mcpStatus('disabled')),
  probes: [mcpTitleProbe, mcpSwitchProbe, mcpHintProbe],
}

// Busy: the click on the off switch sends the enable request, held, so the switch is `loading` + `disabled` (isBusy).
export const instanceWordpressMcpBusy: ParityState = {
  ...instanceWordpressMcpDisabled,
  id: 'instance-wordpress-mcp-busy',
  handlers: mcpHandlers(mcpStatus('disabled'), { 'POST /projects/41/wordpress/mcp': 'hold' }),
  actions: {
    legacy: [...mcpCardReady.legacy, clickSwitch('legacy'), expectBusySwitch('legacy')],
    next: [...mcpCardReady.next, clickSwitch('next'), expectBusySwitch('next')],
  },
  probes: [mcpTitleProbe, mcpSwitchProbe],
}

// Error: GET answers 500. The alert of the alert manager shows, the card stays in its default (disabled) state.
export const instanceWordpressMcpError: ParityState = {
  ...instanceWordpressMcpDefault,
  id: 'instance-wordpress-mcp-error',
  handlers: mcpHandlers(MCP_GET_ERROR),
  actions: {
    legacy: [...mcpCardReady.legacy, errorAlertStillHovered.legacy],
    next: [...mcpCardReady.next, errorAlertStillHovered.next],
  },
  probes: [mcpTitleProbe, mcpSwitchProbe, mcpHintProbe, ...alertProbes(errorAlert)],
}

// Endpoint unavailable: the steps card with the warning row under the steps.
export const instanceWordpressMcpEndpointUnavailable: ParityState = {
  ...instanceWordpressMcpDefault,
  id: 'instance-wordpress-mcp-endpoint-unavailable',
  handlers: mcpHandlers(mcpStatus('endpoint_unavailable')),
  probes: [mcpTitleProbe, mcpStepsCardProbe, mcpEndpointWarningProbe],
}

// Loading: GET is held, the card is the skeleton.
export const instanceWordpressMcpLoading: ParityState = {
  ...instanceWordpressMcpDefault,
  id: 'instance-wordpress-mcp-loading',
  handlers: mcpHandlers('hold'),
  actions: {
    legacy: [async page => {
      await page.locator('.v-skeleton-loader').first().waitFor({ state: 'visible', timeout: 20_000 })
    }],
    next: [async page => {
      await page.locator('.v-skeleton-loader').first().waitFor({ state: 'visible', timeout: 20_000 })
    }],
  },
  probes: [mcpTitleProbe, mcpSkeletonProbe],
}

/** The lite shell home with the documentation link merged into `app` (the state's `home` is deep-merged over the fixture, not over `liteShellHome`). */
function docsHome (): Record<string, unknown> {
  const home = liteShellHome()
  return { ...home, app: { ...(home.app as Record<string, unknown>), ...MCP_DOCS_HOME.app } }
}

// Docs: `home.app.documentation_link` is set, so the card shows the link and the heading drops to `mb-2`.
export const instanceWordpressMcpDocs: ParityState = {
  ...instanceWordpressMcpDefault,
  id: 'instance-wordpress-mcp-docs',
  home: docsHome(),
  probes: [mcpTitleProbe, mcpStepsCardProbe, mcpDocsLinkProbe],
}

// Disable dialog: the click on the on switch opens the persistent confirmation (warning icon, confirm first, cancel after).
export const instanceWordpressMcpModalDisable: ParityState = {
  ...instanceWordpressMcpDefault,
  id: 'instance-wordpress-mcp-modal-disable',
  actions: {
    legacy: [...mcpCardReady.legacy, clickSwitch('legacy'), expectDisableDialog('legacy')],
    next: [...mcpCardReady.next, clickSwitch('next'), expectDisableDialog('next')],
  },
  probes: mcpDialogProbes,
}

const states: ParityState[] = [instanceWordpressMcpDefault, instanceWordpressMcpHover, instanceWordpressMcpFocus, instanceWordpressMcpDisabled, instanceWordpressMcpBusy, instanceWordpressMcpError, instanceWordpressMcpEndpointUnavailable, instanceWordpressMcpLoading, instanceWordpressMcpDocs, instanceWordpressMcpModalDisable]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
