import type { Handler, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { tr } from './auth'
import { ADVANCED_PROJECT_ID, advancedFrameHandlers } from './instance-advanced-frame'
import { NOW } from './shell'

// S-101 ui-instance-wordpress-mcp: the WordPress MCP page of a project, measured on app-lite (`/projects/:id/advanced/wordpress-mcp`,
// `target: 'lite'`). Not a spec file (testMatch is `*.parity.ts`). States and their registration: `instance-wordpress-mcp.parity.ts`.
// Plan: context/changes/ui-instance-wordpress-mcp/plan.md ("Phase 3"). The page sits in the Advanced frame, whose handlers it reuses.

/** The page path of the states (the project of the Advanced frame states). */
export const MCP_PATH = `/projects/${ADVANCED_PROJECT_ID}/advanced/wordpress-mcp`

const MCP_API = `/projects/${ADVANCED_PROJECT_ID}/wordpress/mcp`

/** Copy of the page on lite (`heading.instance.advanced.wordpressMcp.*`, flat keys in `fixtures/lite/translation.en.json`). */
const copy = (key: string): string => tr(`heading.instance.advanced.wordpressMcp.${key}`, 'lite')

const ENDPOINT = 'https://studio.example.com/wp-json/mcp/mcp-adapter-default-server'

/** The `config_json` string of the API: the client config the third step shows. */
const CONFIG_JSON = JSON.stringify({
  mcpServers: {
    'studio-blog': {
      command: 'npx',
      args: ['-y', '@automattic/mcp-wordpress-remote@latest'],
      env: { WP_API_URL: ENDPOINT, WP_API_USERNAME: 'your-wp-username', WP_API_PASSWORD: 'your-application-password' },
    },
  },
}, null, 2)

/** `GET …/wordpress/mcp` for a state (`McpController::show`: `disabled`, `active` or `endpoint_unavailable`). */
export function mcpStatus (state: 'disabled' | 'active' | 'endpoint_unavailable'): Handler {
  return { json: { data: { state, endpoint: state === 'disabled' ? null : ENDPOINT, config_json: state === 'disabled' ? null : CONFIG_JSON, health_check: null } } }
}

/** Handlers of the page: the Advanced frame plus the MCP status and the WP-Admin SSO call. `overrides` replace any key. */
export function mcpHandlers (status: Handler = mcpStatus('active'), overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return advancedFrameHandlers({
    [`GET ${MCP_API}`]: status,
    [`POST /projects/${ADVANCED_PROJECT_ID}/sso-url`]: { json: { sso_url: 'https://studio.example.com/wp-login.php?sso=1' } },
    ...overrides,
  })
}

/** `GET …/wordpress/mcp` answers 500: the alert of the alert manager, the card stays in its default (disabled) state. */
export const MCP_GET_ERROR: Handler = { status: 500, json: { message: 'The MCP status could not be loaded.' } }

/** The home of the docs state: the link the "How to connect" card shows (`home.app.documentation_link`, null in the lite fixture). */
export const MCP_DOCS_HOME = { app: { documentation_link: 'https://docs.example.com/wordpress-mcp' } }

// ---------------------------------------------------------------------------------------------
// Probes. The title is the readiness anchor; both apps share the classes below (`.step`, `.mcp-code`, `.well`, `.alert-sm`), only the
// switch and the skeleton differ in the Vuetify class.
// ---------------------------------------------------------------------------------------------

export const mcpTitleProbe: Probe = {
  key: 'mcp-title',
  legacy: page => page.locator('.page-title__title'),
  next: page => page.locator('.page-title__title'),
}

/** The first card: the title, the description and the switch (`h6` is its heading in both apps). */
export const mcpMainCardProbe: Probe = {
  key: 'mcp-main-card',
  legacy: page => page.locator('.v-card', { has: page.locator('h6') }).first(),
  next: page => page.locator('.v-card', { has: page.locator('h6') }).first(),
}

export const mcpCardTitleProbe: Probe = {
  key: 'mcp-card-title',
  legacy: page => page.locator('.v-card h6').first(),
  next: page => page.locator('.v-card h6').first(),
}

export const mcpSwitchProbe: Probe = {
  key: 'mcp-switch',
  legacy: page => page.locator('.v-card .v-input--selection-controls__input').first(),
  next: page => page.locator('.v-card .v-selection-control__wrapper').first(),
}

/** The plugin-required hint under the description (state disabled). */
export const mcpHintProbe: Probe = {
  key: 'mcp-hint',
  legacy: page => page.locator('.alert-sm').first(),
  next: page => page.locator('.alert-sm').first(),
}

/** The "How to connect" card (the card holding the steps). */
export const mcpStepsCardProbe: Probe = {
  key: 'mcp-steps-card',
  legacy: page => page.locator('.v-card', { has: page.locator('.step') }).first(),
  next: page => page.locator('.v-card', { has: page.locator('.step') }).first(),
}

export const mcpStepNumProbe: Probe = {
  key: 'mcp-step-num',
  legacy: page => page.locator('.step__num').first(),
  next: page => page.locator('.step__num').first(),
}

export const mcpStepTitleProbe: Probe = {
  key: 'mcp-step-title',
  legacy: page => page.locator('.step__title').first(),
  next: page => page.locator('.step__title').first(),
}

/** The inline path of the first step's text (`<code class="mcp-path">`, the dark colours are the `--v-mcp-*` tokens). */
export const mcpPathProbe: Probe = {
  key: 'mcp-path',
  legacy: page => page.locator('.step__body .mcp-path').first(),
  next: page => page.locator('.step__body .mcp-path').first(),
}

export const mcpWpAdminProbe: Probe = {
  key: 'mcp-wp-admin',
  legacy: page => page.getByRole('button', { name: copy('step1Link'), exact: true }),
  next: page => page.getByRole('button', { name: copy('step1Link'), exact: true }),
}

export const mcpEndpointProbe: Probe = {
  key: 'mcp-endpoint',
  legacy: page => page.locator('code.mcp-code'),
  next: page => page.locator('code.mcp-code'),
}

export const mcpConfigProbe: Probe = {
  key: 'mcp-config',
  legacy: page => page.locator('pre.mcp-code'),
  next: page => page.locator('pre.mcp-code'),
}

/** The icon button that copies the endpoint (step 2). Scoped to the steps: the project header has a "Copy" button of its own. */
export const mcpCopyIconProbe: Probe = {
  key: 'mcp-copy-icon',
  legacy: page => page.locator('.step').getByRole('button', { name: copy('copy'), exact: true }).first(),
  next: page => page.locator('.step').getByRole('button', { name: copy('copy'), exact: true }).first(),
}

/** The text button that copies the configuration (step 3). */
export const mcpCopyProbe: Probe = {
  key: 'mcp-copy',
  legacy: page => page.locator('.step').getByRole('button', { name: copy('copy'), exact: true }).last(),
  next: page => page.locator('.step').getByRole('button', { name: copy('copy'), exact: true }).last(),
}

/** The warning under the steps: the text span of `endpointUnavailable` (both apps put icon and text in one `.d-flex` row). */
export const mcpEndpointWarningProbe: Probe = {
  key: 'mcp-endpoint-warning',
  legacy: page => page.getByText(copy('endpointUnavailable'), { exact: true }),
  next: page => page.getByText(copy('endpointUnavailable'), { exact: true }),
}

/** The documentation link of the "How to connect" card (shown only with `home.app.documentation_link`). */
export const mcpDocsLinkProbe: Probe = {
  key: 'mcp-docs-link',
  legacy: page => page.getByRole('link', { name: copy('documentationLink'), exact: true }),
  next: page => page.getByRole('link', { name: copy('documentationLink'), exact: true }),
}

/** The skeleton of the main card while the status loads. */
export const mcpSkeletonProbe: Probe = {
  key: 'mcp-skeleton',
  legacy: page => page.locator('.v-skeleton-loader').first(),
  next: page => page.locator('.v-skeleton-loader').first(),
}

/** The probes of the active state, the readiness anchor first. */
export const mcpActiveProbes: Probe[] = [
  mcpTitleProbe,
  mcpMainCardProbe,
  mcpCardTitleProbe,
  mcpSwitchProbe,
  mcpStepsCardProbe,
  mcpStepNumProbe,
  mcpStepTitleProbe,
  mcpPathProbe,
  mcpWpAdminProbe,
  mcpEndpointProbe,
  mcpConfigProbe,
  mcpCopyIconProbe,
  mcpCopyProbe,
]

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

/** Readiness: the card heading (after the skeleton) is on the page. */
export const mcpCardReady = {
  legacy: [async (page: Page) => {
    await page.locator('.v-card h6').first().waitFor({ state: 'visible', timeout: 20_000 })
  }],
  next: [async (page: Page) => {
    await page.locator('.v-card h6').first().waitFor({ state: 'visible', timeout: 20_000 })
  }],
}

/** The switch of the main card, reached the way a user's click reaches it (the switch itself has no pointer events on next). */
function mainSwitch (page: Page, app: 'legacy' | 'next'): Locator {
  return app === 'legacy' ? page.locator('.v-card .v-input--switch').first() : page.locator('.v-card .v-switch').first()
}

/** Clicks the switch (`evaluate`, so the event bubbles to the container on both apps). The clock moves on first (lessons: a Vue 3 wrapper `@click` needs a later event time). */
export function clickSwitch (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await page.clock.setFixedTime(new Date(Date.parse(NOW) + 60_000))
    await mainSwitch(page, app).evaluate((element: HTMLElement) => element.click())
  }
}

/** The disable confirmation dialog: legacy `.basic-modal` in the open dialog, next the host's `instances-modal`. */
export function disableDialog (page: Page, app: 'legacy' | 'next'): Locator {
  return app === 'legacy'
    ? page.locator('.v-dialog--active .basic-modal').filter({ hasText: copy('disableConfirmTitle') })
    : page.getByTestId('instances-modal').filter({ hasText: copy('disableConfirmTitle') })
}

export function expectDisableDialog (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await expect(disableDialog(page, app), `${app}: disable dialog`).toBeVisible()
  }
}

/** The held enable request keeps the switch busy (`loading` + `disabled`): the switch input is disabled on both apps. */
export function expectBusySwitch (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await expect(mainSwitch(page, app).locator('input').first(), `${app}: busy switch`).toBeDisabled()
  }
}

export const mcpDialogProbes: Probe[] = [
  { key: 'mcp-dialog', legacy: page => disableDialog(page, 'legacy'), next: page => disableDialog(page, 'next') },
  {
    key: 'mcp-dialog-message',
    legacy: page => disableDialog(page, 'legacy').locator('.v-card__text p').first(),
    next: page => disableDialog(page, 'next').locator('.v-card-text p').first(),
    internal: true,
  },
  {
    key: 'mcp-dialog-submit',
    legacy: page => disableDialog(page, 'legacy').getByRole('button', { name: copy('confirm'), exact: true }),
    next: page => disableDialog(page, 'next').getByRole('button', { name: copy('confirm'), exact: true }),
  },
  {
    key: 'mcp-dialog-cancel',
    legacy: page => disableDialog(page, 'legacy').getByRole('button', { name: 'Cancel', exact: true }),
    next: page => disableDialog(page, 'next').getByRole('button', { name: 'Cancel', exact: true }),
    internal: true,
  },
]
