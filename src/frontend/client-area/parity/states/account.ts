import type { Handler, ParityState, Probe, StateAction } from './state'
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { settled, tr } from './auth'
import { isDesktop, shellState } from './shell'

// S-118 my-account (formerly S-47). Every state is signed in on /my-account with the shell fixtures. Not a spec file (testMatch is `*.parity.ts`).
// M-2: app-lite is the source of truth, so every state is measured on lite (`target: 'lite'`); app only where app-lite lacks the element.
// Next test ids are `account-<element>`; legacy has none, so its locators use role, copy, then legacy classes.

export const accountUser = {
  first_name: 'Jane',
  last_name: 'Doe',
  company_name: 'Acme Inc.',
  language: 'en',
  new_device_detection: 'ip, device, browser',
  two_factor_auth_enabled: false,
  email: 'jane@example.com',
}

export interface AccountStateOptions {
  /** Differences of the `/home` user from `accountUser`. */
  user?: Record<string, unknown>
  /** Route the state starts on, with its query when it has one (default `/my-account`). */
  path?: string
  /** Answers per `METHOD /path`, on top of the safety-net `GET /user/devices`. */
  handlers?: Record<string, Handler>
  legacy?: StateAction[]
  next?: StateAction[]
  probes?: Probe[]
}

/** Signed in on `/my-account`; the user carries the account fields and the list of devices answers empty unless a state says otherwise. */
export function accountState (options: AccountStateOptions = {}): Omit<ParityState, 'id'> {
  return {
    ...shellState({
      target: 'lite',
      path: options.path ?? '/my-account',
      // No navbar tab is active on /my-account, and the shell states already measure the tabs.
      tabs: [],
      tabSlider: false,
      // The content sits in `.v-main`, which the lite routed-content mask would hide.
      masks: { legacy: [], next: [] },
      home: { user: { ...accountUser, ...options.user }, app: { languages: ['en', 'pl'] } },
      legacy: options.legacy,
      next: options.next,
      probes: options.probes,
    }),
    handlers: {
      ...shellState({ target: 'lite' }).handlers,
      // The devices tab is lazy in both apps, so user-tab states never reach it; this only keeps a stray request from failing a run.
      'GET /user/devices': { json: { data: [] } },
      ...options.handlers,
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------------------------

/** The `.v-input` at `index` in the user tab, in DOM order: first, last, company, language, email, 2FA switch, device detection. */
const legacyInput = (index: number) => (page: Page) => page.locator('.panel-bg .v-input').nth(index)

export const titleProbe: Probe = {
  key: 'title',
  legacy: page => page.getByRole('heading', { level: 1, name: tr('heading.accountPage.title', 'lite'), exact: true }),
  next: page => page.getByTestId('account-title'),
}

export const tabUserProbe: Probe = {
  key: 'tab-user',
  legacy: page => page.getByRole('tab', { name: tr('heading.accountPage.tab.user.title', 'lite'), exact: true }),
  next: page => page.getByTestId('account-tab-user'),
}

export const tabDevicesProbe: Probe = {
  key: 'tab-devices',
  legacy: page => page.getByRole('tab', { name: tr('heading.accountPage.tab.device.title', 'lite'), exact: true }),
  next: page => page.getByTestId('account-tab-devices'),
}

export const sectionTitleProbe: Probe = {
  key: 'section-title',
  legacy: page => page.getByRole('heading', { level: 4 }),
  next: page => page.getByTestId('account-section-title'),
}

export const cardProbe: Probe = {
  key: 'card',
  legacy: page => page.locator('.container > .v-card'),
  next: page => page.getByTestId('account-card'),
}

function headingProbe (key: 'user' | 'password' | 'security', copyKey: string): Probe {
  return {
    key: `heading-${key}`,
    legacy: page => page.locator('.panel-bg p.font-weight-600', { hasText: tr(copyKey, 'lite') }),
    next: page => page.getByTestId(`account-heading-${key}`),
  }
}

const fields = [
  { key: 'first-name', testId: 'first_name', label: 'form.label.firstName' },
  { key: 'last-name', testId: 'last_name', label: 'form.label.lastName' },
  { key: 'company-name', testId: 'company_name', label: 'form.label.companyName' },
  { key: 'language', testId: 'language', label: 'form.label.language' },
  { key: 'email', testId: 'email', label: 'form.label.emailAddress' },
] as const

function fieldProbes (index: number, key: string, testId: string, label: string): Probe[] {
  return [
    {
      key: `label-${key}`,
      legacy: page => page.locator('.panel-bg label', { hasText: tr(label, 'lite') }).first(),
      next: page => page.getByTestId(`account-label-${testId}`),
    },
    {
      key: `field-${key}`,
      legacy: page => legacyInput(index)(page).locator('.v-input__slot'),
      next: page => page.getByTestId(`account-field-${testId}`).locator('.v-field'),
      part: 'box',
      internal: true,
    },
  ]
}

export const userFormProbes: Probe[] = [
  titleProbe,
  tabUserProbe,
  tabDevicesProbe,
  sectionTitleProbe,
  cardProbe,
  headingProbe('user', 'heading.accountPage.tab.user.userSection.title'),
  ...fields.flatMap((field, index) => fieldProbes(index, field.key, field.testId, field.label)),
  {
    key: 'change-email',
    legacy: page => page.getByRole('button', { name: tr('button.emailAddress.change', 'lite'), exact: true }),
    next: page => page.getByTestId('account-change-email'),
  },
  {
    key: 'divider-1',
    legacy: page => page.locator('.panel-bg .v-divider').nth(0),
    next: page => page.getByTestId('account-divider-1'),
  },
  {
    key: 'divider-2',
    legacy: page => page.locator('.panel-bg .v-divider').nth(1),
    next: page => page.getByTestId('account-divider-2'),
  },
  headingProbe('password', 'heading.accountPage.tab.user.passwordSection.title'),
  {
    key: 'change-password',
    legacy: page => page.getByRole('button', { name: tr('button.password.change', 'lite'), exact: true }),
    next: page => page.getByTestId('account-change-password'),
  },
  headingProbe('security', 'heading.accountPage.tab.user.securitySection.title'),
  {
    key: 'label-two-factor',
    legacy: page => page.locator('.panel-bg label', { hasText: tr('form.label.twoFactorAuth', 'lite') }),
    next: page => page.getByTestId('account-label-two-factor'),
  },
  {
    key: 'two-factor-switch',
    legacy: page => page.locator('.panel-bg .switch-container'),
    next: page => page.getByTestId('account-two-factor-switch'),
  },
  {
    key: 'label-new-device-detection',
    legacy: page => page.locator('.panel-bg label', { hasText: tr('form.label.deviceDetection', 'lite') }),
    next: page => page.getByTestId('account-label-new-device-detection'),
  },
  {
    key: 'field-new-device-detection',
    legacy: page => legacyInput(6)(page).locator('.v-input__slot'),
    next: page => page.getByTestId('account-field-new-device-detection').locator('.v-field'),
    part: 'box',
    internal: true,
  },
  {
    key: 'save-content',
    legacy: page => page.getByRole('button', { name: tr('button.saveChanges', 'lite'), exact: true }).locator('.v-btn__content'),
    next: page => page.getByTestId('account-save').locator('.v-btn__content'),
    internal: true,
  },
  {
    key: 'switch-input',
    legacy: page => page.locator('.panel-bg .switch-container .v-input'),
    next: page => page.getByTestId('account-two-factor-switch').locator('.v-input'),
    internal: true,
  },
  {
    key: 'selection-language',
    legacy: page => legacyInput(3)(page).locator('span.input-dropdown'),
    next: page => page.getByTestId('account-field-language').locator('.select-dropdown__selection'),
    internal: true,
  },
  {
    key: 'selection-new-device-detection',
    legacy: page => legacyInput(6)(page).locator('span.input-dropdown'),
    next: page => page.getByTestId('account-field-new-device-detection').locator('.select-dropdown__selection'),
    internal: true,
  },
  {
    key: 'actions',
    legacy: page => page.locator('.panel-bg .v-card__actions'),
    next: page => page.getByTestId('account-actions'),
  },
  {
    key: 'save',
    legacy: page => page.getByRole('button', { name: tr('button.saveChanges', 'lite'), exact: true }),
    next: page => page.getByTestId('account-save'),
  },
]

// ---------------------------------------------------------------------------------------------
// Account modal (change password, change email). Legacy `.v-dialog__content--active`; next `account-modal-*`.
// ---------------------------------------------------------------------------------------------

const LEGACY_DIALOG = '.v-dialog__content--active'

export const modalCardProbe: Probe = {
  key: 'modal-card',
  legacy: page => page.locator(`${LEGACY_DIALOG} .v-card`),
  next: page => page.getByTestId('account-modal'),
}

export function modalProbes (fields: Array<{ name: string, labelKey: string, password: boolean }>): Probe[] {
  return [
    modalCardProbe,
    {
      key: 'modal-title',
      legacy: page => page.locator(`${LEGACY_DIALOG} .v-card__title h5`),
      next: page => page.getByTestId('account-modal-title'),
    },
    {
      key: 'modal-icon',
      legacy: page => page.locator(`${LEGACY_DIALOG} .v-card__title h5 .v-icon`),
      next: page => page.getByTestId('account-modal-icon'),
    },
    {
      key: 'modal-close',
      legacy: page => page.locator(`${LEGACY_DIALOG} .v-card__title .v-btn`),
      next: page => page.getByTestId('account-modal').locator('.v-card-title .v-btn'),
      internal: true,
    },
    ...fields.flatMap((field, index) => [
      {
        key: `modal-label-${field.name}`,
        legacy: (page: Page) => page.locator(`${LEGACY_DIALOG} label`).nth(index),
        next: (page: Page) => page.getByTestId(`account-modal-label-${field.name}`),
      },
      {
        key: `modal-field-${field.name}`,
        legacy: (page: Page) => page.locator(`${LEGACY_DIALOG} .v-input__slot`).nth(index),
        next: (page: Page) => page.getByTestId(`account-modal-field-${field.name}`).locator('.v-field'),
        part: 'box' as const,
        internal: true,
      },
      ...(field.password
        ? [{
            key: `modal-toggle-${field.name}`,
            legacy: (page: Page) => page.locator(`${LEGACY_DIALOG} .input-group .v-btn`).nth(index),
            next: (page: Page) => page.getByTestId(`account-modal-toggle-${field.name}`),
          }]
        : []),
    ]),
    {
      key: 'modal-submit',
      legacy: page => page.locator(`${LEGACY_DIALOG} .v-card__actions .v-btn`).nth(0),
      next: page => page.getByTestId('account-modal-submit'),
    },
    {
      key: 'modal-cancel',
      legacy: page => page.locator(`${LEGACY_DIALOG} .v-card__actions .v-btn`).nth(1),
      next: page => page.getByTestId('account-modal-cancel'),
    },
  ]
}

/** Opens a modal by its button on the user tab, then waits for the card to stop moving (the dialog transition scales it). */
export function openModal (buttonKey: string, nextTestId: string): { legacy: StateAction[], next: StateAction[] } {
  return {
    legacy: [
      legacyUserLoaded,
      async page => {
        await page.getByRole('button', { name: tr(buttonKey, 'lite'), exact: true }).click()
        await settled(page.locator(`${LEGACY_DIALOG} .v-card`))
      },
    ],
    next: [
      userLoaded,
      async page => {
        await page.getByTestId(nextTestId).click()
        await settled(page.getByTestId('account-modal'))
      },
    ],
  }
}

// ---------------------------------------------------------------------------------------------
// Two-factor authentication (enable: two steps, disable)
// ---------------------------------------------------------------------------------------------

/** A small static stand-in for the QR code the API returns; both apps render it with `v-html`. */
const QR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="#fff"/><rect x="16" y="16" width="52" height="52"/><rect x="132" y="16" width="52" height="52"/><rect x="16" y="132" width="52" height="52"/><rect x="88" y="88" width="24" height="24"/><rect x="132" y="132" width="20" height="20"/><rect x="164" y="164" width="20" height="20"/></svg>'

export const SECRET_KEY = 'ABCD EFGH 1234 5678'
export const RECOVERY_CODE = 'ABCD-EFGH'

export const twoFactorHandlers: Record<string, Handler> = {
  'POST /user/two-factor-authentication': { status: 200, json: {} },
  'GET /user/two-factor-qr-code': { json: { svg: QR_SVG } },
  'GET /user/two-factor-secret-key': { json: { secretKey: SECRET_KEY } },
  'POST /user/confirmed-two-factor-authentication': { status: 200, json: {} },
  'GET /user/two-factor-recovery-codes': { json: [RECOVERY_CODE] },
}

function dialogProbe (key: string, legacySelector: string, nextTestId: string, internal = false): Probe {
  return {
    key,
    legacy: page => page.locator(`${LEGACY_DIALOG} ${legacySelector}`),
    next: page => page.getByTestId(nextTestId),
    ...(internal ? { internal: true } : {}),
  }
}

export const twoFactorStep1Probes: Probe[] = [
  dialogProbe('2fa-card', '.v-card', 'account-2fa-modal'),
  dialogProbe('2fa-title', '.v-card__title h5', 'account-2fa-title'),
  dialogProbe('2fa-qr', '.v-card__text > div.d-flex', 'account-2fa-qr'),
  dialogProbe('2fa-secret', 'b.primary--text', 'account-2fa-secret'),
  dialogProbe('2fa-code-label', 'label.base--text', 'account-2fa-code-label'),
  {
    key: '2fa-code-field',
    legacy: page => page.locator(`${LEGACY_DIALOG} .v-input__slot`),
    next: page => page.getByTestId('account-2fa-code').locator('.v-field'),
    part: 'box',
    internal: true,
  },
  {
    key: '2fa-confirm',
    legacy: page => page.locator(`${LEGACY_DIALOG} .v-card__actions .v-btn`).nth(0),
    next: page => page.getByTestId('account-2fa-confirm'),
  },
  {
    key: '2fa-back',
    legacy: page => page.locator(`${LEGACY_DIALOG} .v-card__actions .v-btn`).nth(1),
    next: page => page.getByTestId('account-2fa-back'),
  },
]

export const twoFactorStep2Probes: Probe[] = [
  dialogProbe('2fa-card', '.v-card', 'account-2fa-modal'),
  dialogProbe('2fa-title', '.v-card__title h5', 'account-2fa-title'),
  dialogProbe('2fa-recovery', '.recovery-code-box', 'account-2fa-recovery'),
  dialogProbe('2fa-alert', '.alert--error', 'account-2fa-alert'),
  dialogProbe('2fa-checkbox', 'label.checkbox-label', 'account-2fa-checkbox-label'),
  dialogProbe('2fa-done', '.v-card__actions .v-btn', 'account-2fa-done'),
]

export const twoFactorDisableProbes: Probe[] = [
  dialogProbe('2fa-disable-card', '.v-card', 'account-2fa-disable-modal'),
  dialogProbe('2fa-disable-title', '.v-card__title h5', 'account-2fa-disable-title'),
  dialogProbe('2fa-disable-info', '.v-card__text p', 'account-2fa-disable-info'),
  {
    key: '2fa-disable-confirm',
    legacy: page => page.locator(`${LEGACY_DIALOG} .v-card__actions .v-btn`).nth(0),
    next: page => page.getByTestId('account-2fa-disable-confirm'),
  },
  {
    key: '2fa-disable-back',
    legacy: page => page.locator(`${LEGACY_DIALOG} .v-card__actions .v-btn`).nth(1),
    next: page => page.getByTestId('account-2fa-disable-back'),
  },
]

/** Clicks the 2FA switch on the user tab; the dialog card (legacy `.v-card`, next `testId`) must be there and still. */
export function clickSwitch (nextCardTestId: string): { legacy: StateAction[], next: StateAction[] } {
  return {
    legacy: [
      legacyUserLoaded,
      async page => {
        await page.locator('.panel-bg .switch-container').click()
        await settled(page.locator(`${LEGACY_DIALOG} .v-card`))
      },
    ],
    next: [
      userLoaded,
      async page => {
        await page.getByTestId('account-two-factor-switch').click()
        await settled(page.getByTestId(nextCardTestId))
      },
    ],
  }
}

// ---------------------------------------------------------------------------------------------
// Devices tab
// ---------------------------------------------------------------------------------------------

export interface DeviceFixture {
  ip_address: string
  browser: string
  device: string
  last_login: string
  current_device: boolean
  session_id: string | null
  device_id: string | null
}

/** The current device (with a session), another device with a session, and one without a session. */
export const devices: DeviceFixture[] = [
  { ip_address: '203.0.113.10', browser: 'Chrome 120', device: 'Windows', last_login: '2026-10-05 10:00:00', current_device: true, session_id: 's1', device_id: 'd1' },
  { ip_address: '198.51.100.7', browser: 'Firefox 121', device: 'GNU/Linux', last_login: '2026-10-04 08:30:00', current_device: false, session_id: 's2', device_id: 'd2' },
  { ip_address: '192.0.2.44', browser: 'Safari 17', device: 'Mac', last_login: '2026-09-28 17:45:00', current_device: false, session_id: null, device_id: 'd3' },
]

export function devicesHandlers (list: DeviceFixture[] = devices): Record<string, Handler> {
  return {
    'GET /user/devices': { json: { data: list } },
  }
}

const LEGACY_TABLE = '.v-data-table'
const nextTable = (page: Page) => page.getByTestId('account-devices-table')

/** Opens the devices tab in both apps; the table (legacy `.v-data-table`, next `account-devices-table`) must be there. */
export const openDevicesTab: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.getByRole('tab', { name: tr('heading.accountPage.tab.device.title', 'lite'), exact: true }).click()
    await settled(page.locator(LEGACY_TABLE))
  },
  next: async page => {
    await page.getByTestId('account-tab-devices').click()
    await settled(nextTable(page))
  },
}

/** Frame probes of the devices tab: title, tabs, section header with the search, and the card. */
export const devicesFrameProbes: Probe[] = [
  titleProbe,
  tabUserProbe,
  tabDevicesProbe,
  { ...sectionTitleProbe, next: page => page.getByTestId('account-section-title-devices') },
  {
    key: 'search',
    legacy: page => page.locator('h4 + div'),
    next: page => page.getByTestId('account-search'),
  },
  {
    key: 'search-field',
    legacy: page => page.locator('h4 + div .v-input__slot'),
    next: page => page.getByTestId('account-search').locator('.v-field'),
    internal: true,
  },
  cardProbe,
  {
    key: 'table',
    legacy: page => page.locator(LEGACY_TABLE),
    next: page => nextTable(page).locator('.v-data-table'),
    internal: true,
  },
]

/** `rows` is how many device rows both tables show. */
export function deviceRowProbes (rows: number): Probe[] {
  // Below the mobile edge both apps render `DevicesTableResponsiveItem` instead of the header row and the cells.
  return [
    ...desktopRowProbes(rows).map(probe => (/^row-\d+$/.test(probe.key) ? probe : { ...probe, when: isDesktop })),
    ...mobileItemProbes,
  ]
}

const mobileItemProbes: Probe[] = [
  ['root', '.mobile-table-item', 0],
  ['td', 'td', 0],
  ['select', '.mobile-table-item__select', 0],
  ['select-box', '.mobile-table-item__select .v-input--selection-controls__input, .mobile-table-item__select .v-selection-control__input', 0],
  ['values', '.mobile-table-item__values', 0],
  ['group', '.mobile-table-item__group', 0],
  ['header', '.mobile-table-item__header', 0],
  ['value', '.mobile-table-item__value', 0],
  ['device-value', '.mobile-table-item__value', 2],
  ['actions', '.mobile-table-item__actions', 0],
].map(([name, selector, nth]) => ({
  key: `mobile-item-${name}`,
  legacy: (page: Page) => page.locator(`${LEGACY_TABLE} ${selector}`).nth(nth as number),
  next: (page: Page) => nextTable(page).locator(selector as string).nth(nth as number),
  internal: true,
  when: (variant: Parameters<typeof isDesktop>[0]) => !isDesktop(variant),
}))

function desktopRowProbes (rows: number): Probe[] {
  return [
    {
      key: 'sort-row',
      legacy: page => page.locator('tr.custom-sort'),
      next: page => nextTable(page).locator('tr.custom-sort'),
      internal: true,
    },
    {
      key: 'select-all',
      legacy: page => page.locator('tr.custom-sort .v-input--selection-controls__input'),
      next: page => nextTable(page).locator('tr.custom-sort .v-selection-control__input'),
      internal: true,
    },
    ...Array.from({ length: rows }, (_, index) => [
      {
        key: `row-${index + 1}`,
        legacy: (page: Page) => page.locator(`${LEGACY_TABLE} tbody tr`).nth(index),
        next: (page: Page) => nextTable(page).locator('tbody tr').nth(index),
        internal: true,
      },
      {
        key: `row-${index + 1}-ip`,
        legacy: (page: Page) => page.locator(`${LEGACY_TABLE} tbody tr`).nth(index).locator('b.heading--text'),
        next: (page: Page) => nextTable(page).locator('tbody tr').nth(index).locator('b.heading--text'),
        internal: true,
      },
      {
        key: `row-${index + 1}-checkbox`,
        legacy: (page: Page) => page.locator(`${LEGACY_TABLE} tbody tr`).nth(index).locator('.v-input--selection-controls__input'),
        next: (page: Page) => nextTable(page).locator('tbody tr').nth(index).locator('.v-selection-control__input'),
        internal: true,
      },
      {
        key: `row-${index + 1}-actions`,
        legacy: (page: Page) => page.locator(`${LEGACY_TABLE} tbody tr`).nth(index).locator('.actions-row'),
        next: (page: Page) => nextTable(page).locator('tbody tr').nth(index).locator('.actions-row'),
        internal: true,
      },
      {
        key: `row-${index + 1}-action-first`,
        legacy: (page: Page) => page.locator(`${LEGACY_TABLE} tbody tr`).nth(index).locator('.actions-row .v-btn').first(),
        next: (page: Page) => nextTable(page).locator('tbody tr').nth(index).locator('.actions-row .v-btn').first(),
        internal: true,
      },
      {
        key: `row-${index + 1}-action-first-icon`,
        legacy: (page: Page) => page.locator(`${LEGACY_TABLE} tbody tr`).nth(index).locator('.actions-row .v-icon').first(),
        next: (page: Page) => nextTable(page).locator('tbody tr').nth(index).locator('.actions-row .v-icon').first(),
        internal: true,
      },
    ]).flat(),
    {
      key: 'current-device-label',
      legacy: page => page.locator(`${LEGACY_TABLE} .v-chip`).first(),
      next: page => nextTable(page).locator('.v-chip').first(),
      internal: true,
    },
    {
      key: 'online',
      legacy: page => page.locator(`${LEGACY_TABLE} .current-device`).first(),
      next: page => nextTable(page).locator('.current-device').first(),
      internal: true,
    },
  ]
}

// ---------------------------------------------------------------------------------------------
// Device selection, snackbar and the forget / log out modals
// ---------------------------------------------------------------------------------------------

/** Checks the rows at `indices` (0-based) of the devices table. */
export function selectRows (indices: number[]): { legacy: StateAction, next: StateAction } {
  return {
    legacy: async page => {
      for (const index of indices) {
        await page.locator(`${LEGACY_TABLE} tbody tr`).nth(index).locator('.v-input--selection-controls__input').click()
      }
    },
    next: async page => {
      for (const index of indices) {
        await nextTable(page).locator('tbody tr').nth(index).locator('.v-selection-control__input').click()
      }
    },
  }
}

const LEGACY_SNACKBAR = '.v-snack__wrapper'
// The bar is the kit `SelectSnackbar` (`select-snackbar*` test ids); its select-all / deselect buttons carry no test id, only the kit class.
const nextSnackbar = (page: Page) => page.getByTestId('select-snackbar').locator('.v-snackbar__wrapper')

export const snackbarProbes: Probe[] = [
  {
    key: 'snackbar',
    legacy: page => page.locator(LEGACY_SNACKBAR),
    next: page => nextSnackbar(page),
    internal: true,
  },
  {
    key: 'snackbar-count',
    legacy: page => page.locator(`${LEGACY_SNACKBAR} .snackbar__item-number`),
    next: page => page.getByTestId('select-snackbar-count'),
    when: isDesktop,
  },
  {
    key: 'snackbar-forget',
    legacy: page => page.locator(`${LEGACY_SNACKBAR} .snackbar__row .v-btn`),
    next: page => page.getByTestId('account-snackbar-forget'),
    when: isDesktop,
  },
  {
    key: 'snackbar-select-all',
    legacy: page => page.locator(`${LEGACY_SNACKBAR} .btn-icon-horizontal`).nth(0),
    next: page => page.getByTestId('select-snackbar').locator('.btn-icon-horizontal').nth(0),
    when: isDesktop,
  },
  {
    key: 'snackbar-deselect',
    legacy: page => page.locator(`${LEGACY_SNACKBAR} .btn-icon-horizontal`).nth(1),
    next: page => page.getByTestId('select-snackbar').locator('.btn-icon-horizontal').nth(1),
    when: isDesktop,
  },
]

/** The forget / log out modal: a `BasicModal` in a dialog. */
export const deviceModalProbes: Probe[] = [
  dialogProbe('device-modal', '.v-card', 'account-device-modal'),
  {
    key: 'device-modal-title',
    legacy: page => page.locator(`${LEGACY_DIALOG} .v-card__title h6`),
    next: page => page.getByTestId('account-device-modal').locator('.v-card-title h6'),
    internal: true,
  },
  {
    key: 'device-modal-message',
    legacy: page => page.locator(`${LEGACY_DIALOG} .v-card__text p.p-2`).first(),
    next: page => page.getByTestId('account-device-modal').locator('.v-card-text p.p-2').first(),
    internal: true,
  },
  {
    key: 'device-modal-checkbox',
    legacy: page => page.locator(`${LEGACY_DIALOG} .v-card__text label.checkbox-label`),
    next: page => page.getByTestId('account-device-modal').locator('.v-card-text label.checkbox-label'),
    internal: true,
  },
  {
    key: 'device-modal-submit',
    legacy: page => page.locator(`${LEGACY_DIALOG} .v-card__actions .v-btn`).nth(0),
    next: page => page.getByTestId('account-device-modal').locator('.v-card-actions .v-btn').nth(0),
    internal: true,
  },
  {
    key: 'device-modal-cancel',
    legacy: page => page.locator(`${LEGACY_DIALOG} .v-card__actions .v-btn`).nth(1),
    next: page => page.getByTestId('account-device-modal').locator('.v-card-actions .v-btn').nth(1),
    internal: true,
  },
]

/**
 * Disabled submit of a device modal (`confirm-required`, checkbox not ticked yet). Asserted on each side before the
 * `device-modal-submit` probe measures it, so a state that stops disabling the button fails instead of drifting.
 */
export const deviceSubmitDisabled: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await expect(page.locator(`${LEGACY_DIALOG} .v-card__actions .v-btn`).nth(0)).toBeDisabled()
  },
  next: async page => {
    await expect(page.getByTestId('account-device-modal').locator('.v-card-actions .v-btn').nth(0)).toBeDisabled()
  },
}

/** Clicks the nth (0-based) action button of the row at `rowIndex`: legacy by position, next by its test id. */
export function clickRowAction (rowIndex: number, action: 'forget' | 'logout'): { legacy: StateAction, next: StateAction } {
  return {
    legacy: async page => {
      // Below the mobile edge the buttons live in the responsive item instead of `.actions-row`.
      await page.locator(`${LEGACY_TABLE} tbody tr`).nth(rowIndex).locator('.actions-row .v-btn, .mobile-table-item__actions .v-btn').nth(action === 'forget' ? 0 : 1).click()
      await settled(page.locator(`${LEGACY_DIALOG} .v-card`))
    },
    next: async page => {
      await nextTable(page).locator('tbody tr').nth(rowIndex).getByTestId(`account-device-${action}`).click()
      await settled(page.getByTestId('account-device-modal'))
    },
  }
}

/** Both apps first load the user from their own `GET /home`; the form is filled once the first name shows. */
export const userLoaded: StateAction = async page => {
  await settled(page.getByRole('textbox').first())
  await page.waitForFunction(() => (document.querySelector('.panel-bg input') as HTMLInputElement | null)?.value === 'Jane')
}

/**
 * Legacy builds the field titles once, in `data()`. When the translation arrives after the component was created they
 * stay raw keys (`form.label.firstName`) for good, so a capture is reloaded until they are text. Next recomputes them.
 */
export const legacyUserLoaded: StateAction = async page => {
  await userLoaded(page)
  for (let attempt = 0; attempt < 5; attempt++) {
    if (await page.getByText('form.label.firstName', { exact: true }).count() === 0) {
      return
    }
    await page.reload()
    await userLoaded(page)
  }
  throw new Error('Harness error: legacy field titles stayed untranslated after 5 reloads')
}

/**
 * The 2FA switch while its start request is in flight: legacy `:disabled="loading"` (`Account.vue:225`), next
 * `:disabled="loading"` (`MyAccountView.vue:281`). The state holds the start POST, so the modal never opens.
 */
export const twoFactorSwitchDisabled: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [
    legacyUserLoaded,
    async page => {
      await page.locator('.panel-bg .switch-container').click()
      await expect(page.locator('.panel-bg .switch-container input[type="checkbox"]')).toBeDisabled()
    },
  ],
  next: [
    userLoaded,
    async page => {
      await page.getByTestId('account-two-factor-switch').click()
      await expect(page.getByTestId('account-two-factor-switch').locator('input[type="checkbox"]')).toBeDisabled()
    },
  ],
}
