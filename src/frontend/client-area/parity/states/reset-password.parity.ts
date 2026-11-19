import type { ParityState, Probe } from './state'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import {
  alertProbes,
  buttonFocusState,
  buttonHoverState,
  cardProbe,
  fillPasswordPair,
  passwordPairProbes,
  settled,
  submitProbe,
  titleProbe,
  tr,
} from './auth'

// Lite is the source of truth (AGENTS.md, M-2): copy is read from the lite fixture, not the app one.
const tl = (key: string) => tr(key, 'lite')

const FIELD_TESTIDS: [string, string] = ['auth-field-password', 'auth-field-password-confirm']
const { fields: fieldProbes, labels: labelProbes, messages: messageProbes } = passwordPairProbes(FIELD_TESTIDS, ['password', 'password-confirm'])

// Same query the reset email carries; the screen only reads it on submit.
const PATH = '/password-reset/change?token=t&email=jane%40example.com'

const submit: Probe = submitProbe('submit', 'button.resetPassword', 'lite')

const baseProbes: Probe[] = [cardProbe, titleProbe, ...fieldProbes, submit]

export const resetPasswordForm: ParityState = {
  id: 'reset-password-form',
  path: PATH,
  actions: { legacy: [], next: [] },
  probes: [...baseProbes, ...labelProbes],
}

const fillShort = fillPasswordPair(FIELD_TESTIDS, 'abc')

export const resetPasswordInvalid: ParityState = {
  id: 'reset-password-invalid',
  path: PATH,
  actions: {
    // Blur validation of both filled fields; no request is sent (the click is not part of this state).
    legacy: [fillShort.legacy, async page => {
      await page.locator('input[type=password]').nth(1).blur()
      await settled(page.locator('.v-messages__message').first())
      await settled(page.locator('.v-messages__message').nth(1))
    }],
    next: [fillShort.next, async page => {
      await page.getByTestId('auth-field-password-confirm').locator('input').blur()
      await settled(page.getByTestId('auth-field-password').locator('.v-messages__message'))
      await settled(page.getByTestId('auth-field-password-confirm').locator('.v-messages__message'))
    }],
  },
  probes: [...baseProbes, ...messageProbes],
}

const STRONG = 'Str0ng-pass-1'
const fillStrong = fillPasswordPair(FIELD_TESTIDS, STRONG)

const successAlert = (page: Page) => page.locator('.alert-manager .alert--success')
const errorAlert = (page: Page) => page.locator('.alert-manager .alert--error')

// The alert closes itself 5 s after it opens unless the pointer is over it, and legacy loads its login chunk for seconds
// after the response: the action hovers the alert's text box first (before waiting for `/login`) and keeps the pointer there.
// The alert is `position: fixed` outside the routed view in both apps, so it stays under the pointer across the redirect.
async function hoverAlert (alert: (page: Page) => ReturnType<Page['locator']>, page: Page): Promise<void> {
  await settled(alert(page))
  await alert(page).locator('.alert__text-box').hover()
}

async function submitLegacy (page: Page): Promise<void> {
  await page.getByRole('button', { name: tl('button.resetPassword'), exact: true }).click()
}

async function submitNext (page: Page): Promise<void> {
  await page.getByTestId('auth-submit').click()
}

export const resetPasswordSuccess: ParityState = {
  id: 'reset-password-success',
  path: PATH,
  handlers: { 'POST /reset-password': { json: { message: 'Your password has been reset!' } } },
  pointer: 'keep',
  actions: {
    legacy: [fillStrong.legacy, submitLegacy, async page => {
      await hoverAlert(successAlert, page)
      await page.waitForURL(/\/login$/)
      await settled(page.locator('.login-container .v-card'))
    }],
    next: [fillStrong.next, submitNext, async page => {
      await hoverAlert(successAlert, page)
      await page.waitForURL(/\/login$/)
      await settled(page.getByTestId('auth-card'))
    }],
  },
  afterCapture: {
    legacy: [async page => {
      await expect(successAlert(page), 'Harness error: legacy success alert closed during capture').toBeVisible()
    }],
    next: [async page => {
      await expect(successAlert(page), 'Harness error: next success alert closed during capture').toBeVisible()
    }],
  },
  probes: [...alertProbes(successAlert), cardProbe, titleProbe],
}

export const resetPasswordError: ParityState = {
  id: 'reset-password-error',
  path: PATH,
  handlers: {
    'POST /reset-password': {
      status: 422,
      json: { message: 'The given data was invalid.', errors: { email: ['This password reset token is invalid.'] } },
    },
  },
  pointer: 'keep',
  actions: {
    legacy: [fillStrong.legacy, submitLegacy, page => hoverAlert(errorAlert, page)],
    next: [fillStrong.next, submitNext, page => hoverAlert(errorAlert, page)],
  },
  afterCapture: {
    legacy: [async page => {
      await expect(errorAlert(page), 'Harness error: legacy error alert closed during capture').toBeVisible()
    }],
    next: [async page => {
      await expect(errorAlert(page), 'Harness error: next error alert closed during capture').toBeVisible()
    }],
  },
  // The fields keep their values after a failure, so they are probed filled.
  probes: [...alertProbes(errorAlert), ...fieldProbes, submit],
}

// 7-state matrix (auth-pages): hover and keyboard focus of the reset button.
export const resetPasswordFormSubmitHover = buttonHoverState(resetPasswordForm, 'reset-password-form-submit-hover', 'button.resetPassword', 'lite')
export const resetPasswordFormSubmitFocus = buttonFocusState(resetPasswordForm, 'reset-password-form-submit-focus', 'button.resetPassword', 'lite')

const states: ParityState[] = [
  resetPasswordForm,
  resetPasswordFormSubmitHover,
  resetPasswordFormSubmitFocus,
  resetPasswordInvalid,
  resetPasswordSuccess,
  resetPasswordError,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, { target: 'lite', ...state })
  })
}
