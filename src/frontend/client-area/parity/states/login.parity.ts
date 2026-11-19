import type { ParityState, Probe, StateAction } from './state'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import {
  bottomBoxProbe,
  buttonFocusState,
  buttonHoverState,
  cardProbe,
  errorProbes,
  fieldProbes,
  languageActivatorProbe,
  pendingSubmitMasks,
  pendingSubmitProbes,
  readParityClipboard,
  resendLabelProbeFor,
  resendMasksFor,
  settled,
  submitEmail,
  submitProbe,
  titleProbe,
  tr,
  trPattern,
  waitForPendingSubmit,
} from './auth'

const tl = (key: string) => tr(key, 'lite')

const logIn = tl('button.logIn')
const signUp = tl('button.signUp')

export const loginEmail: ParityState = {
  id: 'login-email',
  path: '/login',
  home: { app: { registration_enabled: true } },
  actions: { legacy: [], next: [] },
  probes: [
    {
      // Anchor; legacy.card also matches the 2FA / recovery cards, which the email step never shows.
      key: 'card',
      legacy: page => page.locator('.login-container .v-card'),
      next: page => page.getByTestId('auth-card'),
    },
    {
      key: 'title',
      legacy: page => page.getByRole('heading', { level: 1 }),
      next: page => page.getByTestId('auth-title'),
    },
    {
      key: 'field-email',
      legacy: page => page.locator('.v-input__slot').filter({ has: page.locator('input[name=email]') }),
      next: page => page.getByTestId('auth-field-email').locator('.v-field'),
      part: 'box',
      internal: true,
    },
    {
      key: 'field-email-input',
      legacy: page => page.locator('input[name=email]'),
      next: page => page.getByTestId('auth-field-email').locator('input'),
      part: 'input',
      internal: true,
    },
    {
      key: 'submit',
      legacy: page => page.getByRole('button', { name: logIn }),
      next: page => page.getByTestId('auth-submit'),
    },
    {
      key: 'bottom-box',
      legacy: page => page.locator('.login-bottom-box'),
      next: page => page.getByTestId('auth-bottom-box'),
    },
    {
      key: 'bottom-link',
      legacy: page => page.getByRole('link', { name: signUp }),
      next: page => page.getByTestId('auth-bottom-link'),
    },
    {
      key: 'language-activator',
      legacy: page => page.locator('#languageSwitcher').getByRole('button'),
      next: page => page.getByTestId('language-activator'),
    },
  ],
}

// Clean lite fixture (registration_enabled: false, no social): email step only, no bottom box.
export const loginEmailLite: ParityState = {
  id: 'login-email-lite',
  path: '/login',
  actions: { legacy: [], next: [] },
  probes: [
    {
      key: 'card',
      legacy: page => page.locator('.login-container .v-card'),
      next: page => page.getByTestId('auth-card'),
    },
    {
      key: 'title',
      legacy: page => page.getByRole('heading', { level: 1 }),
      next: page => page.getByTestId('auth-title'),
    },
    {
      key: 'field-email',
      legacy: page => page.locator('.v-input__slot').filter({ has: page.locator('input[name=email]') }),
      next: page => page.getByTestId('auth-field-email').locator('.v-field'),
      part: 'box',
      internal: true,
    },
    {
      key: 'field-email-input',
      legacy: page => page.locator('input[name=email]'),
      next: page => page.getByTestId('auth-field-email').locator('input'),
      part: 'input',
      internal: true,
    },
    {
      key: 'submit',
      legacy: page => page.getByRole('button', { name: logIn }),
      next: page => page.getByTestId('auth-submit'),
    },
    {
      key: 'language-activator',
      legacy: page => page.locator('#languageSwitcher').getByRole('button'),
      next: page => page.getByTestId('language-activator'),
    },
  ],
}

const sameActions = (...actions: StateAction[]) => ({ legacy: actions, next: actions })
// Disabled submit (phase 11): the action asserts the disabled button on each side before the probe measures it.
function submitDisabled (legacyKey: string): { legacy: StateAction, next: StateAction } {
  return {
    legacy: async page => {
      await expect(page.getByRole('button', { name: tl(legacyKey), exact: true })).toBeDisabled()
    },
    next: async page => {
      await expect(page.getByTestId('auth-submit')).toBeDisabled()
    },
  }
}
const loginEmailSteps = submitEmail('button.logIn', 'lite')
// Email step, then the password step: type a password and submit it.
const loginPasswordSteps: StateAction[] = [
  ...loginEmailSteps,
  async page => {
    await page.getByLabel(tl('form.label.password'), { exact: true }).fill('correct horse battery')
  },
  async page => {
    await page.getByRole('button', { name: tl('button.logIn'), exact: true }).click()
  },
]

const verifyEmailTitle = tl('heading.loginPage.emailVerification.title')
const twoFactorTitle = tl('heading.loginPage.twoFactorAuthentication.title')
const recoveryCodes = ['Xk3d9f-Lm2Qa7-Pz4RtW', 'Bd82nQ-7cVx0Y-jH5sKe']
// One locator pair for the recovery copy button: the hover/copied actions use it, and the probe is built from it.
const copyButton = {
  legacy: (page: Page) => page.locator('.recovery-code-box .copyButton'),
  next: (page: Page) => page.getByTestId('auth-recovery-copy'),
}
const copyButtonProbe: Probe = { key: 'copy-button', ...copyButton }
const invalidCredentials = {
  status: 422,
  json: {
    message: 'The given data was invalid.',
    errors: { email: ['These credentials do not match our records.'] },
  },
}

export const loginPassword: ParityState = {
  id: 'login-password',
  path: '/login',
  home: { app: { registration_enabled: true } },
  handlers: { 'POST /login': { json: { use_password: true } } },
  actions: sameActions(...loginEmailSteps, async page => {
    await settled(page.getByLabel(tl('form.label.password'), { exact: true }))
  }),
  probes: [
    cardProbe,
    titleProbe,
    ...fieldProbes('password', 'input[name=password]', 'auth-field-password'),
    {
      key: 'remember',
      legacy: page => page.locator('.checkbox'),
      next: page => page.getByTestId('auth-remember'),
    },
    // Kit `Checkbox` duty (F-06): the 22 px control and its label, below the `auth-remember` anchor.
    {
      key: 'remember-control',
      legacy: page => page.locator('.checkbox .v-input--selection-controls__input'),
      next: page => page.getByTestId('auth-remember').locator('.v-selection-control__input'),
      internal: true,
    },
    {
      key: 'remember-icon',
      legacy: page => page.locator('.checkbox .v-input--selection-controls__input .v-icon'),
      next: page => page.getByTestId('auth-remember').locator('.v-selection-control__input .v-icon'),
      internal: true,
    },
    {
      key: 'remember-label',
      legacy: page => page.locator('.checkbox label'),
      next: page => page.getByTestId('auth-remember').locator('label'),
      internal: true,
    },
    {
      key: 'forgot-link',
      legacy: page => page.getByRole('link', { name: tl('button.forgotPassword') }),
      next: page => page.getByTestId('auth-forgot-link'),
    },
    submitProbe('submit', 'button.logIn', 'lite'),
    bottomBoxProbe,
    languageActivatorProbe,
  ],
}

// Keyboard focus of the remember checkbox on the password step: the password is filled (no blur error), then Tab moves
// focus to the checkbox in both apps. The pointer is moved off the card first, so only the keyboard focus is measured.
const rememberFocusSteps: StateAction[] = [
  async page => {
    await page.mouse.move(0, 0)
  },
  async page => {
    await page.getByLabel(tl('form.label.password'), { exact: true }).fill('correct horse battery')
  },
  async page => {
    await page.keyboard.press('Tab')
  },
]

export const loginPasswordRememberFocus: ParityState = {
  ...loginPassword,
  id: 'login-password-remember-focus',
  pointer: 'keep',
  actions: {
    legacy: [...loginPassword.actions.legacy, ...rememberFocusSteps, async page => {
      const checkbox = page.locator('.checkbox input[type="checkbox"]')
      expect(await checkbox.evaluate(element => element.matches(':focus-visible')), 'keyboard focus on remember').toBe(true)
    }],
    next: [...loginPassword.actions.next, ...rememberFocusSteps, async page => {
      const checkbox = page.getByTestId('auth-remember').locator('input[type="checkbox"]')
      expect(await checkbox.evaluate(element => element.matches(':focus-visible')), 'keyboard focus on remember').toBe(true)
    }],
  },
}

export const loginEmailPending: ParityState = {
  id: 'login-email-pending',
  path: '/login',
  home: { app: { registration_enabled: true } },
  // The request never completes: the submit button stays in its loading state.
  handlers: { 'POST /login': 'hold' },
  actions: {
    legacy: [...loginEmailSteps, waitForPendingSubmit.legacy],
    next: [...loginEmailSteps, waitForPendingSubmit.next],
  },
  probes: [
    cardProbe,
    titleProbe,
    ...pendingSubmitProbes,
    bottomBoxProbe,
    languageActivatorProbe,
  ],
  masks: pendingSubmitMasks,
}

export const loginPasswordPending: ParityState = {
  id: 'login-password-pending',
  path: '/login',
  home: { app: { registration_enabled: true } },
  // The first POST moves to the password step, the second one (with the password) never completes.
  handlers: { 'POST /login': [{ json: { use_password: true } }, 'hold'] },
  actions: {
    legacy: [...loginPasswordSteps, waitForPendingSubmit.legacy],
    next: [...loginPasswordSteps, waitForPendingSubmit.next],
  },
  probes: [
    cardProbe,
    titleProbe,
    ...pendingSubmitProbes,
    bottomBoxProbe,
    languageActivatorProbe,
  ],
  masks: pendingSubmitMasks,
}

export const loginSetPassword: ParityState = {
  id: 'login-set-password',
  path: '/login',
  home: { app: { registration_enabled: true } },
  handlers: { 'POST /login': { json: { set_password: true } } },
  actions: {
    legacy: [...loginEmailSteps, async page => {
      await settled(page.locator('.login-message--success'))
    }],
    next: [...loginEmailSteps, async page => {
      await settled(page.getByTestId('auth-success'))
    }],
  },
  probes: [
    cardProbe,
    titleProbe,
    {
      key: 'success',
      legacy: page => page.locator('.login-message--success'),
      next: page => page.getByTestId('auth-success'),
    },
    ...fieldProbes('password', 'input[name=new-password]', 'auth-field-password'),
    ...fieldProbes('password-confirm', 'input[name=confirm-password]', 'auth-field-password-confirm'),
    submitProbe('submit', 'button.logIn', 'lite'),
    bottomBoxProbe,
    languageActivatorProbe,
  ],
}

const verifyEmailSettled: StateAction = async page => {
  await settled(page.getByRole('heading', { name: verifyEmailTitle }))
}

export const loginVerifyEmail: ParityState = {
  id: 'login-verify-email',
  path: '/login',
  home: { app: { registration_enabled: true } },
  handlers: { 'POST /login': { json: { verify_email: true } } },
  actions: {
    legacy: [...loginEmailSteps, verifyEmailSettled, submitDisabled('heading.loginPage.emailVerification.confirmEmailAddress').legacy],
    next: [...loginEmailSteps, verifyEmailSettled, submitDisabled('heading.loginPage.emailVerification.confirmEmailAddress').next],
  },
  probes: [
    cardProbe,
    titleProbe,
    {
      key: 'code-cells',
      legacy: page => page.locator('.four-digit-input'),
      next: page => page.getByTestId('auth-code-cells'),
    },
    {
      key: 'code-field',
      legacy: page => page.locator('.four-digit-input .v-input__slot').first(),
      next: page => page.getByTestId('auth-code-cells').locator('.v-field').first(),
      part: 'box',
      internal: true,
    },
    submitProbe('submit', 'heading.loginPage.emailVerification.confirmEmailAddress', 'lite'),
    {
      key: 'resend',
      legacy: page => page.getByRole('button', { name: trPattern('heading.loginPage.emailVerification.resendCodeMessage', 'lite') }),
      next: page => page.getByTestId('auth-secondary'),
    },
    resendLabelProbeFor('lite'),
    bottomBoxProbe,
    {
      key: 'bottom-link',
      legacy: page => page.locator('.login-bottom-box a'),
      next: page => page.getByTestId('auth-bottom-link'),
    },
    languageActivatorProbe,
  ],
  masks: resendMasksFor('lite'),
}

// 7-state matrix (auth-pages) of the verify-email card. The confirm button is disabled until the four cells are filled,
// so hover, focus and the API error are measured with a complete code. Both apps move to the next cell on input.
const verifyConfirmKey = 'heading.loginPage.emailVerification.confirmEmailAddress'
const typeVerifyCode: StateAction = async page => {
  await page.locator('.four-digit-input input').first().click()
  await page.keyboard.type('1234')
  await expect(page.getByRole('button', { name: tl(verifyConfirmKey), exact: true })).toBeEnabled()
}

export const loginVerifyEmailCode: ParityState = {
  ...loginVerifyEmail,
  id: 'login-verify-email-code',
  actions: {
    legacy: [...loginVerifyEmail.actions.legacy, typeVerifyCode],
    next: [...loginVerifyEmail.actions.next, typeVerifyCode],
  },
}

export const loginVerifyEmailSubmitHover = buttonHoverState(loginVerifyEmailCode, 'login-verify-email-submit-hover', verifyConfirmKey, 'lite')
export const loginVerifyEmailSubmitFocus = buttonFocusState(loginVerifyEmailCode, 'login-verify-email-submit-focus', verifyConfirmKey, 'lite')

const verifyCodeErrorResponse = {
  status: 422,
  json: {
    message: 'The given data was invalid.',
    errors: { code: ['The provided verification code is invalid.'] },
  },
}

export const loginVerifyEmailError: ParityState = {
  ...loginVerifyEmailCode,
  id: 'login-verify-email-error',
  handlers: { ...loginVerifyEmail.handlers, 'POST /verify-code': verifyCodeErrorResponse },
  actions: {
    legacy: [...loginVerifyEmailCode.actions.legacy, async page => {
      await page.getByRole('button', { name: tl(verifyConfirmKey), exact: true }).click()
      await settled(page.locator('.login-message--error'))
    }],
    next: [...loginVerifyEmailCode.actions.next, async page => {
      await page.getByRole('button', { name: tl(verifyConfirmKey), exact: true }).click()
      await settled(page.getByTestId('auth-error'))
    }],
  },
  probes: [
    ...loginVerifyEmail.probes,
    {
      key: 'error',
      legacy: page => page.locator('.login-message--error').first(),
      next: page => page.getByTestId('auth-error').first(),
    },
    {
      key: 'error-title',
      legacy: page => page.locator('.login-message--error .login-message__title').first(),
      next: page => page.getByTestId('auth-error').first().locator('.login-message__title'),
      internal: true,
    },
  ],
}

export const loginTwoFactor: ParityState = {
  id: 'login-two-factor',
  path: '/login',
  handlers: { 'POST /login': { json: { two_factor: true } } },
  actions: sameActions(...loginEmailSteps, async page => {
    await settled(page.getByRole('heading', { name: twoFactorTitle }))
  }),
  probes: [
    cardProbe,
    titleProbe,
    ...fieldProbes('code', 'input[name=one-time-code]', 'auth-field-code'),
    {
      key: 'info',
      legacy: page => page.getByText(tl('heading.loginPage.twoFactorAuthentication.info'), { exact: true }),
      next: page => page.getByText(tl('heading.loginPage.twoFactorAuthentication.info'), { exact: true }),
    },
    submitProbe('submit', 'button.verify', 'lite'),
    {
      key: 'back',
      legacy: page => page.getByRole('button', { name: tl('button.back'), exact: true }),
      next: page => page.getByTestId('auth-secondary'),
    },
    languageActivatorProbe,
  ],
}

const twoFactorErrorResponse = {
  status: 422,
  json: {
    message: 'The given data was invalid.',
    errors: { code: ['The provided two factor authentication code was invalid.'] },
  },
}

export const loginTwoFactorError: ParityState = {
  id: 'login-two-factor-error',
  path: '/login',
  handlers: {
    'POST /login': { json: { two_factor: true } },
    'POST /two-factor-challenge': twoFactorErrorResponse,
  },
  actions: {
    legacy: [
      ...loginEmailSteps,
      async page => {
        await page.getByLabel(tl('form.placeholder.code'), { exact: true }).fill('123456')
      },
      async page => {
        await page.getByRole('button', { name: tl('button.verify'), exact: true }).click()
      },
      async page => {
        await settled(page.locator('.login-message--error'))
      },
    ],
    next: [
      ...loginEmailSteps,
      async page => {
        await page.getByLabel(tl('form.placeholder.code'), { exact: true }).fill('123456')
      },
      async page => {
        await page.getByRole('button', { name: tl('button.verify'), exact: true }).click()
      },
      async page => {
        await settled(page.getByTestId('auth-two-factor-error'))
      },
    ],
  },
  probes: [
    cardProbe,
    titleProbe,
    {
      key: 'error',
      legacy: page => page.locator('.login-message--error').first(),
      next: page => page.getByTestId('auth-two-factor-error').first(),
    },
    {
      key: 'error-icon',
      legacy: page => page.locator('.login-message--error .login-message__icon-box .v-icon').first(),
      next: page => page.getByTestId('auth-two-factor-error').first().locator('.login-message__icon-box .v-icon'),
      internal: true,
    },
    {
      key: 'error-title',
      legacy: page => page.locator('.login-message--error .login-message__title').first(),
      next: page => page.getByTestId('auth-two-factor-error').first().locator('.login-message__title'),
      internal: true,
    },
    ...fieldProbes('code', 'input[name=one-time-code]', 'auth-field-code'),
    submitProbe('submit', 'button.verify', 'lite'),
    languageActivatorProbe,
  ],
}

// Pending 2FA verify (`POST /two-factor-challenge` `hold`): the verify button stays in its loading state.
export const loginTwoFactorPending: ParityState = {
  id: 'login-two-factor-pending',
  path: '/login',
  handlers: {
    'POST /login': { json: { two_factor: true } },
    'POST /two-factor-challenge': 'hold',
  },
  actions: {
    legacy: [
      ...loginEmailSteps,
      async page => {
        await page.getByLabel(tl('form.placeholder.code'), { exact: true }).fill('123456')
      },
      async page => {
        await page.getByRole('button', { name: tl('button.verify'), exact: true }).click()
      },
      waitForPendingSubmit.legacy,
    ],
    next: [
      ...loginEmailSteps,
      async page => {
        await page.getByLabel(tl('form.placeholder.code'), { exact: true }).fill('123456')
      },
      async page => {
        await page.getByRole('button', { name: tl('button.verify'), exact: true }).click()
      },
      waitForPendingSubmit.next,
    ],
  },
  probes: [
    cardProbe,
    titleProbe,
    ...pendingSubmitProbes,
    {
      key: 'info',
      legacy: page => page.getByText(tl('heading.loginPage.twoFactorAuthentication.info'), { exact: true }),
      next: page => page.getByText(tl('heading.loginPage.twoFactorAuthentication.info'), { exact: true }),
    },
    languageActivatorProbe,
  ],
  masks: pendingSubmitMasks,
}

const recoveryActions: StateAction[] = [
  ...loginEmailSteps,
  async page => {
    // More than six characters makes both apps send a recovery_code and show the new backup code.
    await page.getByLabel(tl('form.placeholder.code'), { exact: true }).fill('abcd1234-recovery')
  },
  async page => {
    await page.getByRole('button', { name: tl('button.verify'), exact: true }).click()
  },
  async page => {
    await settled(page.getByText(recoveryCodes[0]!))
  },
]

const recoveryHandlers = {
  'POST /login': { json: { two_factor: true } },
  'POST /two-factor-challenge': { status: 204 },
  'POST /user/two-factor-recovery-codes': { status: 204 },
  'GET /user/two-factor-recovery-codes': { json: recoveryCodes },
}

const recoveryContinueDisabled = submitDisabled('button.continue')

export const loginRecovery: ParityState = {
  id: 'login-recovery',
  path: '/login',
  handlers: recoveryHandlers,
  actions: {
    legacy: [...recoveryActions, recoveryContinueDisabled.legacy],
    next: [...recoveryActions, recoveryContinueDisabled.next],
  },
  probes: [
    cardProbe,
    titleProbe,
    {
      key: 'warning',
      legacy: page => page.locator('.alert--error'),
      next: page => page.getByTestId('auth-warning'),
    },
    {
      key: 'recovery-code',
      legacy: page => page.locator('.recovery-code-box'),
      next: page => page.getByTestId('auth-recovery-code'),
    },
    // Kit `CopyTextButton` idle (F-06).
    copyButtonProbe,
    {
      key: 'confirm-label',
      legacy: page => page.getByText(tl('heading.loginPage.recoveryCode.confirmationCheckbox'), { exact: true }),
      next: page => page.getByText(tl('heading.loginPage.recoveryCode.confirmationCheckbox'), { exact: true }),
    },
    // Kit `Checkbox` duty: the control.
    {
      key: 'confirm-control',
      legacy: page => page.locator('.checkbox .v-input--selection-controls__input'),
      next: page => page.getByTestId('auth-recovery-confirm').locator('.v-selection-control__input'),
      internal: true,
    },
    submitProbe('submit', 'button.continue', 'lite'),
    languageActivatorProbe,
  ],
}

// Legacy `CopyTextButton.vue` hardcodes these English strings instead of using i18n keys.
const recoveryMenuText = { legacy: 'Click to copy', next: tl('tooltip.copy') }
const copiedText = { legacy: 'Copied', next: tl('tooltip.copied') }

// Both apps open the same `v-menu` (content-class "v-tooltip menu-tooltip") from the kit `CopyTextButton`.
const copyMenu = {
  legacy: (page: Page) => page.locator('.menu-tooltip'),
  next: (page: Page) => page.locator('.menu-tooltip'),
}

const copyMenuProbe: Probe = {
  key: 'copy-menu',
  legacy: copyMenu.legacy,
  next: copyMenu.next,
  internal: true,
}

export const loginRecoveryCopyHover: ParityState = {
  id: 'login-recovery-copy-hover',
  path: '/login',
  handlers: recoveryHandlers,
  // The pointer stays on the copy button for the screenshot.
  pointer: 'keep',
  actions: {
    legacy: [...recoveryActions, async page => {
      await copyButton.legacy(page).hover()
      // Legacy opens the menu after open-delay=150; wait for its content, never for a timeout. The wait is on the DOM
      // (active class and text), not on visibility: deployed legacy ships `.v-tooltip{display:none}` after
      // `.v-menu__content` in chunk-vendors.css, so this menu (content-class "v-tooltip menu-tooltip") computes display:none.
      await expect(copyMenu.legacy(page)).toHaveClass(/menuable__content__active/)
      await expect(copyMenu.legacy(page)).toHaveText(recoveryMenuText.legacy)
    }],
    next: [...recoveryActions, async page => {
      await copyButton.next(page).hover()
      await expect(copyMenu.next(page).getByText(recoveryMenuText.next, { exact: true })).toBeVisible()
      await settled(copyMenu.next(page))
    }],
  },
  probes: [
    cardProbe,
    titleProbe,
    {
      key: 'recovery-code',
      legacy: page => page.locator('.recovery-code-box'),
      next: page => page.getByTestId('auth-recovery-code'),
    },
    copyButtonProbe,
    copyMenuProbe,
    languageActivatorProbe,
  ],
}

export const loginRecoveryCopied: ParityState = {
  id: 'login-recovery-copied',
  path: '/login',
  handlers: recoveryHandlers,
  pointer: 'keep',
  actions: {
    legacy: [...recoveryActions, async page => {
      await copyButton.legacy(page).click()
      // DOM wait, not visibility: see the hover state (deployed legacy renders this menu with display:none).
      await expect(copyMenu.legacy(page)).toHaveText(copiedText.legacy)
      await expect.poll(() => readParityClipboard(page), { message: 'legacy clipboard stub did not receive the recovery code' }).toBe(recoveryCodes[0])
    }],
    next: [...recoveryActions, async page => {
      await copyButton.next(page).click()
      await expect(copyMenu.next(page).getByText(copiedText.next, { exact: true })).toBeVisible()
      await expect.poll(() => readParityClipboard(page), { message: 'next clipboard stub did not receive the recovery code' }).toBe(recoveryCodes[0])
      await settled(copyMenu.next(page))
    }],
  },
  // Next resets its copied text 1500 ms after the click and is captured after legacy; fail instead of recording the reset frame.
  afterCapture: {
    legacy: [async page => {
      await expect(copyMenu.legacy(page), 'Harness error: legacy copied text changed during capture').toHaveText(copiedText.legacy)
    }],
    next: [async page => {
      await expect(copyMenu.next(page), 'Harness error: next copied text changed during capture').toHaveText(copiedText.next)
    }],
  },
  probes: [
    cardProbe,
    titleProbe,
    {
      key: 'recovery-code',
      legacy: page => page.locator('.recovery-code-box'),
      next: page => page.getByTestId('auth-recovery-code'),
    },
    copyButtonProbe,
    copyMenuProbe,
    languageActivatorProbe,
  ],
}

export const loginError: ParityState = {
  id: 'login-error',
  path: '/login',
  home: { app: { registration_enabled: true } },
  handlers: { 'POST /login': invalidCredentials },
  actions: {
    legacy: [...loginEmailSteps, async page => {
      await settled(page.locator('.login-message--error'))
    }],
    next: [...loginEmailSteps, async page => {
      await settled(page.getByTestId('auth-error'))
    }],
  },
  probes: [
    cardProbe,
    titleProbe,
    ...errorProbes,
    ...fieldProbes('email', 'input[name=email]', 'auth-field-email'),
    submitProbe('submit', 'button.logIn', 'lite'),
    bottomBoxProbe,
    languageActivatorProbe,
  ],
}

export const loginErrorSupport: ParityState = {
  id: 'login-error-support',
  path: '/login',
  home: { app: { registration_enabled: true, support_link: 'https://example.com/support' } },
  handlers: { 'POST /login': invalidCredentials },
  actions: loginError.actions,
  probes: [
    cardProbe,
    titleProbe,
    ...errorProbes,
    {
      key: 'error-desc',
      legacy: page => page.locator('.login-message--error .login-message__desc').first(),
      next: page => page.getByTestId('auth-error').first().locator('.login-message__desc'),
      internal: true,
    },
    {
      key: 'error-support-link',
      legacy: page => page.locator('.login-message--error').getByRole('link', { name: tl('message.support.link') }),
      next: page => page.getByTestId('auth-error').getByRole('link', { name: tl('message.support.link') }),
    },
    submitProbe('submit', 'button.logIn', 'lite'),
    bottomBoxProbe,
    languageActivatorProbe,
  ],
}

// Error banner from the social callback redirect (`/login?account_already_exists=true`): the message is set on mount, no request.
export const loginAccountExists: ParityState = {
  id: 'login-account-exists',
  path: '/login?account_already_exists=true',
  home: { app: { registration_enabled: true } },
  actions: {
    legacy: [async page => {
      await settled(page.locator('.login-message--error'))
    }],
    next: [async page => {
      await settled(page.getByTestId('auth-error'))
    }],
  },
  probes: [
    cardProbe,
    titleProbe,
    ...errorProbes,
    submitProbe('submit', 'button.logIn', 'lite'),
    bottomBoxProbe,
    languageActivatorProbe,
  ],
}

export const loginSocial: ParityState = {
  id: 'login-social',
  path: '/login',
  home: { app: { registration_enabled: true, integrations: { auth: ['google', 'github'] } } },
  actions: { legacy: [], next: [] },
  probes: [
    cardProbe,
    titleProbe,
    submitProbe('submit', 'button.logIn', 'lite'),
    {
      key: 'or-divider',
      legacy: page => page.locator('.or-divider'),
      next: page => page.getByTestId('auth-or-divider'),
    },
    {
      key: 'social-google',
      legacy: page => page.getByRole('button', { name: /Google/ }),
      next: page => page.getByTestId('auth-social-google'),
    },
    {
      key: 'social-github',
      legacy: page => page.getByRole('button', { name: /Github/i }),
      next: page => page.getByTestId('auth-social-github'),
    },
    bottomBoxProbe,
    languageActivatorProbe,
  ],
}

// Hover of the Google social button: its `.v-btn__overlay` (V4) pairs with the legacy button's `::before` (V2).
export const loginSocialHover: ParityState = {
  ...loginSocial,
  id: 'login-social-hover',
  // The pointer stays on the Google button for the screenshot.
  pointer: 'keep',
  actions: {
    legacy: [async page => {
      await page.getByRole('button', { name: /Google/ }).hover()
    }],
    next: [async page => {
      await page.getByTestId('auth-social-google').hover()
    }],
  },
  // The scroll reset before the probes could move the button away from the pointer; the hover is asserted after capture.
  afterCapture: {
    legacy: [async page => {
      expect(await page.getByRole('button', { name: /Google/ }).evaluate(element => element.matches(':hover')), 'pointer on the button').toBe(true)
    }],
    next: [async page => {
      expect(await page.getByTestId('auth-social-google').evaluate(element => element.matches(':hover')), 'pointer on the button').toBe(true)
    }],
  },
  probes: [
    ...loginSocial.probes,
    {
      key: 'button-overlay',
      legacy: page => page.getByRole('button', { name: /Google/ }),
      next: page => page.getByTestId('auth-social-google').locator('.v-btn__overlay'),
      pseudo: { legacy: '::before' },
      internal: true,
    },
  ],
}

// Pending social redirect (`GET /auth/google/redirect-url` `hold`): the Google button stays in its loading state (`authLoading`).
const socialPendingMasks = {
  legacy: [(page: Page) => page.locator('.social-login-btn.v-btn--loading .v-progress-circular')],
  next: [(page: Page) => page.getByTestId('auth-social-google').locator('.v-progress-circular')],
}

export const loginSocialPending: ParityState = {
  id: 'login-social-pending',
  path: '/login',
  home: { app: { registration_enabled: true, integrations: { auth: ['google', 'github'] } } },
  handlers: { 'GET /auth/google/redirect-url': 'hold' },
  actions: {
    legacy: [
      async page => {
        await page.getByRole('button', { name: /Google/ }).click()
      },
      async page => {
        await settled(page.locator('.social-login-btn.v-btn--loading .v-progress-circular').first())
      },
    ],
    next: [
      async page => {
        await page.getByTestId('auth-social-google').click()
      },
      async page => {
        await settled(page.getByTestId('auth-social-google').locator('.v-progress-circular'))
      },
    ],
  },
  probes: [
    cardProbe,
    titleProbe,
    submitProbe('submit', 'button.logIn', 'lite'),
    {
      key: 'social-google',
      legacy: page => page.locator('.social-login-btn.v-btn--loading').first(),
      next: page => page.getByTestId('auth-social-google'),
    },
    {
      key: 'social-google-loader',
      legacy: page => page.locator('.social-login-btn.v-btn--loading .v-btn__loader').first(),
      next: page => page.getByTestId('auth-social-google').locator('.v-btn__loader'),
      internal: true,
    },
    {
      key: 'social-github',
      // Both social buttons share `authLoading` in legacy and next, so the Github button is loading too (second in order).
      legacy: page => page.locator('.social-login-btn.v-btn--loading').nth(1),
      next: page => page.getByTestId('auth-social-github'),
    },
    bottomBoxProbe,
    languageActivatorProbe,
  ],
  masks: socialPendingMasks,
}

export const loginFieldError: ParityState = {
  id: 'login-field-error',
  path: '/login',
  home: { app: { registration_enabled: true } },
  actions: {
    // Legacy drops the accessible name of a filled field, so it is addressed by its `name` after typing.
    legacy: [async page => {
      const field = page.locator('input[name=email]')
      await field.fill('not-an-email')
      // validate-on-blur: leaving the field shows the rule message, no request is sent.
      await field.blur()
      await settled(page.locator('.v-messages__message').first())
    }],
    next: [async page => {
      const field = page.getByLabel(tl('form.label.emailAddress'), { exact: true })
      await field.fill('not-an-email')
      await field.blur()
      await settled(page.locator('.v-messages__message').first())
    }],
  },
  probes: [
    cardProbe,
    titleProbe,
    ...fieldProbes('email', 'input[name=email]', 'auth-field-email'),
    {
      key: 'field-message',
      legacy: page => page.locator('.v-messages__message').first(),
      next: page => page.getByTestId('auth-field-email').locator('.v-messages__message'),
      internal: true,
    },
    submitProbe('submit', 'button.logIn', 'lite'),
    bottomBoxProbe,
    languageActivatorProbe,
  ],
}

export const loginLanguageMenu: ParityState = {
  id: 'login-language-menu',
  path: '/login',
  home: {
    app: {
      languages: ['en', 'de', 'fr', 'es'],
      language_flags: { en: 'GB', de: 'DE', fr: 'FR', es: 'ES' },
    },
  },
  actions: {
    legacy: [async page => {
      await page.locator('#languageSwitcher').getByRole('button').click()
      const menu = page.locator('#languageSwitcher .v-menu__content')
      await settled(menu)
      // Vuetify 2 positions the menu once on open, before flags and fonts have sized the activator; a resize makes it measure again.
      await page.evaluate(async () => {
        await Promise.all([...document.querySelectorAll<HTMLImageElement>('#languageSwitcher img')].map(image => image.decode().catch(() => undefined)))
        await document.fonts.ready
        window.dispatchEvent(new Event('resize'))
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      })
    }],
    next: [async page => {
      await page.getByTestId('language-activator').click()
      await settled(page.getByTestId('language-menu'))
    }],
  },
  probes: [
    {
      // Anchor: the open menu.
      key: 'menu',
      legacy: page => page.locator('#languageSwitcher .v-menu__content'),
      next: page => page.getByTestId('language-menu'),
    },
    cardProbe,
    {
      ...languageActivatorProbe,
      // aria-expanded=true styles the activator while the menu is open.
      key: 'language-activator-open',
    },
    {
      key: 'menu-search',
      legacy: page => page.locator('#languageSwitcher .v-menu__content .v-input__slot'),
      next: page => page.getByTestId('language-menu').locator('.v-field'),
      part: 'box',
      internal: true,
    },
    {
      key: 'menu-search-input',
      legacy: page => page.locator('#languageSwitcher .v-menu__content').getByPlaceholder('Search'),
      next: page => page.getByTestId('language-menu').getByPlaceholder('Search'),
      part: 'input',
      internal: true,
    },
    {
      key: 'menu-item',
      legacy: page => page.locator('#languageSwitcher .v-menu__content .v-list-item').first(),
      next: page => page.getByTestId('language-menu').locator('.v-list-item').first(),
      internal: true,
    },
    {
      key: 'menu-item-active',
      legacy: page => page.locator('#languageSwitcher .v-menu__content .v-list-item--is-active'),
      next: page => page.getByTestId('language-menu').locator('.v-list-item--active'),
      internal: true,
    },
  ],
}

// 7-state matrix (auth-pages): hover and keyboard focus of the email step's submit button.
export const loginEmailSubmitHover = buttonHoverState(loginEmail, 'login-email-submit-hover', 'button.logIn', 'lite')
export const loginEmailSubmitFocus = buttonFocusState(loginEmail, 'login-email-submit-focus', 'button.logIn', 'lite')

// Hub button on the email step (`home.app.hub_login`, S-75): legacy `Login.vue` shows it under the same "or" divider as the social buttons.
export const loginHubDefault: ParityState = {
  id: 'login-hub-default',
  path: '/login',
  home: { app: { hub_login: true } },
  actions: { legacy: [], next: [] },
  probes: [
    cardProbe,
    titleProbe,
    submitProbe('submit', 'button.logIn', 'lite'),
    {
      key: 'or-divider',
      legacy: page => page.locator('.or-divider'),
      next: page => page.getByTestId('auth-or-divider'),
    },
    {
      key: 'hub-button',
      legacy: page => page.getByRole('button', { name: tl('button.signInWithPanelAlpha'), exact: true }),
      next: page => page.getByTestId('auth-hub-login'),
    },
    languageActivatorProbe,
  ],
}

// Hover of the hub button on the email step (`button.signInWithPanelAlpha`, same overlay pairing as the submit hover).
export const loginHubHover: ParityState = {
  ...buttonHoverState(loginHubDefault, 'login-hub-hover', 'button.signInWithPanelAlpha', 'lite'),
  id: 'login-hub-hover',
}

// Keyboard focus of the hub button on the email step (same helper as the submit focus; `focus()` is called directly, so no Tab count).
export const loginHubFocus: ParityState = {
  ...buttonFocusState(loginHubDefault, 'login-hub-focus', 'button.signInWithPanelAlpha', 'lite'),
  id: 'login-hub-focus',
}

// Error of the hub start (`GET /hub-login/start` 500): legacy `Login.vue:747-753` puts the message into `errors` and clears the loading; next `startHubLogin` does the same.
export const loginHubError: ParityState = {
  id: 'login-hub-error',
  path: '/login',
  home: { app: { hub_login: true } },
  handlers: { 'GET /hub-login/start': { status: 500, json: { message: 'Server Error' } } },
  actions: {
    legacy: [
      async page => {
        await page.getByRole('button', { name: tl('button.signInWithPanelAlpha'), exact: true }).click()
      },
      async page => {
        await settled(page.locator('.login-message--error'))
      },
    ],
    next: [
      async page => {
        await page.getByTestId('auth-hub-login').click()
      },
      async page => {
        await settled(page.getByTestId('auth-error'))
      },
    ],
  },
  probes: [
    cardProbe,
    titleProbe,
    ...errorProbes,
    {
      key: 'hub-button',
      legacy: page => page.getByRole('button', { name: tl('button.signInWithPanelAlpha'), exact: true }),
      next: page => page.getByTestId('auth-hub-login'),
    },
    languageActivatorProbe,
  ],
}

// Loading of the hub start (`GET /hub-login/start` `hold`): the hub button stays in its loading state (`hubLoading`, legacy `:loading="hubLoading"`).
// The hub button has no name while loading (its text is hidden), so it is addressed by its loading class / test id.
export const loginHubLoading: ParityState = {
  id: 'login-hub-loading',
  path: '/login',
  home: { app: { hub_login: true } },
  handlers: { 'GET /hub-login/start': 'hold' },
  actions: {
    legacy: [
      async page => {
        await page.getByRole('button', { name: tl('button.signInWithPanelAlpha'), exact: true }).click()
      },
      async page => {
        await settled(page.locator('.social-login-btn.v-btn--loading .v-progress-circular'))
      },
    ],
    next: [
      async page => {
        await page.getByTestId('auth-hub-login').click()
      },
      async page => {
        await settled(page.getByTestId('auth-hub-login').locator('.v-progress-circular'))
      },
    ],
  },
  probes: [
    cardProbe,
    titleProbe,
    submitProbe('submit', 'button.logIn', 'lite'),
    {
      key: 'or-divider',
      legacy: page => page.locator('.or-divider'),
      next: page => page.getByTestId('auth-or-divider'),
    },
    {
      key: 'hub-button',
      legacy: page => page.locator('.social-login-btn.v-btn--loading'),
      next: page => page.getByTestId('auth-hub-login'),
    },
    {
      key: 'hub-button-loader',
      legacy: page => page.locator('.social-login-btn.v-btn--loading .v-btn__loader'),
      next: page => page.getByTestId('auth-hub-login').locator('.v-btn__loader'),
      internal: true,
    },
    languageActivatorProbe,
  ],
  masks: {
    legacy: [(page: Page) => page.locator('.social-login-btn.v-btn--loading .v-progress-circular')],
    next: [(page: Page) => page.getByTestId('auth-hub-login').locator('.v-progress-circular')],
  },
}

const states: ParityState[] = [
  loginEmail,
  loginEmailLite,
  loginHubDefault,
  loginHubHover,
  loginHubFocus,
  loginHubError,
  loginHubLoading,
  loginEmailSubmitHover,
  loginEmailSubmitFocus,
  loginEmailPending,
  loginPassword,
  loginPasswordRememberFocus,
  loginPasswordPending,
  loginSetPassword,
  loginVerifyEmail,
  loginVerifyEmailCode,
  loginVerifyEmailSubmitHover,
  loginVerifyEmailSubmitFocus,
  loginVerifyEmailError,
  loginTwoFactor,
  loginTwoFactorError,
  loginTwoFactorPending,
  loginRecovery,
  loginRecoveryCopyHover,
  loginRecoveryCopied,
  loginError,
  loginErrorSupport,
  loginAccountExists,
  loginSocial,
  loginSocialHover,
  loginSocialPending,
  loginFieldError,
  loginLanguageMenu,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
