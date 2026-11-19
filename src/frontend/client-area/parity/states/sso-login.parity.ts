import type { ParityState, Probe } from './state'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { tr } from './auth'

const tl = (key: string) => tr(key, 'lite')

// S-04 sso-login (S-81 ui-sso-login: target lite, the default of runState). Legacy writes the copy straight into `#app` before Vue mounts, so the container is the only element
// to anchor on: both apps are probed on `#app` (legacy has nothing else there, next renders the same bare text).
// Each state id is a literal `id: '…',` line, which `registeredStateIds` in report/write-report.ts reads as text.

const defaultTextProbe: Probe = {
  key: 'default-text',
  legacy: page => page.locator('#app'),
  next: page => page.locator('#app'),
}

export const ssoLoginDefault: ParityState = {
  id: 'sso-login-default',
  path: '/sso-login?token=parity-sso-token',
  // The held POST comes before any GET /home in both apps.
  expectHome: false,
  handlers: { 'POST /sso-login': 'hold' },
  actions: { legacy: [], next: [] },
  probes: [defaultTextProbe],
}

const errorTitleProbe: Probe = {
  key: 'error-title',
  legacy: page => page.getByRole('heading', { name: tl('heading.errorPage.title') }),
  next: page => page.getByRole('heading', { name: tl('heading.errorPage.title') }),
}

const errorSubtitleProbe: Probe = {
  key: 'error-subtitle',
  legacy: page => page.getByText(tl('heading.errorPage.subtitle'), { exact: true }),
  next: page => page.getByText(tl('heading.errorPage.subtitle'), { exact: true }),
}

const errorContainerProbe: Probe = {
  key: 'error-container',
  legacy: page => page.locator('.container.mt-13'),
  next: page => page.locator('.v-container.mt-13'),
}

export const ssoLoginError: ParityState = {
  id: 'sso-login-error',
  path: '/sso-login?token=parity-sso-token',
  expectHome: false,
  handlers: {
    'POST /sso-login': {
      status: 422,
      json: { message: 'The given data was invalid.', errors: { token: ['The selected token is invalid.'] } },
    },
  },
  actions: { legacy: [], next: [] },
  probes: [errorTitleProbe, errorSubtitleProbe, errorContainerProbe],
}

const states: ParityState[] = [
  ssoLoginDefault,
  ssoLoginError,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
