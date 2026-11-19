import type { ParityState, Probe } from './state'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { buttonFocusState, buttonHoverState, cardProbe, titleProbe, tr } from './auth'

// Copy is read from the app-lite fixtures (the measured target, M-2): `tr` defaults to the app set.
const tl = (key: string) => tr(key, 'lite')

const probes: Probe[] = [
  cardProbe,
  titleProbe,
  {
    key: 'message',
    legacy: page => page.locator('.login-container .v-card__text p'),
    next: page => page.getByTestId('hub-login-invalid'),
  },
  {
    // The button is a link to `/login` in both apps (legacy `:to`, next `to`), so it is addressed by role `link`.
    key: 'submit',
    legacy: page => page.getByRole('link', { name: tl('button.logIn'), exact: true }),
    next: page => page.getByTestId('auth-submit'),
  },
]

// No ticket in the URL: the exchange is skipped in both apps and the error card is shown without any request.
export const hubLoginDefault: ParityState = {
  id: 'hub-login-default',
  path: '/hub-login',
  actions: { legacy: [], next: [] },
  probes,
}

// Invalid ticket: the exchange runs (POST /hub-login answers 422), the hash is cleared before render, and the same error card shows.
// Legacy `Auth.js:16-21` sets `hubLoginFailed` on the failed exchange; next `hubLoginFailed` in the session store does the same.
export const hubLoginError: ParityState = {
  id: 'hub-login-error',
  path: '/hub-login#ticket=bad',
  handlers: {
    'POST /hub-login': { status: 422, json: { message: 'The given data was invalid.' } },
  },
  actions: { legacy: [], next: [] },
  probes,
}

// Hover of the "Log in" link (the only action of the error card): the overlay of `.v-btn__overlay` against the legacy `::before`.
export const hubLoginHover: ParityState = {
  ...buttonHoverState(hubLoginDefault, 'hub-login-hover', 'button.logIn', 'lite', 'link'),
  id: 'hub-login-hover',
}

// Keyboard focus of the same "Log in" link: the helper focuses it directly, the ring is asserted in next only.
export const hubLoginFocus: ParityState = {
  ...buttonFocusState(hubLoginDefault, 'hub-login-focus', 'button.logIn', 'lite', 'link'),
  id: 'hub-login-focus',
}

const states: ParityState[] = [
  hubLoginDefault,
  hubLoginError,
  hubLoginHover,
  hubLoginFocus,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    // target defaults to lite (M-2, targetOf); no explicit app here
    await runState(browser, testInfo, state)
  })
}
