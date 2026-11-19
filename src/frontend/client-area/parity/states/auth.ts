import type { LegacyTarget, ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { baseFixtures } from '../driver/fixtures'

// Shared building blocks of the login and register states. Not a spec file (testMatch is `*.parity.ts`).

/**
 * Looks up fixture copy by legacy i18n key; `target` picks the fixture set the state's apps are served.
 * The bundle mixes nested namespaces (`button.logIn`) with flat dotted keys
 * (`heading.loginPage.login.title`) and with both in one path (`heading.navbar['tab.myInstances']`), so every way of
 * grouping the key's parts into object keys is tried.
 */
export function tr (key: string, target: LegacyTarget = 'app'): string {
  const value = lookup(baseFixtures(target).translation, key.split('.'))
  if (value === undefined) {
    throw new Error(`Harness error: copy key "${key}" is not in ${target === 'lite' ? 'fixtures/lite' : 'fixtures'}/translation.en.json`)
  }
  return value
}

function lookup (node: unknown, parts: string[]): string | undefined {
  if (parts.length === 0) {
    return typeof node === 'string' ? node : undefined
  }
  if (typeof node !== 'object' || node === null) {
    return undefined
  }
  for (let size = parts.length; size >= 1; size--) {
    const child = (node as Record<string, unknown>)[parts.slice(0, size).join('.')]
    const found = child === undefined ? undefined : lookup(child, parts.slice(size))
    if (found !== undefined) {
      return found
    }
  }
  return undefined
}

/** Text of a copy key with the interpolation (`{{seconds}}`) cut off, as a regex that matches any value. */
export function trPattern (key: string, target: LegacyTarget = 'app'): RegExp {
  const text = tr(key, target).replace(/\{\{.*$/, '')
  return new RegExp(text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`))
}

export const EMAIL = 'jane@example.com'
export const QUICK_EMAIL = 'quick@example.com'

/** Waits until the element is visible and its box stops moving (legacy collapse animations run on rAF). */
export async function settled (locator: Locator): Promise<void> {
  await expect(locator).toBeVisible()
  let previous = ''
  await expect.poll(async () => {
    const box = JSON.stringify(await locator.boundingBox())
    const same = box === previous
    previous = box
    return same
  }, { intervals: [100] }).toBe(true)
}

/** Types the email into the (single) email field and clicks the submit button; same labels in both apps. */
export function submitEmail (buttonKey: 'button.logIn' | 'button.register' | 'button.resetPasswordSend', target: LegacyTarget = 'app'): StateAction[] {
  return [
    async page => {
      await page.getByLabel(tr('form.label.emailAddress', target), { exact: true }).fill(EMAIL)
    },
    async page => {
      await page.getByRole('button', { name: tr(buttonKey, target), exact: true }).click()
    },
  ]
}

// ---------------------------------------------------------------------------------------------
// Probes used by more than one state. Legacy locators prefer role / label / text, then the
// legacy class names next copied; next locators use the data-testid vocabulary.
// ---------------------------------------------------------------------------------------------

export const cardProbe: Probe = {
  // Anchor. In legacy the email, password, 2FA and verify cards all sit in `.login-container`.
  key: 'card',
  legacy: page => page.locator('.login-container .v-card'),
  next: page => page.getByTestId('auth-card'),
}

export const titleProbe: Probe = {
  // The card title is the first heading in legacy (banners sit inside the card, after it).
  key: 'title',
  legacy: page => page.getByRole('heading').first(),
  next: page => page.getByTestId('auth-title'),
}

export function submitProbe (key = 'submit', buttonKey = 'button.logIn', target: LegacyTarget = 'app'): Probe {
  return {
    key,
    legacy: page => page.getByRole('button', { name: tr(buttonKey, target), exact: true }),
    next: page => page.getByTestId('auth-submit'),
  }
}

export const languageActivatorProbe: Probe = {
  key: 'language-activator',
  // After a successful sign-in both apps render the footer switcher too (legacy `Footer`, next `AppFooter`); the card one is first in DOM order.
  legacy: page => page.locator('#languageSwitcher').getByRole('button').first(),
  // After a successful sign-in next also renders the footer LanguageSwitcher (AppFooter); the card one is first in DOM order.
  next: page => page.getByTestId('language-activator').first(),
}

/** Field box + native input pair. `legacyInput` is the legacy `input[name=…]` selector, `testId` the next field. */
export function fieldProbes (name: string, legacyInput: string, testId: string): Probe[] {
  return [
    {
      key: `field-${name}`,
      legacy: page => page.locator('.v-input__slot').filter({ has: page.locator(legacyInput) }),
      next: page => page.getByTestId(testId).locator('.v-field'),
      part: 'box',
      internal: true,
    },
    {
      key: `field-${name}-input`,
      legacy: page => page.locator(legacyInput),
      next: page => page.getByTestId(testId).locator('input'),
      part: 'input',
      internal: true,
    },
  ]
}

export const bottomBoxProbe: Probe = {
  key: 'bottom-box',
  legacy: page => page.locator('.login-bottom-box'),
  next: page => page.getByTestId('auth-bottom-box'),
}

/** Error banner (box) and the state's `message__title`. Legacy renders it inside the card, next above it. */
export const errorProbes: Probe[] = [
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
]

/** Countdown button of the verify-email step: its text changes every second, so it is masked. */
export function resendMasksFor (target: LegacyTarget = 'app') {
  return {
    legacy: [(page: Page) => page.getByRole('button', { name: trPattern('heading.loginPage.emailVerification.resendCodeMessage', target) })],
    next: [(page: Page) => page.getByTestId('auth-secondary')],
  }
}
export const resendMasks = resendMasksFor()

/** Label of the countdown button: legacy paints it inline `var(--v-gray-lighten2)`; the button itself is masked. */
export function resendLabelProbeFor (target: LegacyTarget = 'app'): Probe {
  return {
    key: 'resend-label',
    legacy: page => page.getByRole('button', { name: trPattern('heading.loginPage.emailVerification.resendCodeMessage', target) }).locator('span.font-weight-bold'),
    next: page => page.getByTestId('auth-secondary-label'),
  }
}
export const resendLabelProbe: Probe = resendLabelProbeFor()

// ---------------------------------------------------------------------------------------------
// Pending submit (`'hold'` handler): the request never completes, so the button stays in its loading state.
// ---------------------------------------------------------------------------------------------

/** The loading submit button and its loader wrapper (`.v-btn__loader` in both Vuetify generations). */
export const pendingSubmitProbes: Probe[] = [
  {
    key: 'submit',
    // The button text is hidden while loading, so the role/name locator of the idle state does not apply.
    legacy: page => page.locator('.v-btn--loading'),
    next: page => page.getByTestId('auth-submit'),
  },
  {
    key: 'submit-loader',
    legacy: page => page.locator('.v-btn--loading .v-btn__loader'),
    // The loader wrapper is Vuetify's own `.v-btn__loader` (kit `Loader` in the `#loader` slot sits inside it).
    next: page => page.getByTestId('auth-submit').locator('.v-btn__loader'),
    internal: true,
  },
]

/** The spinner inside the loading button is indeterminate, so it is masked. */
export const pendingSubmitMasks = {
  legacy: [(page: Page) => page.locator('.v-btn--loading .v-progress-circular')],
  next: [(page: Page) => page.getByTestId('auth-submit').locator('.v-progress-circular')],
}

/** Waits until the spinner is up in the submit button (same DOM chain in both apps, apart from the test id). */
export const waitForPendingSubmit = {
  legacy: (async page => {
    await settled(page.locator('.v-btn--loading .v-progress-circular'))
  }) as StateAction,
  next: (async page => {
    await settled(page.getByTestId('auth-submit').locator('.v-progress-circular'))
  }) as StateAction,
}

/** Text the page's clipboard stub (parity/driver/apps.ts) received from `navigator.clipboard.writeText`. */
export function readParityClipboard (page: Page): Promise<string | undefined> {
  return page.evaluate(() => (window as unknown as { __parityClipboard?: string }).__parityClipboard)
}

// ---------------------------------------------------------------------------------------------
// Two password fields (accept-invite, reset-password). Legacy fields have no `name`, so they are addressed by position
// (the two `input[type=password]`); the next ones by test id.
// ---------------------------------------------------------------------------------------------

export interface PasswordPairProbes {
  /** Box and native input of both fields. */
  fields: Probe[]
  /** Labels; legacy removes the label from the DOM once the field holds text, so they are probed only while empty. */
  labels: Probe[]
  /** Validation messages under both fields. */
  messages: Probe[]
}

export function passwordPairProbes (testIds: [string, string], names: [string, string]): PasswordPairProbes {
  return {
    fields: names.flatMap((name, index) => [
      {
        key: `field-${name}`,
        legacy: page => page.locator('.v-input__slot').nth(index),
        next: page => page.getByTestId(testIds[index]).locator('.v-field'),
        part: 'box',
        internal: true,
      },
      {
        key: `field-${name}-input`,
        legacy: page => page.locator('input[type=password]').nth(index),
        next: page => page.getByTestId(testIds[index]).locator('input'),
        part: 'input',
        internal: true,
      },
    ] satisfies Probe[]),
    labels: names.map((name, index) => ({
      key: `field-${name}-label`,
      legacy: page => page.locator('.v-input').nth(index).locator('label').first(),
      next: page => page.getByTestId(testIds[index]).locator('label.v-field-label').first(),
      internal: true,
    })),
    messages: names.map((name, index) => ({
      key: `field-${name}-message`,
      legacy: page => page.locator('.v-input').nth(index).locator('.v-messages__message'),
      next: page => page.getByTestId(testIds[index]).locator('.v-messages__message'),
      internal: true,
    })),
  }
}

/** Types `first` and `second` into the two password fields of each app (legacy by position, next by test id). */
export function fillPasswordPair (testIds: [string, string], first: string, second: string = first): { legacy: StateAction, next: StateAction } {
  return {
    legacy: async page => {
      await page.locator('input[type=password]').nth(0).fill(first)
      await page.locator('input[type=password]').nth(1).fill(second)
    },
    next: async page => {
      await page.getByTestId(testIds[0]).locator('input').fill(first)
      await page.getByTestId(testIds[1]).locator('input').fill(second)
    },
  }
}

/** Probes of the global alert stack (`.alert-manager .alert--*`), same markup in both apps. */
export function alertProbes (alert: (page: Page) => Locator): Probe[] {
  return [
    { key: 'alert', legacy: alert, next: alert },
    {
      key: 'alert-icon',
      legacy: page => alert(page).locator('.alert__icon-box'),
      next: page => alert(page).locator('.alert__icon-box'),
      internal: true,
    },
    {
      key: 'alert-title',
      legacy: page => alert(page).locator('.alert__text-box p').first(),
      next: page => alert(page).locator('.alert__text-box p').first(),
      internal: true,
    },
    {
      key: 'alert-text',
      legacy: page => alert(page).locator('.alert__text-box p').nth(1),
      next: page => alert(page).locator('.alert__text-box p').nth(1),
      internal: true,
    },
    {
      key: 'alert-close',
      // Direct child: legacy's clickable error icon renders its own nested `<button>`.
      legacy: page => alert(page).locator('.alert__close-box > button'),
      next: page => alert(page).locator('.alert__close-box > button'),
      internal: true,
    },
  ]
}

// ---------------------------------------------------------------------------------------------
// 7-state matrix of the session screens (change auth-pages, 10x-ui): hover and keyboard focus of a
// screen's main button, derived from the screen's default state. Same accessible name in both apps.
// ---------------------------------------------------------------------------------------------

// `role: 'link'` for a button rendered as `<a>` (V2 `v-btn :to`, V4 `to`), e.g. "Back To Home" on the 404 screen.
type ButtonRole = 'button' | 'link'

function namedButton (page: Page, buttonKey: string, target: LegacyTarget = 'app', role: ButtonRole = 'button'): Locator {
  return page.getByRole(role, { name: tr(buttonKey, target), exact: true })
}

/**
 * The hover/focus overlay of the button: V2 paints it as the button's `::before`, V4 as `.v-btn__overlay`. Its opacity sits
 * near the pixelmatch threshold, so the pixel gate alone does not see a different overlay; this probe compares it.
 */
function buttonOverlayProbe (buttonKey: string, target: LegacyTarget = 'app', role: ButtonRole = 'button'): Probe {
  return {
    key: 'button-overlay',
    legacy: page => namedButton(page, buttonKey, target, role),
    next: page => namedButton(page, buttonKey, target, role).locator('.v-btn__overlay'),
    pseudo: { legacy: '::before' },
    internal: true,
  }
}

/** `<base>` with the pointer resting on the button named `buttonKey` (transitions are frozen, so the hover is final). */
export function buttonHoverState (base: ParityState, id: string, buttonKey: string, target: LegacyTarget = 'app', role: ButtonRole = 'button'): ParityState {
  const hover: StateAction = async page => {
    await namedButton(page, buttonKey, target, role).hover()
  }
  // The scroll reset before the probes could move a button below the fold away from the pointer; both apps would then
  // report an idle overlay and pass, so the hover is asserted after the capture.
  const stillHovered: StateAction = async page => {
    expect(await namedButton(page, buttonKey, target, role).evaluate(element => element.matches(':hover')), 'pointer on the button').toBe(true)
  }
  return {
    ...base,
    id,
    pointer: 'keep',
    actions: { legacy: [...base.actions.legacy, hover], next: [...base.actions.next, hover] },
    probes: [...base.probes, buttonOverlayProbe(buttonKey, target, role)],
    afterCapture: {
      legacy: [...(base.afterCapture?.legacy ?? []), stillHovered],
      next: [...(base.afterCapture?.next ?? []), stillHovered],
    },
  }
}

/**
 * `<base>` with keyboard focus on the button named `buttonKey`: the pointer is moved off the card and a key that moves no
 * focus is pressed, so the programmatic focus that follows counts as keyboard focus (`:focus-visible` in V4, `:focus` in
 * V2). Focus is not moved with Tab: the tab order differs on the login email step (auth-pages C8) and blurring a field
 * would validate it, so Tab would measure the order, not the focus ring.
 */
export function buttonFocusState (base: ParityState, id: string, buttonKey: string, target: LegacyTarget = 'app', role: ButtonRole = 'button'): ParityState {
  const focus: StateAction = async page => {
    await page.mouse.move(0, 0)
    await page.keyboard.press('Shift')
    const button = namedButton(page, buttonKey, target, role)
    await button.focus()
    await expect(button).toBeFocused()
    expect(await button.evaluate(element => element.matches(':focus-visible')), 'keyboard focus').toBe(true)
  }
  // V2 has no focus ring; V4's `.v-btn::after` ring is switched off in `_buttons.scss`. Legacy has no `::after` content to pair
  // with, so the ring is asserted in next only.
  const noFocusRing: StateAction = async page => {
    const ring = await namedButton(page, buttonKey, target, role).evaluate(element => getComputedStyle(element, '::after').opacity)
    expect(ring, 'V4 focus ring hidden').toBe('0')
  }
  return {
    ...base,
    id,
    pointer: 'keep',
    actions: { legacy: [...base.actions.legacy, focus], next: [...base.actions.next, focus] },
    probes: [...base.probes, buttonOverlayProbe(buttonKey, target, role)],
    afterCapture: {
      legacy: [...(base.afterCapture?.legacy ?? [])],
      next: [...(base.afterCapture?.next ?? []), noFocusRing],
    },
  }
}
