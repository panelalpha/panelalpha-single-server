import type { Handler, ParityState, StateAction } from './state'
import type { Page } from '@playwright/test'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { buttonFocusState, buttonHoverState, settled, tr as trKey } from './auth'
import { shellHandlers, shellHome } from './shell'

/** Copy from the app-lite translation (the Community panel backups exist only in app-lite). */
const tr = (key: string): string => trKey(key, 'lite')

/** The signed-in Free panel admin; `/settings?tab=backups` is a route of the lite router. */
export const backupsHome = shellHome({ user: { email: 'jane@example.com' } })

/** Handlers of the `/community/*` calls the Settings page makes on mount (not in the lite fixtures). */
const settingsCalls: Record<string, Handler> = {
  ...shellHandlers([], 'projects'),
  'GET /community/settings': { json: { name: 'Acme Panel', url: 'https://panel.example.test', default_language: 'en', default_date_format: 'YYYY-MM-DD', languages: ['en', 'pl'], date_formats: ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'] } },
  'GET /community/hub': { json: { paired: false } },
}

/** `GET /community/backups` with an S3 store and a weekly schedule (`defaults` in UTC, as the Engine answers). */
export const backupsBody = {
  store: { id: 1, name: 'Offsite', driver: 's3', location: 'acme-backups/panel' },
  defaults: { auto_enable: true, frequency: 'weekly', hour: 2, day_of_week: 1, day_of_month: null, keep_last: 7 },
  drivers: ['local', 's3', 'sftp', 'ftp', 'ftps'],
  default_local_location: '/var/backups',
}

export const backupsHandlers: Record<string, Handler> = {
  ...settingsCalls,
  'GET /community/backups': { json: backupsBody },
  'PUT /community/backups': { json: { defaults: backupsBody.defaults } },
  'PUT /community/backups/store': { json: { store: backupsBody.store } },
}

// Legacy and next share the `backup-*` / `store-*` classes (no test ids in the Backups components), so the probes read the same selectors on both sides.
function byClass (selector: string) {
  return {
    legacy: (page: Page) => page.locator(selector),
    next: (page: Page) => page.locator(selector),
  }
}

export const backupsProbes: ParityState['probes'] = [
  {
    // Anchor: the store summary exists only once `GET /community/backups` has answered with a store.
    key: 'store-summary',
    ...byClass('.backup-store-summary'),
  },
  { key: 'storage', ...byClass('.backup-storage') },
  { key: 'store-driver', ...byClass('.backup-store-driver') },
  { key: 'store-location', ...byClass('.backup-store-location') },
  {
    key: 'change-store',
    legacy: page => page.locator('.backup-store-button'),
    next: page => page.locator('.backup-store-button'),
  },
  { key: 'auto-enable', ...byClass('.backup-auto-enable') },
  { key: 'keep-last', ...byClass('.backup-keep-last') },
  { key: 'frequency', ...byClass('.backup-frequency') },
  { key: 'day-of-week', ...byClass('.backup-day-of-week') },
  { key: 'hour', ...byClass('.backup-hour') },
  {
    key: 'save',
    legacy: page => page.getByRole('button', { name: tr('button.saveChanges') }),
    next: page => page.getByRole('button', { name: tr('button.saveChanges') }),
  },
]

export const settingsBackupsDefault: ParityState = {
  id: 'settings-backups-default',
  path: '/settings?tab=backups',
  signedIn: true,
  // Fixed clock: the weekday names and the schedule text come from it.
  clock: '2026-03-14T10:00:00Z',
  home: backupsHome,
  handlers: backupsHandlers,
  actions: { legacy: [], next: [] },
  probes: backupsProbes,
}

// 7-state matrix: hover and keyboard focus of Change store (the helpers match the button by its accessible name).
// The button sits in the storage card, below the fold on narrow variants: the scroll is kept so the pointer stays on it.
export const settingsBackupsHover: ParityState = {
  ...buttonHoverState(settingsBackupsDefault, 'settings-backups-hover', 'settings.backups.changeStore', 'lite'),
  keepScroll: true,
}
export const settingsBackupsFocusVisible = buttonFocusState(settingsBackupsDefault, 'settings-backups-focus-visible', 'settings.backups.changeStore', 'lite')

// No store (`GET /community/backups` with `store: null`): the summary says so and Configure opens the store modal; Auto enable is disabled (`BackupSettings.vue:14`).
// The store-summary probes are absent here, so the readiness anchor is the no-store text.
const noStoreProbes: ParityState['probes'] = [
  { key: 'no-store', ...byClass('.backup-no-store') },
  { key: 'storage', ...byClass('.backup-storage') },
  {
    key: 'change-store',
    legacy: page => page.locator('.backup-store-button'),
    next: page => page.locator('.backup-store-button'),
  },
  { key: 'auto-enable', ...byClass('.backup-auto-enable') },
  { key: 'keep-last', ...byClass('.backup-keep-last') },
  { key: 'frequency', ...byClass('.backup-frequency') },
  { key: 'day-of-week', ...byClass('.backup-day-of-week') },
  { key: 'hour', ...byClass('.backup-hour') },
  {
    key: 'save',
    legacy: page => page.getByRole('button', { name: tr('button.saveChanges') }),
    next: page => page.getByRole('button', { name: tr('button.saveChanges') }),
  },
]

export const settingsBackupsNoStore: ParityState = {
  ...settingsBackupsDefault,
  id: 'settings-backups-no-store',
  handlers: {
    ...backupsHandlers,
    'GET /community/backups': { json: { ...backupsBody, store: null } },
  },
  probes: noStoreProbes,
}

// Saving: a changed keep-last enables Save; the held `PUT /community/backups` keeps the form disabled and Save in its loading state (`SettingsView.vue:392,422`).
export const settingsBackupsSaving: ParityState = {
  ...settingsBackupsDefault,
  id: 'settings-backups-saving',
  handlers: { ...backupsHandlers, 'PUT /community/backups': 'hold' },
  actions: {
    legacy: [
      async page => {
        await page.locator('.backup-keep-last input').fill('14')
      },
      async page => {
        await page.getByRole('button', { name: tr('button.saveChanges') }).click()
        await settled(page.locator('.v-btn--loading .v-progress-circular'))
      },
    ],
    next: [
      async page => {
        await page.locator('.backup-keep-last input').fill('14')
      },
      async page => {
        await page.getByRole('button', { name: tr('button.saveChanges') }).click()
        await settled(page.getByRole('button', { name: tr('button.saveChanges') }).locator('.v-progress-circular'))
      },
    ],
  },
}

// 422 on save: `keep_last` sits under its field, `day_of_month` (no field in the weekly schedule) under the footer (`SettingsView.vue:401-411`).
// The value is changed first so Save is enabled; the error lines are the state's probes.
const saveErrorHandler: Handler = {
  status: 422,
  json: {
    message: 'The given data was invalid.',
    errors: { keep_last: ['The keep last must be at least 1.'], day_of_month: ['The day of month is invalid.'] },
  },
}

export const settingsBackupsSave422: ParityState = {
  ...settingsBackupsDefault,
  id: 'settings-backups-save-422',
  handlers: { ...backupsHandlers, 'PUT /community/backups': saveErrorHandler },
  actions: {
    legacy: [
      async page => {
        await page.locator('.backup-keep-last input').fill('14')
      },
      async page => {
        await page.getByRole('button', { name: tr('button.saveChanges') }).click()
        await settled(page.locator('.settings-error'))
      },
    ],
    next: [
      async page => {
        await page.locator('.backup-keep-last input').fill('14')
      },
      async page => {
        await page.getByRole('button', { name: tr('button.saveChanges') }).click()
        await settled(page.locator('.settings-error'))
      },
    ],
  },
  probes: [
    { key: 'save-error', ...byClass('.settings-error') },
    { key: 'keep-last-error', ...byClass('.backup-keep-last .v-messages__message') },
    ...backupsProbes.filter(probe => probe.key !== 'save'),
  ],
}

// Load error: GET /community/backups fails, so the store row gives way to the error card with Retry (`BackupStorage.vue:33-50`).
export const settingsBackupsLoadError: ParityState = {
  ...settingsBackupsDefault,
  id: 'settings-backups-load-error',
  handlers: { ...backupsHandlers, 'GET /community/backups': { status: 500, json: { message: 'Server Error' } } },
  probes: [
    { key: 'backup-error', ...byClass('.backup-error') },
    { key: 'retry', ...byClass('.backup-retry') },
  ],
}

// Loading: `GET /community/backups` is held, so the storage row and the defaults fields show their skeletons (`BackupStorage.vue:13-30`, `SettingsView.vue:368-386`); Save is disabled until the schedule loads.
export const settingsBackupsLoading: ParityState = {
  ...settingsBackupsDefault,
  id: 'settings-backups-loading',
  handlers: { ...backupsHandlers, 'GET /community/backups': 'hold' },
  probes: [
    { key: 'storage-skeleton', ...byClass('.backup-skeleton__summary') },
    { key: 'button-skeleton', ...byClass('.backup-skeleton__button') },
    {
      key: 'defaults-skeleton',
      legacy: page => page.locator('.settings-skeleton__input').first(),
      next: page => page.locator('.settings-skeleton__input').first(),
    },
    {
      key: 'save',
      legacy: page => page.getByRole('button', { name: tr('button.saveChanges') }),
      next: page => page.getByRole('button', { name: tr('button.saveChanges') }),
    },
  ],
}

// Dirty: the frequency becomes monthly through its menu, which shows the day-of-month field and enables Save (`BackupSettings.vue:58-112`, `SettingsView.vue:422`).
async function frequencyMonthly (page: Page): Promise<void> {
  await page.locator('.backup-frequency').click()
  await page.getByText(tr('settings.backups.frequencies.monthly'), { exact: true }).click()
  await settled(page.locator('.backup-day-of-month'))
}

export const settingsBackupsDirty: ParityState = {
  ...settingsBackupsDefault,
  id: 'settings-backups-dirty',
  actions: { legacy: [frequencyMonthly], next: [frequencyMonthly] },
  probes: [
    { key: 'frequency', ...byClass('.backup-frequency') },
    { key: 'day-of-month', ...byClass('.backup-day-of-month') },
    {
      key: 'save',
      legacy: page => page.getByRole('button', { name: tr('button.saveChanges') }),
      next: page => page.getByRole('button', { name: tr('button.saveChanges') }),
    },
  ],
}

// Store modal (`BackupStorage.vue:109`, `BackupStoreModal.vue`): with no store the modal opens on the local driver (`initialDriver`) under the Configure title.
// The Configure button sits below the fold, so the modal opens by a click dispatched on the element (lesson "Modal w stanie parity bez przewijania").
// The modal is found by `.backup-store-modal` (the card class on both sides), not by `.v-dialog--active .v-card` (the card is not unique in the DOM).
const openStoreModal: StateAction = async page => {
  await page.locator('.backup-store-button').evaluate(el => (el as HTMLElement).click())
  await settled(page.locator('.backup-store-modal'))
}

const storeModalProbes: ParityState['probes'] = [
  { key: 'store-modal', ...byClass('.backup-store-modal') },
  { key: 'store-modal-title', ...byClass('.backup-store-modal :is(.v-card-title, .v-card__title)') },
  { key: 'store-driver', ...byClass('.backup-store-modal .store-driver') },
  { key: 'store-location', ...byClass('.backup-store-modal .store-field-location') },
  { key: 'store-submit', ...byClass('.backup-store-modal .store-modal-submit') },
  { key: 'store-cancel', ...byClass('.backup-store-modal .store-modal-cancel') },
  { key: 'store-close', ...byClass('.backup-store-modal .store-modal-close') },
]

export const settingsBackupStoreModal: ParityState = {
  ...settingsBackupsNoStore,
  id: 'settings-backup-store-modal',
  actions: { legacy: [openStoreModal], next: [openStoreModal] },
  probes: storeModalProbes,
}

// Store save 422: the Engine rejects the path, so the modal keeps its values and shows the message under the fields (`BackupStoreModal.vue` `.store-modal-error`, the `key: ` prefix is the legacy `getErrorMessages` output).
const storeSaveErrorHandler: Handler = {
  status: 422,
  json: {
    message: 'The given data was invalid.',
    errors: { location: ['The path is not writable.'] },
  },
}

const submitStoreModal: StateAction = async page => {
  await page.locator('.backup-store-modal .store-modal-submit').evaluate(el => (el as HTMLElement).click())
  await settled(page.locator('.backup-store-modal .store-modal-error'))
}

export const settingsBackupStoreModalError: ParityState = {
  ...settingsBackupStoreModal,
  id: 'settings-backup-store-modal-error',
  handlers: { ...settingsBackupStoreModal.handlers, 'PUT /community/backups/store': storeSaveErrorHandler },
  actions: { legacy: [openStoreModal, submitStoreModal], next: [openStoreModal, submitStoreModal] },
  probes: [
    { key: 'store-modal', ...byClass('.backup-store-modal') },
    { key: 'store-modal-error', ...byClass('.backup-store-modal .store-modal-error') },
    { key: 'store-location', ...byClass('.backup-store-modal .store-field-location') },
    { key: 'store-submit', ...byClass('.backup-store-modal .store-modal-submit') },
  ],
}

// Driver-dependent fields: the modal opens on the active store's driver (`initialDriver`), so each state sets the store fixture of its driver instead of opening the menu.
// S3 is the default fixture (`backupsBody`); SFTP and FTP swap the store (port 22 / 21 from `DEFAULT_PORT`, `BackupStoreModal.vue`).
function storeOfDriver (driver: string, location: string): Handler {
  return { json: { ...backupsBody, store: { id: 1, name: 'Offsite', driver, location } } }
}

export const settingsBackupStoreModalS3: ParityState = {
  ...settingsBackupsDefault,
  id: 'settings-backup-store-modal-s3',
  actions: { legacy: [openStoreModal], next: [openStoreModal] },
  probes: storeModalProbes,
}

export const settingsBackupStoreModalSftp: ParityState = {
  ...settingsBackupsDefault,
  id: 'settings-backup-store-modal-sftp',
  handlers: { ...backupsHandlers, 'GET /community/backups': storeOfDriver('sftp', '/backups/panel') },
  actions: { legacy: [openStoreModal], next: [openStoreModal] },
  probes: storeModalProbes,
}

export const settingsBackupStoreModalFtp: ParityState = {
  ...settingsBackupsDefault,
  id: 'settings-backup-store-modal-ftp',
  handlers: { ...backupsHandlers, 'GET /community/backups': storeOfDriver('ftp', '/backups/panel') },
  actions: { legacy: [openStoreModal], next: [openStoreModal] },
  probes: storeModalProbes,
}

// Store saving: `PUT /community/backups/store` is held, so the fields are disabled, the close button is hidden and the submit shows its loading spinner (`BackupStoreModal.vue`, `:persistent="saving"`).
const submitStoreModalHeld: StateAction = async page => {
  await page.locator('.backup-store-modal .store-modal-submit').evaluate(el => (el as HTMLElement).click())
  await settled(page.locator('.backup-store-modal .store-modal-submit .v-progress-circular'))
}

export const settingsBackupStoreModalLoading: ParityState = {
  ...settingsBackupStoreModal,
  id: 'settings-backup-store-modal-loading',
  // No-store base (as in the error state): the S3 fixture has empty keys, so submit fails `required` validation before the PUT and never shows the spinner.
  handlers: { ...settingsBackupStoreModal.handlers, 'PUT /community/backups/store': 'hold' },
  actions: { legacy: [openStoreModal, submitStoreModalHeld], next: [openStoreModal, submitStoreModalHeld] },
  probes: storeModalProbes,
}

const states: ParityState[] = [
  settingsBackupsDefault,
  settingsBackupsHover,
  settingsBackupsFocusVisible,
  settingsBackupsNoStore,
  settingsBackupsSaving,
  settingsBackupsSave422,
  settingsBackupsLoadError,
  settingsBackupsLoading,
  settingsBackupsDirty,
  settingsBackupStoreModal,
  settingsBackupStoreModalError,
  settingsBackupStoreModalS3,
  settingsBackupStoreModalSftp,
  settingsBackupStoreModalFtp,
  settingsBackupStoreModalLoading,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
