import type { Handler, ParityState, Probe, StateAction } from './state'
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
  QUICK_EMAIL,
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

const termsOfService = tr('heading.registerPage.termsOfService', 'lite')
const verifyEmailTitle = tr('heading.loginPage.emailVerification.title', 'lite')
const creatingTitle = tr('heading.registerPage.creatingAccount.title', 'lite')
const creatingText = tr('heading.registerPage.creatingAccount.text', 'lite')

const registerEmailSteps = submitEmail('button.register', 'lite')
const sameActions = (...actions: StateAction[]) => ({ legacy: actions, next: actions })
// Disabled submit (phase 14): the action asserts the disabled button on each side before the probe measures it.
function submitDisabled (legacyKey: string): { legacy: StateAction, next: StateAction } {
  return {
    legacy: async page => {
      await expect(page.getByRole('button', { name: tr(legacyKey, 'lite'), exact: true })).toBeDisabled()
    },
    next: async page => {
      await expect(page.getByTestId('auth-submit')).toBeDisabled()
    },
  }
}
const registerSubmit = submitProbe('submit', 'button.register', 'lite')
const verifyEmailSettled: StateAction = async page => {
  await settled(page.getByRole('heading', { name: verifyEmailTitle }))
}

const sampleTerms = `
  <h4>1. Acceptance of terms</h4>
  <p>By creating an account you agree to these Terms of Service. Please read them carefully before you continue.</p>
  <h4>2. Your account</h4>
  <p>You are responsible for keeping your credentials confidential and for every action taken under your account.</p>
  <ul>
    <li>Provide accurate and complete information.</li>
    <li>Keep your password secret.</li>
    <li>Tell us about any unauthorized use.</li>
  </ul>
  <h4>3. Acceptable use</h4>
  <p>You may not use the service for unlawful purposes or to interfere with other customers.</p>
`

const bottomLinkProbes: Probe[] = [
  {
    key: 'bottom-link-sign-in',
    legacy: (page: Page) => page.getByRole('link', { name: tr('button.signIn', 'lite'), exact: true }),
    next: (page: Page) => page.getByTestId('auth-bottom-link').first(),
  },
  {
    key: 'bottom-link-reset',
    legacy: (page: Page) => page.getByRole('link', { name: tr('button.resetPassword', 'lite'), exact: true }),
    next: (page: Page) => page.getByTestId('auth-bottom-link').nth(1),
  },
]

export const registerEmail: ParityState = {
  id: 'register-email',
  path: '/register',
  home: { app: { registration_enabled: true } },
  actions: { legacy: [], next: [] },
  probes: [
    cardProbe,
    titleProbe,
    ...fieldProbes('email', 'input[name=email]', 'auth-field-email'),
    {
      key: 'terms-link',
      legacy: page => page.getByText(termsOfService, { exact: true }),
      next: page => page.getByTestId('auth-terms-link'),
    },
    registerSubmit,
    bottomBoxProbe,
    ...bottomLinkProbes,
    languageActivatorProbe,
  ],
}

export const registerTermsModal: ParityState = {
  id: 'register-terms-modal',
  path: '/register',
  home: { app: { registration_enabled: true, registration_tos: sampleTerms } },
  actions: {
    // Both sides open the modal with a DOM click, without scrolling the page (lessons.md: V4 locks the page scroll with
    // `html { position: fixed; top: -scrollY }`, which a pointer click's scroll-into-view would shift against legacy).
    legacy: [async page => {
      await page.getByText(termsOfService, { exact: true }).evaluate(el => (el as HTMLElement).click())
      await settled(page.locator('.v-dialog--active'))
    }],
    next: [async page => {
      await page.getByTestId('auth-terms-link').evaluate(el => (el as HTMLElement).click())
      await settled(page.getByTestId('terms-modal').locator('.v-card'))
    }],
  },
  probes: [
    {
      // Anchor: V2 `.v-dialog--active` is the dialog box, which is `.v-overlay__content` in V4.
      key: 'modal-box',
      legacy: page => page.locator('.v-dialog--active'),
      next: page => page.getByTestId('terms-modal').locator('.v-overlay__content'),
      internal: true,
    },
    {
      key: 'modal-card',
      legacy: page => page.locator('.v-dialog--active .v-card'),
      next: page => page.getByTestId('terms-modal').locator('.v-card'),
      internal: true,
    },
    {
      key: 'modal-title',
      legacy: page => page.locator('.v-dialog--active .v-card__title'),
      next: page => page.getByTestId('terms-modal').locator('.v-card-title'),
      internal: true,
    },
    {
      key: 'modal-body',
      legacy: page => page.locator('.v-dialog--active .well'),
      next: page => page.getByTestId('terms-modal').locator('.well'),
      internal: true,
    },
    {
      key: 'modal-close',
      legacy: page => page.locator('.v-dialog--active').getByRole('button', { name: tr('button.close', 'lite'), exact: true }),
      next: page => page.getByTestId('terms-modal').getByRole('button', { name: tr('button.close', 'lite'), exact: true }),
    },
  ],
}

// Control-panel upgrade: the modal shows `from_control_panel_registration.tos` and the registration gate is skipped, so the
// fixture keeps `registration_enabled: false` (legacy Register.vue:402, RegistrationTermsModal.vue:49).
export const registerTermsModalCp: ParityState = {
  ...registerTermsModal,
  id: 'register-terms-modal-cp',
  path: '/register?control-panel-upgrade&token=parity-token',
  home: { app: { from_control_panel_registration: { tos: sampleTerms } } },
}

// Empty terms: `registration_tos` is null on the lite fixture, so the `.well` stays empty (legacy RegistrationTermsModal.vue:26).
export const registerTermsModalEmpty: ParityState = {
  ...registerTermsModal,
  id: 'register-terms-modal-empty',
  probes: [
    ...registerTermsModal.probes,
    // Page behind the scrim (diagnostic for the light-mobile glow offset): where the submit button sits while the modal is open.
    {
      key: 'behind-submit',
      legacy: page => page.locator('.login-container button.v-btn:has-text("Register")').first(),
      next: page => page.locator('.login-container button.v-btn:has-text("Register")').first(),
    },
  ],
  home: { app: { registration_enabled: true } },
}

export const registerSetPassword: ParityState = {
  id: 'register-set-password',
  path: '/register',
  home: { app: { registration_enabled: true } },
  handlers: { 'POST /register': { json: { set_password: true } } },
  actions: {
    legacy: [...registerEmailSteps, async page => {
      await settled(page.locator('.login-message--success'))
    }],
    next: [...registerEmailSteps, async page => {
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
    registerSubmit,
    bottomBoxProbe,
    languageActivatorProbe,
  ],
}

export const registerEmailPending: ParityState = {
  id: 'register-email-pending',
  path: '/register',
  home: { app: { registration_enabled: true } },
  // The request never completes: the submit button stays in its loading state.
  handlers: { 'POST /register': 'hold' },
  actions: {
    legacy: [...registerEmailSteps, waitForPendingSubmit.legacy],
    next: [...registerEmailSteps, waitForPendingSubmit.next],
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

const emailMessage = {
  legacy: (page: Page) => page.locator('.v-input').filter({ has: page.locator('input[name=email]') }).locator('.v-messages__message'),
  next: (page: Page) => page.getByTestId('auth-field-email').locator('.v-messages__message'),
}

export const registerEmailInvalid: ParityState = {
  id: 'register-email-invalid',
  path: '/register',
  home: { app: { registration_enabled: true } },
  actions: {
    // Legacy drops the accessible name of a filled field, so it is addressed by its `name`.
    legacy: [async page => {
      const field = page.locator('input[name=email]')
      await field.fill('not-an-email')
      // validate-on-blur: leaving the field shows the rule message, no request is sent.
      await field.blur()
      await settled(emailMessage.legacy(page))
    }],
    next: [async page => {
      const field = page.getByLabel(tr('form.label.emailAddress', 'lite'), { exact: true })
      await field.fill('not-an-email')
      await field.blur()
      await settled(emailMessage.next(page))
    }],
  },
  probes: [
    cardProbe,
    titleProbe,
    ...fieldProbes('email', 'input[name=email]', 'auth-field-email'),
    {
      key: 'field-message',
      legacy: emailMessage.legacy,
      next: emailMessage.next,
      internal: true,
    },
    registerSubmit,
    bottomBoxProbe,
    ...bottomLinkProbes,
    languageActivatorProbe,
  ],
}

// Seven characters: below legacy `registerPasswordRules` (min 8). Both fields get the same value, so no mismatch is involved
// (legacy register has no confirmation check).
const SHORT_PASSWORD = 'Abcdef1'

export const registerSetPasswordInvalid: ParityState = {
  id: 'register-set-password-invalid',
  path: '/register',
  home: { app: { registration_enabled: true } },
  handlers: { 'POST /register': { json: { set_password: true } } },
  actions: {
    legacy: [
      ...registerEmailSteps,
      async page => {
        await settled(page.locator('.login-message--success'))
      },
      async page => {
        // By `name`: legacy drops the accessible name of a filled field.
        const password = page.locator('input[name=new-password]')
        await password.fill(SHORT_PASSWORD)
        await password.blur()
        const confirm = page.locator('input[name=confirm-password]')
        await confirm.fill(SHORT_PASSWORD)
        await confirm.blur()
        await settled(page.locator('.v-messages__message').first())
      },
    ],
    next: [
      ...registerEmailSteps,
      async page => {
        await settled(page.getByTestId('auth-success'))
      },
      async page => {
        const password = page.getByLabel(tr('form.label.password', 'lite'), { exact: true })
        await password.fill(SHORT_PASSWORD)
        await password.blur()
        const confirm = page.getByLabel(tr('form.label.passwordConfirm', 'lite'), { exact: true })
        await confirm.fill(SHORT_PASSWORD)
        await confirm.blur()
        // Next uses min 8 too (registerPasswordRules), so the message shows for seven characters as in legacy. The typed value is the
        // wait: the blur has run the rule by then.
        await expect(confirm).toHaveValue(SHORT_PASSWORD)
      },
    ],
  },
  probes: [
    cardProbe,
    titleProbe,
    ...fieldProbes('password', 'input[name=new-password]', 'auth-field-password'),
    ...fieldProbes('password-confirm', 'input[name=confirm-password]', 'auth-field-password-confirm'),
    {
      key: 'field-message',
      legacy: page => page.locator('.v-input').filter({ has: page.locator('input[name=new-password]') }).locator('.v-messages__message'),
      next: page => page.getByTestId('auth-field-password').locator('.v-messages__message'),
      internal: true,
    },
    {
      key: 'field-confirm-message',
      legacy: page => page.locator('.v-input').filter({ has: page.locator('input[name=confirm-password]') }).locator('.v-messages__message'),
      next: page => page.getByTestId('auth-field-password-confirm').locator('.v-messages__message'),
      internal: true,
    },
    registerSubmit,
    bottomBoxProbe,
    languageActivatorProbe,
  ],
}

export const registerVerifyEmail: ParityState = {
  id: 'register-verify-email',
  path: '/register',
  home: { app: { registration_enabled: true } },
  handlers: { 'POST /register': { json: { verify_email: true } } },
  actions: {
    legacy: [...registerEmailSteps, verifyEmailSettled, submitDisabled('heading.loginPage.emailVerification.confirmEmailAddress').legacy],
    next: [...registerEmailSteps, verifyEmailSettled, submitDisabled('heading.loginPage.emailVerification.confirmEmailAddress').next],
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
      key: 'code-cell',
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

export const registerAlreadyRegistered: ParityState = {
  id: 'register-already-registered',
  path: '/register',
  home: { app: { registration_enabled: true } },
  handlers: {
    // Shape of AuthController::register: the message list is not keyed by field.
    'POST /register': {
      status: 422,
      json: {
        error_type: 'email_already_registered',
        errors: [['The email address is already registered.']],
      },
    },
  },
  actions: {
    legacy: [...registerEmailSteps, async page => {
      await settled(page.locator('.login-message--error'))
    }],
    next: [...registerEmailSteps, async page => {
      await settled(page.getByTestId('auth-error'))
    }],
  },
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
      key: 'error-login-link',
      legacy: page => page.locator('.login-message--error').getByRole('link').first(),
      next: page => page.getByTestId('auth-error').getByRole('link').first(),
    },
    ...fieldProbes('email', 'input[name=email]', 'auth-field-email'),
    registerSubmit,
    bottomBoxProbe,
    languageActivatorProbe,
  ],
}

// Generic 422 with the support link on (legacy Register.vue:74-85): `message.support.*` under the error, no "already registered" text.
export const registerErrorSupport: ParityState = {
  id: 'register-error-support',
  path: '/register',
  home: { app: { registration_enabled: true, support_link: 'https://example.com/support' } },
  handlers: {
    'POST /register': {
      status: 422,
      json: {
        errors: [['The given data was invalid.']],
      },
    },
  },
  actions: {
    legacy: [...registerEmailSteps, async page => {
      await settled(page.locator('.login-message--error'))
    }],
    next: [...registerEmailSteps, async page => {
      await settled(page.getByTestId('auth-error'))
    }],
  },
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
      legacy: page => page.locator('.login-message--error').getByRole('link', { name: tr('message.support.link', 'lite') }),
      next: page => page.getByTestId('auth-error').getByRole('link', { name: tr('message.support.link', 'lite') }),
    },
    ...fieldProbes('email', 'input[name=email]', 'auth-field-email'),
    registerSubmit,
    bottomBoxProbe,
    languageActivatorProbe,
  ],
}

const quickCard: Probe = {
  key: 'quick-card',
  legacy: (page: Page) => page.locator('.login-container .v-card'),
  next: (page: Page) => page.getByTestId('auth-quick-card'),
}

const quickProbes: Probe[] = [
  quickCard,
  titleProbe,
  {
    key: 'text',
    legacy: (page: Page) => page.getByText(creatingText, { exact: true }),
    next: (page: Page) => page.getByText(creatingText, { exact: true }),
  },
  languageActivatorProbe,
]

// Both apps first paint the regular form for a moment; the title proves the quick card is up.
const waitForQuickCard: StateAction = async page => {
  await settled(page.getByRole('heading', { name: creatingTitle }))
}

export const registerQuickPending: ParityState = {
  id: 'register-quick-pending',
  path: `/register/${QUICK_EMAIL}`,
  home: { app: { registration_enabled: true } },
  // The request never completes: the spinner state stays up.
  handlers: { 'POST /register': 'hold' },
  actions: sameActions(waitForQuickCard),
  probes: [
    ...quickProbes,
    {
      key: 'spinner',
      legacy: page => page.locator('.login-container .v-card .v-progress-circular'),
      next: page => page.getByTestId('auth-quick-card').locator('.v-progress-circular'),
      internal: true,
    },
    // Kit `Loader` 118 px holds the `$loadingHourglass` icon in its slot (legacy Register.vue:277-281).
    // New element in next: probed through the test id on the icon in the kit `Loader` slot.
    {
      key: 'spinner-icon',
      legacy: page => page.locator('.login-container .v-card .v-progress-circular .v-icon'),
      next: page => page.getByTestId('auth-quick-loader-icon'),
      internal: true,
    },
  ],
  masks: {
    legacy: [page => page.locator('.login-container .v-card .v-progress-circular')],
    next: [page => page.getByTestId('auth-quick-card').locator('.v-progress-circular')],
  },
}

export const registerQuickDone: ParityState = {
  id: 'register-quick-done',
  // `new-site` sets skipDashboard in both apps; without it both navigate away from the fixture surface.
  path: `/register/${QUICK_EMAIL}?new-site`,
  home: { app: { registration_enabled: true } },
  // A getter: every run (app x variant) gets a fresh `registered` flag. Legacy `websocketListen()` re-reads `/home` right after the
  // sign-in, so with a user-less `/home` it would drop the user and hide the footer. A real backend answers `/home` with the
  // user once the session exists; this models it: no user before `POST /register`, the user after it.
  get handlers (): Record<string, Handler> {
    let registered = false
    const user = {
      id: 1,
      email: QUICK_EMAIL,
      language: 'en',
      services: [],
      password_change_required: false,
      two_factor_auth_required: false,
    }
    return {
      'POST /register': ({ home }) => {
        registered = true
        return { json: { ...home, user } }
      },
      'GET /home': ({ home }) => ({ json: registered ? { ...home, user } : home }),
      // Next loads notifications after every in-app sign-in (deliberate deviation, signed-in-shell Phase 4); legacy only on a cold start.
      'GET /notifications': () => ({ json: { data: [], meta: { total: 0 } } }),
    }
  },
  actions: {
    legacy: [async page => {
      await settled(page.locator('.login-container .v-card__text > svg'))
    }],
    next: [async page => {
      await settled(page.locator('.quick-register-check'))
    }],
  },
  probes: [
    ...quickProbes,
    {
      key: 'check',
      legacy: page => page.locator('.login-container .v-card__text > svg'),
      next: page => page.getByTestId('auth-quick-card').locator('.quick-register-check'),
      internal: true,
    },
  ],
}

// Social providers under the email form (`home.app.integrations.auth`): the same `or-divider` + provider buttons as login (Charge E).
export const registerSocial: ParityState = {
  id: 'register-social',
  path: '/register',
  home: { app: { registration_enabled: true, integrations: { auth: ['google', 'github'] } } },
  actions: { legacy: [], next: [] },
  probes: [
    cardProbe,
    titleProbe,
    ...fieldProbes('email', 'input[name=email]', 'auth-field-email'),
    registerSubmit,
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
    ...bottomLinkProbes,
    languageActivatorProbe,
  ],
}

// Registration closed on the lite fixture: `/register` bounces to the login card (legacy `beforeRouteEnter` / next `beforeEnter`).
export const registerDisabledRedirect: ParityState = {
  id: 'register-disabled-redirect',
  path: '/register',
  actions: { legacy: [], next: [] },
  probes: [
    cardProbe,
    titleProbe,
    ...fieldProbes('email', 'input[name=email]', 'auth-field-email'),
    submitProbe('submit', 'button.logIn', 'lite'),
    languageActivatorProbe,
  ],
}

// Hover of the Google social button (S-79 F4 pattern, `login-social-hover`): its `.v-btn__overlay` pairs with the legacy `::before`.
export const registerSocialHover: ParityState = {
  ...registerSocial,
  id: 'register-social-hover',
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
    ...registerSocial.probes,
    {
      key: 'button-overlay',
      legacy: page => page.getByRole('button', { name: /Google/ }),
      next: page => page.getByTestId('auth-social-google').locator('.v-btn__overlay'),
      pseudo: { legacy: '::before' },
      internal: true,
    },
  ],
}

// Failed social redirect (`GET /auth/google/redirect-url` 500): the banner carries the server message (legacy Register.vue:542-544).
// Only the first error is shown; the probes repeat the social block of `register-social` after the banner.
export const registerSocialError: ParityState = {
  id: 'register-social-error',
  path: '/register',
  home: { app: { registration_enabled: true, integrations: { auth: ['google', 'github'] } } },
  handlers: {
    'GET /auth/google/redirect-url': {
      status: 500,
      json: { message: 'Social sign-in is unavailable.' },
    },
  },
  actions: {
    legacy: [
      async page => {
        await page.getByRole('button', { name: /Google/ }).click()
      },
      async page => {
        await settled(page.locator('.login-message--error'))
        await page.mouse.move(0, 0)
      },
    ],
    next: [
      async page => {
        await page.getByTestId('auth-social-google').click()
      },
      async page => {
        await settled(page.getByTestId('auth-error'))
        await page.mouse.move(0, 0)
      },
    ],
  },
  probes: [
    cardProbe,
    titleProbe,
    ...errorProbes,
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
    registerSubmit,
    bottomBoxProbe,
    ...bottomLinkProbes,
    languageActivatorProbe,
  ],
}

// Pending social redirect (`GET /auth/google/redirect-url` `hold`): both social buttons share `authLoading` (Register.vue:530-547),
// so the spinner shows on Google (first) and Github (second), as on login (`login-social-pending`).
const registerSocialPendingMasks = {
  legacy: [(page: Page) => page.locator('.social-login-btn .v-progress-circular')],
  next: [(page: Page) => page.locator('[data-testid^="auth-social-"] .v-progress-circular')],
}

export const registerSocialPending: ParityState = {
  id: 'register-social-pending',
  path: '/register',
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
    ...fieldProbes('email', 'input[name=email]', 'auth-field-email'),
    registerSubmit,
    {
      key: 'or-divider',
      legacy: page => page.locator('.or-divider'),
      next: page => page.getByTestId('auth-or-divider'),
    },
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
      legacy: page => page.locator('.social-login-btn.v-btn--loading').nth(1),
      next: page => page.getByTestId('auth-social-github'),
    },
    bottomBoxProbe,
    ...bottomLinkProbes,
    languageActivatorProbe,
  ],
  masks: registerSocialPendingMasks,
}

// 7-state matrix (auth-pages): hover and keyboard focus of the email step's submit button.
export const registerEmailSubmitHover: ParityState = {
  ...buttonHoverState(registerEmail, 'register-email-submit-hover', 'button.register', 'lite'),
  id: 'register-email-submit-hover',
}
export const registerEmailSubmitFocus: ParityState = {
  ...buttonFocusState(registerEmail, 'register-email-submit-focus', 'button.register', 'lite'),
  id: 'register-email-submit-focus',
}

// 7-state matrix (auth-pages): hover and keyboard focus of the terms dialog's close button.
export const registerTermsModalCloseHover: ParityState = {
  ...buttonHoverState(registerTermsModal, 'register-terms-modal-close-hover', 'button.close', 'lite'),
  id: 'register-terms-modal-close-hover',
}
export const registerTermsModalCloseFocus: ParityState = {
  ...buttonFocusState(registerTermsModal, 'register-terms-modal-close-focus', 'button.close', 'lite'),
  id: 'register-terms-modal-close-focus',
}

const states: ParityState[] = [
  registerEmail,
  registerEmailSubmitHover,
  registerEmailSubmitFocus,
  registerEmailPending,
  registerEmailInvalid,
  registerTermsModal,
  registerTermsModalCloseHover,
  registerTermsModalCloseFocus,
  registerTermsModalCp,
  registerTermsModalEmpty,
  registerSetPassword,
  registerSetPasswordInvalid,
  registerVerifyEmail,
  registerAlreadyRegistered,
  registerErrorSupport,
  registerQuickPending,
  registerQuickDone,
  registerSocial,
  registerSocialHover,
  registerSocialError,
  registerSocialPending,
  registerDisabledRedirect,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
