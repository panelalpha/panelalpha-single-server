import type { Handler, ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { settled, tr } from './auth'
import { waitFor } from './hosting'
import { RESELLER_HOME, resellerDividerProbe, resellerSidebarActiveProbe, resellerTitleProbe } from './reseller-users'
import { liteTabs, shellHandlers, shellState } from './shell'

// S-124 ui-reseller-email-settings: the Email Settings page of the Reseller Area on app-lite (`/reseller-area/email-settings`, `target: 'lite'`).
// Not a spec file (testMatch is `*.parity.ts`). States: `reseller-email-settings.parity.ts`. Plan: context/changes/ui-reseller-email-settings/plan.md.

export const RESELLER_EMAIL_SETTINGS_PATH = '/reseller-area/email-settings'

/** The saved settings of `GET /reseller/email-settings` (`{ data }`). The long blind copy address checks the field's overflow. */
export const emailSettings: Record<string, unknown> = {
  from_name: 'Acme Hosting',
  from_email: 'noreply@acme-hosting.example',
  copy_to: 'support@acme-hosting.example',
  blind_copy_to: 'archive.with.a.really.long.mailbox.name@subdomain.acme-hosting.example',
  smtp_host: 'smtp.acme-hosting.example',
  smtp_port: 587,
  smtp_username: 'mailer',
  smtp_password: 'secret-password',
  smtp_ssl_type: 'tls',
}

/** The settings of a reseller who has not saved anything yet: every field empty. */
export const EMPTY_EMAIL_SETTINGS_FIXTURE: Record<string, unknown> = Object.fromEntries(Object.keys(emailSettings).map(key => [key, '']))

/** `GET /reseller/email-settings`: `{ data }`. */
export const emailSettingsGet = (data: Record<string, unknown> = emailSettings): Handler => ({ json: { data } })

const ready = (page: Page): Locator => page.locator('.email-settings input').first()

// Probes. Legacy and next keep the same classes, except where the mapping notes a V2 class (`.v-input__slot`, `.v-select`).
export const resellerEmailSettingsFieldProbe: Probe = {
  key: 'reseller-email-settings-field',
  legacy: ready,
  next: ready,
}

export const resellerEmailSettingsTitleProbe: Probe = {
  key: 'reseller-email-settings-title',
  legacy: page => page.locator('.title-row h4'),
  next: page => page.locator('.title-row h4'),
}

export const resellerEmailSettingsCardProbe: Probe = {
  key: 'reseller-email-settings-card',
  legacy: page => page.locator('.email-settings .v-card').first(),
  next: page => page.locator('.email-settings .v-card').first(),
}

export const resellerEmailSettingsLabelProbe: Probe = {
  key: 'reseller-email-settings-label',
  legacy: page => page.locator('.email-settings__container label').first(),
  next: page => page.locator('.email-settings__container label').first(),
}

export const resellerEmailSettingsFieldBoxProbe: Probe = {
  key: 'reseller-email-settings-field-box',
  part: 'box',
  legacy: page => page.locator('.email-settings__container .v-input__slot').first(),
  next: page => page.locator('.email-settings__container .v-field').first(),
}

export const resellerEmailSettingsSectionProbe: Probe = {
  key: 'reseller-email-settings-section',
  legacy: page => page.locator('.email-settings__configuration-container'),
  next: page => page.locator('.email-settings__configuration-container'),
}

export const resellerEmailSettingsSectionTitleProbe: Probe = {
  key: 'reseller-email-settings-section-title',
  legacy: page => page.locator('.email-settings__configuration-container h6'),
  next: page => page.locator('.email-settings__configuration-container h6'),
}

export const resellerEmailSettingsSelectProbe: Probe = {
  key: 'reseller-email-settings-select',
  part: 'box',
  legacy: page => page.locator('.email-settings .v-select .v-input__slot').first(),
  next: page => page.locator('.email-settings .v-select .v-field').first(),
}

export const resellerEmailSettingsTestConnectionProbe: Probe = {
  key: 'reseller-email-settings-test-connection',
  legacy: page => page.locator('.email-settings').getByRole('button', { name: tr('button.testConnection', 'lite'), exact: true }).first(),
  next: page => page.locator('.email-settings').getByRole('button', { name: tr('button.testConnection', 'lite'), exact: true }).first(),
}

export const resellerEmailSettingsSendTestProbe: Probe = {
  key: 'reseller-email-settings-send-test',
  legacy: page => page.locator('.email-settings').getByRole('button', { name: tr('button.sendTestEmail', 'lite'), exact: true }).first(),
  next: page => page.locator('.email-settings').getByRole('button', { name: tr('button.sendTestEmail', 'lite'), exact: true }).first(),
}

export const resellerEmailSettingsSaveProbe: Probe = {
  key: 'reseller-email-settings-save',
  legacy: page => page.locator('.email-settings').getByRole('button', { name: tr('button.saveChanges', 'lite'), exact: true }).first(),
  next: page => page.locator('.email-settings').getByRole('button', { name: tr('button.saveChanges', 'lite'), exact: true }).first(),
}

// Phase 8, only the empty state: the select with no value shows its placeholder. V2 paints it in the selection input, V4 in the
// field input. The selectors come from the mapping doc (`.v-select__selections` → `.v-field__input`); check them in the first run.
export const resellerEmailSettingsSelectPlaceholderProbe: Probe = {
  key: 'reseller-email-settings-select-placeholder',
  legacy: page => page.locator('.email-settings .v-select .v-select__selections input').first(),
  next: page => page.locator('.email-settings .v-select .v-field__input input').first(),
}

// Phase 9, only the SSL menu state: the open menu of the Encryption select. Legacy keeps the menu in `.menuable__content__active`,
// next in the active V4 overlay. `.first()` on both sides, as in the other menu probes (ftp.ts, containers.ts).
export const resellerEmailSettingsSslMenuProbe: Probe = {
  key: 'reseller-email-settings-ssl-menu',
  legacy: page => page.locator('.menuable__content__active').first(),
  next: page => page.locator('.v-overlay--active .v-overlay__content').first(),
}

export const resellerEmailSettingsSslOptionProbe: Probe = {
  key: 'reseller-email-settings-ssl-option',
  legacy: page => page.locator('.menuable__content__active .v-list-item').first(),
  next: page => page.locator('.v-overlay--active .v-overlay__content .v-list-item').first(),
}

/**
 * Opens the Encryption select (DOM click on its box) and waits for the menu. The menu stays open for the screenshot.
 * The page is scrolled to the bottom first: the select sits low in the window, V2 then pins the menu to the window bottom
 * (`windowHeight - menuHeight - 12`) while V4 flips it above the field, so the unscrolled state measures the placement rule, not the menu.
 */
export function openSslMenu (next: boolean): StateAction {
  return async page => {
    // `scroll-behavior` may animate the jump, and the document can still grow after the first jump (late layout), so keep scrolling
    // until the offset is at the bottom and has stopped changing for a few frames (bounded, so a page that never settles still ends).
    await page.evaluate(async () => {
      let last = -1
      let still = 0
      for (let frame = 0; frame < 300 && still < 5; frame++) {
        window.scrollTo(0, document.documentElement.scrollHeight)
        await new Promise(resolve => requestAnimationFrame(resolve))
        const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1
        still = atBottom && window.scrollY === last ? still + 1 : 0
        last = window.scrollY
      }
    })
    const box = next
      ? page.locator('.email-settings .v-select .v-field').first()
      : page.locator('.email-settings .v-select .v-input__slot').first()
    await box.click()
    await settled(next ? page.locator('.v-overlay--active .v-overlay__content').first() : page.locator('.menuable__content__active').first())
  }
}

/**
 * Phase 10: a page button by its legacy text, clicked in the DOM (no scroll, the same on both sides). Scoped to the page, as the probes are.
 * The modal's Send button has the same text as the page button, but the modal is closed in these states.
 */
export function clickPageButton (key: string): StateAction {
  return async page => {
    await page.locator('.email-settings').getByRole('button', { name: tr(key, 'lite'), exact: true }).first().evaluate(node => (node as HTMLElement).click())
  }
}

// Phase 11: the loading states. `GET /reseller/email-settings` pending (`'hold'`): the fields are skeletons (`v-if="fetching"` on both
// sides), so the skeleton is the readiness anchor and the field probes are left out.
export const resellerEmailSettingsSkeletonProbe: Probe = {
  key: 'reseller-email-settings-skeleton',
  legacy: page => page.locator('.email-settings .v-skeleton-loader').first(),
  next: page => page.locator('.email-settings .v-skeleton-loader').first(),
}

export const resellerEmailSettingsSkeletonMasks: ParityState['masks'] = {
  legacy: [(page: Page) => page.locator('.email-settings .v-skeleton-loader')],
  next: [(page: Page) => page.locator('.email-settings .v-skeleton-loader')],
}

/** The probes that need a rendered field. They are left out of the loading state, where the fields are skeletons. */
export const resellerEmailSettingsFieldProbes: Probe[] = [
  resellerEmailSettingsFieldProbe,
  resellerEmailSettingsFieldBoxProbe,
  resellerEmailSettingsSelectProbe,
]

/** A page button by its legacy text. The text stays in the button while it shows its loader, so the name still matches. */
function pageButton (page: Page, key: string): Locator {
  return page.locator('.email-settings').getByRole('button', { name: tr(key, 'lite'), exact: true }).first()
}

/** The loader inside a page button (`:loading` on Test Connection or Save). */
export function buttonSpinnerMasks (key: string): ParityState['masks'] {
  return {
    legacy: [(page: Page) => pageButton(page, key).locator('.v-progress-circular')],
    next: [(page: Page) => pageButton(page, key).locator('.v-progress-circular')],
  }
}

/** Waits for the loader of a page button: the request is pending, so it stays on screen. */
export function waitForButtonLoading (key: string): StateAction {
  return async page => {
    await settled(pageButton(page, key).locator('.v-progress-circular'))
  }
}

// Phase 12: the Send Test Email modal, open. The modal is a dialog teleported out of `.email-settings`, so the page button is the only
// match inside that scope while it is closed. Once it is open, the text appears three times (page button, modal title, modal Send
// button), so every modal probe is scoped to the card (lesson "Sondy parity na zagnieżdżonych dialogach").

/** The open modal card: legacy `.basic-modal` in the active dialog, next the card with the `send-test-email-modal` test id. `.first()`. */
export function testEmailModalCard (next: boolean): (page: Page) => Locator {
  return page => (next
    ? page.getByTestId('send-test-email-modal')
    : page.locator('.v-dialog--active .basic-modal')).first()
}

/** Opens the modal by a DOM click on the page's Send Test Email button (no scroll, the pointer stays put), then waits for the card and the prefilled e-mail. */
export function openTestEmailModal (next: boolean): StateAction {
  return async page => {
    await page.mouse.move(0, 0)
    await clickPageButton('button.sendTestEmail')(page)
    const card = testEmailModalCard(next)(page)
    await expect(card).toBeVisible()
    // The e-mail prefills from the session (`home.user.email`, `SendTestEmailModal.vue` `open()`, legacy `STM:76-84`).
    await expect(card.locator('input').first()).toHaveValue('jane@example.com')
  }
}

export const resellerEmailSettingsModalCardProbe: Probe = {
  key: 'reseller-email-settings-modal-card',
  legacy: testEmailModalCard(false),
  next: testEmailModalCard(true),
}

export const resellerEmailSettingsModalTitleProbe: Probe = {
  key: 'reseller-email-settings-modal-title',
  legacy: page => testEmailModalCard(false)(page).locator('h6').first(),
  next: page => testEmailModalCard(true)(page).locator('h6').first(),
}

/** The close icon in the title row (kit `ModalCloseButton` on next, the `$close` button on legacy). */
export const resellerEmailSettingsModalCloseProbe: Probe = {
  key: 'reseller-email-settings-modal-close',
  legacy: page => testEmailModalCard(false)(page).locator('.v-card__title .v-btn').first(),
  next: page => page.getByTestId('send-test-email-close'),
}

/** The label of the e-mail row (the text in the 4-column cell). */
export const resellerEmailSettingsModalLabelProbe: Probe = {
  key: 'reseller-email-settings-modal-label',
  legacy: page => testEmailModalCard(false)(page).locator('.v-card__text .col-4 span').first(),
  next: page => testEmailModalCard(true)(page).locator('.v-card-text .v-col--cols-4 span').first(),
}

/** The e-mail field box (`.v-input__slot` on V2, `.v-field` on V4). */
export const resellerEmailSettingsModalFieldProbe: Probe = {
  key: 'reseller-email-settings-modal-field',
  part: 'box',
  legacy: page => testEmailModalCard(false)(page).locator('.v-input__slot').first(),
  next: page => testEmailModalCard(true)(page).locator('.v-field').first(),
}

export const resellerEmailSettingsModalSubmitProbe: Probe = {
  key: 'reseller-email-settings-modal-submit',
  legacy: page => testEmailModalCard(false)(page).locator('.v-card__actions .v-btn').first(),
  next: page => page.getByTestId('send-test-email-submit'),
}

export const resellerEmailSettingsModalCancelProbe: Probe = {
  key: 'reseller-email-settings-modal-cancel',
  legacy: page => testEmailModalCard(false)(page).locator('.cancel-btn .v-btn').first(),
  next: page => testEmailModalCard(true)(page).locator('.cancel-btn .v-btn').first(),
}

/** The modal probes, after the page probes. */
export const resellerEmailSettingsModalProbes: Probe[] = [
  resellerEmailSettingsModalCardProbe,
  resellerEmailSettingsModalTitleProbe,
  resellerEmailSettingsModalCloseProbe,
  resellerEmailSettingsModalLabelProbe,
  resellerEmailSettingsModalFieldProbe,
  resellerEmailSettingsModalSubmitProbe,
  resellerEmailSettingsModalCancelProbe,
]

// Phase 13: the modal while the test e-mail is sent, and after a failed send. Legacy `STM` has `:loading="submitting"` on Send and
// `v-if="!submitting"` on the X; next does the same (`SendTestEmailModal.vue`).

/** The Send button of the open modal. */
export function modalSubmitButton (next: boolean): (page: Page) => Locator {
  return page => (next
    ? page.getByTestId('send-test-email-submit')
    : testEmailModalCard(false)(page).locator('.v-card__actions .v-btn').first())
}

/** The loader inside the Send button of the modal (`:loading` while the request runs). Its colour follows app, so it is masked. */
export const modalSubmitSpinnerMasks: ParityState['masks'] = {
  legacy: [(page: Page) => modalSubmitButton(false)(page).locator('.v-progress-circular')],
  next: [(page: Page) => modalSubmitButton(true)(page).locator('.v-progress-circular')],
}

/** A DOM click on the modal's Send button (no scroll, the same on both sides). */
export function submitTestEmailModal (next: boolean): StateAction {
  return async page => {
    await modalSubmitButton(next)(page).evaluate(node => (node as HTMLElement).click())
  }
}

/** Waits for the loader of the modal's Send button: the request is pending, so it stays on screen. */
export function waitForModalSendLoading (next: boolean): StateAction {
  return async page => {
    await settled(modalSubmitButton(next)(page).locator('.v-progress-circular'))
  }
}

/** The modal probes without the X: the X is hidden while the request runs (`v-if="!submitting"` on both sides). */
export const resellerEmailSettingsModalProbesNoClose: Probe[] = resellerEmailSettingsModalProbes.filter(
  probe => probe !== resellerEmailSettingsModalCloseProbe,
)

/** The probes of the page, after the shell probes. The frame probes come first. */
export const resellerEmailSettingsProbes: Probe[] = [
  resellerTitleProbe,
  resellerDividerProbe,
  resellerSidebarActiveProbe,
  resellerEmailSettingsTitleProbe,
  resellerEmailSettingsCardProbe,
  resellerEmailSettingsFieldProbe,
  resellerEmailSettingsLabelProbe,
  resellerEmailSettingsFieldBoxProbe,
  resellerEmailSettingsSectionProbe,
  resellerEmailSettingsSectionTitleProbe,
  resellerEmailSettingsSelectProbe,
  resellerEmailSettingsTestConnectionProbe,
  resellerEmailSettingsSendTestProbe,
  resellerEmailSettingsSaveProbe,
]

export interface ResellerEmailSettingsStateOptions {
  /** The body of `GET /reseller/email-settings`. Default `emailSettings`. */
  data?: Record<string, unknown>
  /** Overrides keyed by `METHOD /path`, applied after the defaults. */
  handlers?: Record<string, Handler>
  /** The readiness anchor (the first wait). Default: the first input of the form. */
  ready?: (page: Page) => Locator
  /** Steps after the anchor is visible, before the state's probes. */
  legacy?: StateAction[]
  next?: StateAction[]
  probes?: Probe[]
  /** Shared probes this state leaves out (the field probes in the loading state). */
  omitProbes?: Probe[]
  masks?: ParityState['masks']
}

/**
 * Everything an Email Settings state shares: signed in, single server with the reseller tab, `/reseller-area/email-settings`.
 * No fixed clock: the page has no relative time.
 */
export function resellerEmailSettingsState (options: ResellerEmailSettingsStateOptions = {}): Omit<ParityState, 'id'> {
  const base = shellState({
    target: 'lite',
    path: RESELLER_EMAIL_SETTINGS_PATH,
    home: RESELLER_HOME,
    tabs: [liteTabs[0], { key: 'reseller-area' }],
    activeTab: 'reseller-area',
    masks: options.masks ?? { legacy: [], next: [] },
    probes: [...resellerEmailSettingsProbes.filter(probe => !(options.omitProbes ?? []).includes(probe)), ...(options.probes ?? [])],
  })
  return {
    ...base,
    handlers: {
      ...shellHandlers([], 'projects'),
      'GET /reseller/email-settings': emailSettingsGet(options.data),
      ...options.handlers,
    },
    actions: {
      legacy: [waitFor(options.ready ?? ready), ...(options.legacy ?? [])],
      next: [waitFor(options.ready ?? ready), ...(options.next ?? [])],
    },
  }
}
