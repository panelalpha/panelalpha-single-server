import type { ParityState, Probe } from './state'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import {
  alertProbes,
  buttonFocusState,
  buttonHoverState,
  cardProbe,
  EMAIL,
  fieldProbes,
  settled,
  submitEmail,
  submitProbe,
  titleProbe,
  tr,
} from './auth'

// Copy is read from the app-lite fixtures (the measured target, M-2): `tr` defaults to the app set.
const tl = (key: string) => tr(key, 'lite')

const resetSubmit = submitProbe('submit', 'button.resetPasswordSend', 'lite')

const bottomProbes: Probe[] = [
  {
    key: 'bottom-text',
    legacy: page => page.locator('.login-container .v-card__text p'),
    next: page => page.getByTestId('auth-bottom-text'),
  },
  {
    key: 'bottom-link',
    legacy: page => page.getByRole('link', { name: tl('button.signIn'), exact: true }),
    next: page => page.getByTestId('auth-bottom-link'),
  },
]

const fieldMessage: Probe = {
  key: 'field-message',
  legacy: page => page.locator('.v-messages__message').first(),
  next: page => page.getByTestId('auth-field-email').locator('.v-messages__message'),
  internal: true,
}

// Legacy removes the label from the DOM once the field holds text, so it is probed only while the field is empty.
const labelProbe: Probe[] = [
  {
    key: 'field-label',
    legacy: page => page.locator('.v-input').filter({ has: page.locator('input[name=email]') }).locator('label').first(),
    next: page => page.getByTestId('auth-field-email').locator('label.v-field-label').first(),
    internal: true,
  },
]

const baseProbes: Probe[] = [
  cardProbe,
  titleProbe,
  ...fieldProbes('email', 'input[name=email]', 'auth-field-email'),
  resetSubmit,
  ...bottomProbes,
]

export const forgotPasswordEmail: ParityState = {
  id: 'forgot-password-email',
  path: '/forgot-password',
  actions: { legacy: [], next: [] },
  probes: [...baseProbes, ...labelProbe],
}

export const forgotPasswordRequired: ParityState = {
  id: 'forgot-password-required',
  path: '/forgot-password',
  actions: {
    // Empty field: validation fails, no request is sent.
    legacy: [async page => {
      await page.getByRole('button', { name: tl('button.resetPasswordSend'), exact: true }).click()
      await settled(page.locator('.v-messages__message').first())
    }],
    next: [async page => {
      await page.getByTestId('auth-submit').click()
      await settled(page.getByTestId('auth-field-email').locator('.v-messages__message'))
    }],
  },
  probes: [...baseProbes, ...labelProbe, fieldMessage],
}

export const forgotPasswordInvalid: ParityState = {
  id: 'forgot-password-invalid',
  path: '/forgot-password',
  actions: {
    // Legacy drops the accessible name of a filled field, so it is addressed by its `name` after typing.
    legacy: [async page => {
      const field = page.locator('input[name=email]')
      await field.fill('not-an-email')
      await field.blur()
      await settled(page.locator('.v-messages__message').first())
    }],
    next: [async page => {
      const field = page.getByLabel(tl('form.label.emailAddress'), { exact: true })
      await field.fill('not-an-email')
      await field.blur()
      await settled(page.getByTestId('auth-field-email').locator('.v-messages__message'))
    }],
  },
  probes: [...baseProbes, fieldMessage],
}

// The global alert stack is the same markup in both apps (`.alert-manager .alert--success|--error`).
const sentAlert = (page: Page) => page.locator('.alert-manager .alert--success')

const sentAlertProbes = alertProbes(sentAlert)

export const forgotPasswordSent: ParityState = {
  id: 'forgot-password-sent',
  path: '/forgot-password',
  handlers: { 'POST /forgot-password': { json: { message: 'We have emailed your password reset link!' } } },
  // The alert closes itself 5 s after it opens unless the pointer is over it: both apps are captured one after the other,
  // so each action hovers the text box (not the close button, which has its own hover overlay) and keeps the pointer there.
  pointer: 'keep',
  actions: {
    legacy: [...submitEmail('button.resetPasswordSend', 'lite'), async page => {
      await settled(sentAlert(page))
      await sentAlert(page).locator('.alert__text-box').hover()
    }],
    next: [...submitEmail('button.resetPasswordSend', 'lite'), async page => {
      await settled(sentAlert(page))
      await sentAlert(page).locator('.alert__text-box').hover()
    }],
  },
  // Fail instead of recording a baseline from an alert that timed out during capture.
  afterCapture: {
    legacy: [async page => {
      await expect(sentAlert(page), 'Harness error: legacy success alert closed during capture').toBeVisible()
    }],
    next: [async page => {
      await expect(sentAlert(page), 'Harness error: next success alert closed during capture').toBeVisible()
    }],
  },
  probes: [
    ...sentAlertProbes,
    // The field is emptied right after the request starts, so it is probed empty.
    ...fieldProbes('email', 'input[name=email]', 'auth-field-email'),
    resetSubmit,
  ],
}

const errorAlert = (page: Page) => page.locator('.alert-manager .alert--error')

// Enter in the field (legacy `@keydown.enter`), not the button; one request is expected in each app.
function submitWithEnter (appName: string): (page: Page) => Promise<void> {
  return async page => {
    let posts = 0
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/forgot-password')) {
        posts += 1
      }
    })
    // Legacy drops the accessible name of a filled field, so it is filled by label and addressed by `name` afterwards.
    await page.getByLabel(tl('form.label.emailAddress'), { exact: true }).fill(EMAIL)
    await page.locator('input[name=email]').press('Enter')
    await settled(errorAlert(page))
    await errorAlert(page).locator('.alert__text-box').hover()
    expect(posts, `${appName}: exactly one POST /forgot-password per Enter`).toBe(1)
  }
}

export const forgotPasswordError: ParityState = {
  id: 'forgot-password-error',
  path: '/forgot-password',
  handlers: {
    'POST /forgot-password': {
      status: 422,
      json: {
        message: 'The given data was invalid.',
        // Realny throttle brokera (60 s): the only "retry" shape in legacy, shown as a plain error alert.
        errors: { email: ['Please wait before retrying.'] },
      },
    },
  },
  // Same timer rule as `-sent`: the pointer stays on the alert's text box so it does not auto-close during capture.
  pointer: 'keep',
  actions: {
    legacy: [submitWithEnter('legacy')],
    next: [submitWithEnter('next')],
  },
  afterCapture: {
    legacy: [async page => {
      await expect(errorAlert(page), 'Harness error: legacy error alert closed during capture').toBeVisible()
    }],
    next: [async page => {
      await expect(errorAlert(page), 'Harness error: next error alert closed during capture').toBeVisible()
    }],
  },
  probes: [
    ...alertProbes(errorAlert),
    ...fieldProbes('email', 'input[name=email]', 'auth-field-email'),
    resetSubmit,
  ],
}

// 7-state matrix (auth-pages): hover and keyboard focus of the send button.
export const forgotPasswordEmailSubmitHover = buttonHoverState(forgotPasswordEmail, 'forgot-password-email-submit-hover', 'button.resetPasswordSend', 'lite')
export const forgotPasswordEmailSubmitFocus = buttonFocusState(forgotPasswordEmail, 'forgot-password-email-submit-focus', 'button.resetPasswordSend', 'lite')

const states: ParityState[] = [
  forgotPasswordEmail,
  forgotPasswordEmailSubmitHover,
  forgotPasswordEmailSubmitFocus,
  forgotPasswordRequired,
  forgotPasswordInvalid,
  forgotPasswordSent,
  forgotPasswordError,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    // target defaults to lite (M-2, targetOf); no explicit app here
    await runState(browser, testInfo, state)
  })
}
