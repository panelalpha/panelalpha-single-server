import type { ParityState, Probe } from './state'
import type { Page } from '@playwright/test'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import {
  buttonFocusState,
  buttonHoverState,
  cardProbe,
  errorProbes,
  fillPasswordPair,
  passwordPairProbes,
  pendingSubmitMasks,
  pendingSubmitProbes,
  settled,
  titleProbe,
  tr,
  waitForPendingSubmit,
} from './auth'

export const acceptInviteLoading: ParityState = {
  id: 'accept-invite-loading',
  path: '/accept-invite?token=t',
  // The mount request never completes: both apps render an empty frame (no logo, no radio-lines).
  handlers: { 'POST /accept-invitation': 'hold' },
  actions: { legacy: [], next: [] },
  probes: [
    {
      key: 'app',
      legacy: page => page.locator('.v-application'),
      next: page => page.locator('.v-application'),
    },
  ],
}

export const acceptInviteError: ParityState = {
  id: 'accept-invite-error',
  path: '/accept-invite?token=bad',
  handlers: {
    'POST /accept-invitation': {
      status: 422,
      json: { message: 'Invalid request', errors: { 0: ['Invalid request'] } },
    },
  },
  actions: { legacy: [], next: [] },
  probes: [
    cardProbe,
    titleProbe,
    {
      key: 'info',
      legacy: page => page.locator('.login-container .v-card__text'),
      next: page => page.getByTestId('accept-invite-info'),
    },
  ],
}

const tl = (key: string) => tr(key, 'lite')
const register = tl('button.register')

const FIELD_TESTIDS: [string, string] = ['auth-field-password', 'auth-field-password-confirm']
const { fields: fieldProbes, labels: labelProbes, messages: messageProbes } = passwordPairProbes(FIELD_TESTIDS, ['password', 'password-confirm'])
const fillPair = fillPasswordPair(FIELD_TESTIDS, 'secret1')

const submit: Probe = {
  key: 'submit',
  legacy: page => page.getByRole('button', { name: register, exact: true }),
  next: page => page.getByTestId('auth-submit'),
}

const passwordRequired = { json: { password_required: true } }

const baseProbes: Probe[] = [cardProbe, titleProbe, ...fieldProbes, submit]

const fillAndSubmit = {
  legacy: [fillPair.legacy, async (page: Page) => {
    await page.getByRole('button', { name: register, exact: true }).click()
  }],
  next: [fillPair.next, async (page: Page) => {
    await page.getByTestId('auth-submit').click()
  }],
}

export const acceptInvitePassword: ParityState = {
  id: 'accept-invite-password',
  path: '/accept-invite?token=t',
  handlers: { 'POST /accept-invitation': passwordRequired },
  actions: { legacy: [], next: [] },
  probes: [...baseProbes, ...labelProbes],
}

export const acceptInvitePasswordInvalid: ParityState = {
  id: 'accept-invite-password-invalid',
  path: '/accept-invite?token=t',
  handlers: { 'POST /accept-invitation': passwordRequired },
  actions: {
    // Empty fields: validation fails on submit, no second request is sent.
    legacy: [async page => {
      await page.getByRole('button', { name: register, exact: true }).click()
      await settled(page.locator('.v-messages__message').first())
      await settled(page.locator('.v-messages__message').nth(1))
    }],
    next: [async page => {
      await page.getByTestId('auth-submit').click()
      await settled(page.getByTestId('auth-field-password').locator('.v-messages__message'))
      await settled(page.getByTestId('auth-field-password-confirm').locator('.v-messages__message'))
    }],
  },
  probes: [...baseProbes, ...labelProbes, ...messageProbes],
}

export const acceptInviteSubmitting: ParityState = {
  id: 'accept-invite-submitting',
  path: '/accept-invite?token=t',
  // The second POST (the password submit) never completes: the button stays in its loading state.
  handlers: { 'POST /accept-invitation': [passwordRequired, 'hold'] },
  actions: {
    legacy: [...fillAndSubmit.legacy, waitForPendingSubmit.legacy],
    next: [...fillAndSubmit.next, waitForPendingSubmit.next],
  },
  probes: [cardProbe, titleProbe, ...fieldProbes, ...pendingSubmitProbes],
  masks: pendingSubmitMasks,
}

export const acceptInvitePasswordServerError: ParityState = {
  id: 'accept-invite-password-server-error',
  path: '/accept-invite?token=t',
  home: { app: { support_link: 'https://support.example.com' } },
  handlers: {
    'POST /accept-invitation': [
      passwordRequired,
      {
        status: 422,
        json: {
          message: 'The password must be at least 8 characters.',
          errors: { password: ['The password must be at least 8 characters.'] },
        },
      },
    ],
  },
  actions: {
    legacy: [...fillAndSubmit.legacy, async page => {
      await settled(page.locator('.login-message--error').first())
    }],
    next: [...fillAndSubmit.next, async page => {
      await settled(page.getByTestId('auth-error').first())
    }],
  },
  probes: [
    ...baseProbes,
    ...errorProbes,
    {
      key: 'error-desc',
      legacy: page => page.locator('.login-message--error .login-message__desc').first(),
      next: page => page.getByTestId('auth-error').first().locator('.login-message__desc'),
      internal: true,
    },
  ],
}

// 7-state matrix (S-82 ui-accept-invite, target lite): hover and keyboard focus of the register button.
export const acceptInvitePasswordSubmitHover = buttonHoverState(acceptInvitePassword, 'accept-invite-password-submit-hover', 'button.register', 'lite')
export const acceptInvitePasswordSubmitFocus = buttonFocusState(acceptInvitePassword, 'accept-invite-password-submit-focus', 'button.register', 'lite')

const states: ParityState[] = [
  acceptInviteLoading,
  acceptInviteError,
  acceptInvitePassword,
  acceptInvitePasswordSubmitHover,
  acceptInvitePasswordSubmitFocus,
  acceptInvitePasswordInvalid,
  acceptInviteSubmitting,
  acceptInvitePasswordServerError,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
