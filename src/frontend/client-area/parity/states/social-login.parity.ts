import type { ParityState, Probe } from './state'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { cardProbe, errorProbes, settled, titleProbe } from './auth'

// auth-pages: the OAuth callback route (`/auth/:provider/callback`, legacy `SocialLogin.vue`). Both apps render an empty
// `<div>` while `POST /auth/{provider}/callback` runs, so the application root is the only element to anchor on. In
// legacy `#app` is the `v-app` root itself; in next it is the mount point around it, so both are probed on `.v-application`.
// Each state id is a literal `id: '…',` line, which `registeredStateIds` in report/write-report.ts reads as text.

const appProbe: Probe = {
  key: 'app',
  legacy: page => page.locator('.v-application').first(),
  next: page => page.locator('.v-application').first(),
}

export const socialLoginPending: ParityState = {
  id: 'social-login-pending',
  path: '/auth/google/callback?code=parity-code',
  handlers: { 'POST /auth/google/callback': 'hold' },
  actions: { legacy: [], next: [] },
  probes: [appProbe],
}

// Error from the callback (`POST /auth/{provider}/callback` 422 `account_already_exists`): both apps land on `/login` with the
// account-exists banner (legacy `SocialLogin.vue:58-63`, next `social-callback-redirect.ts`). Other 4xx errors end on bare `/login`
// (the same screen as `login-email-lite`), so they have no state of their own.
export const socialLoginAccountExists: ParityState = {
  id: 'social-login-account-exists',
  path: '/auth/google/callback?code=parity-code',
  handlers: {
    'POST /auth/google/callback': {
      status: 422,
      json: { message: 'The given data was invalid.', error_type: 'account_already_exists' },
    },
  },
  actions: {
    legacy: [async page => {
      await settled(page.locator('.login-message--error'))
    }],
    next: [async page => {
      await settled(page.getByTestId('auth-error'))
    }],
  },
  probes: [cardProbe, titleProbe, ...errorProbes],
}

const states: ParityState[] = [
  socialLoginPending,
  socialLoginAccountExists,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
