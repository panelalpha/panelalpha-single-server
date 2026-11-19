import type { Handler, ParityState } from './state'
import type { Page } from '@playwright/test'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { buttonFocusState, buttonHoverState, settled, tr as trKey } from './auth'
import { shellHandlers, shellHome } from './shell'

/** Copy from the app-lite translation (the Community panel settings exist only in app-lite). */
export const tr = (key: string): string => trKey(key, 'lite')

/** The signed-in Free panel admin; `/settings` is a route of the lite router. */
export const settingsHome = shellHome({ user: { email: 'jane@example.com' } })

export const settingsBody = {
  name: 'Acme Panel',
  url: 'https://panel.example.test',
  default_language: 'en',
  default_date_format: 'YYYY-MM-DD',
  languages: ['en', 'pl'],
  date_formats: ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'],
}

/** Handlers of the `/community/*` calls (not in the lite fixtures; an unmatched `/api/**` request fails the test). */
export const settingsHandlers: Record<string, Handler> = {
  ...shellHandlers([], 'projects'),
  'GET /community/settings': { json: settingsBody },
  'PUT /community/settings': { json: settingsBody },
  'PUT /community/settings/url': { json: { url: settingsBody.url } },
  'GET /community/hub': { json: { paired: false } },
  'POST /community/hub/start': { json: { link: 'https://hub.example.test/connect' } },
  'POST /community/hub/complete': { json: { status: 'connected' } },
  'POST /community/hub/disconnect': { json: { paired: false } },
  'GET /community/backups': {
    json: {
      store: null,
      defaults: { auto_enable: false, frequency: 'daily', hour: 2, day_of_week: null, day_of_month: null, keep_last: 7 },
      drivers: ['local'],
      default_local_location: '/var/backups',
    },
  },
}

// Next uses `getByTestId` only; the legacy side has no test ids, so it uses the classes and structure of `views/free/Settings.vue`.
const legacyField = (page: Page, name: string) => page.locator('.v-input').filter({ has: page.locator(`input[name="${name}"]`) })

export const probes: ParityState['probes'] = [
  {
    // Anchor.
    key: 'title',
    legacy: page => page.getByRole('heading', { name: tr('settings.title'), exact: true }),
    next: page => page.getByTestId('settings-title'),
  },
  {
    key: 'tabs',
    legacy: page => page.locator('.v-tabs--page'),
    next: page => page.getByTestId('settings-tabs'),
  },
  {
    key: 'hub',
    legacy: page => page.locator('.hub-connection'),
    next: page => page.getByTestId('hub-card'),
  },
  {
    key: 'hub-status',
    legacy: page => page.locator('.hub-status'),
    next: page => page.getByTestId('hub-status'),
  },
  {
    key: 'hub-connect',
    legacy: page => page.locator('.hub-connect'),
    next: page => page.getByTestId('hub-connect'),
  },
  {
    key: 'card',
    legacy: page => page.locator('.v-card').filter({ has: page.locator('form') }),
    next: page => page.getByTestId('settings-card'),
  },
  {
    key: 'field-name',
    legacy: page => legacyField(page, 'name'),
    next: page => page.getByTestId('settings-field-name'),
  },
  {
    key: 'field-language',
    legacy: page => page.locator('.settings-language'),
    next: page => page.getByTestId('settings-field-language'),
  },
  {
    key: 'field-date-format',
    legacy: page => page.locator('.settings-date-format'),
    next: page => page.getByTestId('settings-field-date-format'),
  },
  {
    key: 'url',
    legacy: page => page.locator('.settings-url'),
    next: page => page.getByTestId('settings-url'),
  },
  {
    key: 'save',
    legacy: page => page.getByRole('button', { name: tr('button.saveChanges') }),
    next: page => page.getByTestId('settings-save'),
  },
]

export const settingsGeneralDefault: ParityState = {
  id: 'settings-general-default',
  path: '/settings',
  signedIn: true,
  // Fixed clock: the date format items show today's date.
  clock: '2026-03-14T10:00:00Z',
  home: settingsHome,
  handlers: settingsHandlers,
  actions: { legacy: [], next: [] },
  // The pulsing status dot of the Hub badge.
  masks: {
    legacy: [page => page.locator('.hub-dot')],
    next: [page => page.locator('.hub-dot')],
  },
  probes,
}

// Dirty: editing the name enables Save (legacy `dirty` flag; the button is disabled while the form is pristine).
export const settingsGeneralDirty: ParityState = {
  ...settingsGeneralDefault,
  id: 'settings-general-dirty',
  actions: {
    legacy: [async page => {
      await legacyField(page, 'name').locator('input').fill('Acme Panel 2')
    }],
    next: [async page => {
      await page.getByTestId('settings-field-name').locator('input').fill('Acme Panel 2')
    }],
  },
}

// 7-state matrix: hover and keyboard focus of Connect (the helpers match the buttons by accessible name). Change Domain is gone
// (ID-53: the Application URL is edited in place, so next has no button and no URL modal; expected delta of the General states).
// Connect is below the fold at 375px (the Hub card is taller): the scroll is kept for the same reason.
export const settingsHubConnectHover: ParityState = {
  ...buttonHoverState(settingsGeneralDefault, 'settings-hub-connect-hover', 'settings.hub.connect', 'lite'),
  keepScroll: true,
}
export const settingsHubConnectFocusVisible = buttonFocusState(settingsGeneralDefault, 'settings-hub-connect-focus-visible', 'settings.hub.connect', 'lite')

// Disabled: a save in flight (`PUT /community/settings` held) disables the fields and shows the spinner in Save (legacy `savingGeneral`, `Settings.vue:103-131,185`).
export const settingsGeneralDisabled: ParityState = {
  ...settingsGeneralDirty,
  id: 'settings-general-disabled',
  handlers: { ...settingsHandlers, 'PUT /community/settings': 'hold' },
  actions: {
    legacy: [
      ...settingsGeneralDirty.actions.legacy,
      async page => {
        await page.getByRole('button', { name: tr('button.saveChanges') }).click()
        await settled(page.locator('.v-btn--loading .v-progress-circular'))
      },
    ],
    next: [
      ...settingsGeneralDirty.actions.next,
      async page => {
        await page.getByTestId('settings-save').click()
        await settled(page.getByTestId('settings-save').locator('.v-progress-circular'))
      },
    ],
  },
  // The spinner inside the loading button is indeterminate.
  masks: {
    legacy: [...(settingsGeneralDefault.masks?.legacy ?? []), page => page.locator('.v-btn--loading .v-progress-circular')],
    next: [...(settingsGeneralDefault.masks?.next ?? []), page => page.getByTestId('settings-save').locator('.v-progress-circular')],
  },
}

// 422 on the name: the message sits under the field without the key prefix (legacy `fail`, `Settings.vue:442-470`).
export const settingsGeneralSave422: ParityState = {
  ...settingsGeneralDirty,
  id: 'settings-general-save-422',
  handlers: {
    ...settingsHandlers,
    'PUT /community/settings': { status: 422, json: { message: 'The given data was invalid.', errors: { name: ['The name has already been taken.'] } } },
  },
  actions: {
    legacy: [
      ...settingsGeneralDirty.actions.legacy,
      async page => {
        await page.getByRole('button', { name: tr('button.saveChanges') }).click()
        await settled(legacyField(page, 'name').locator('.v-messages__message'))
      },
    ],
    next: [
      ...settingsGeneralDirty.actions.next,
      async page => {
        await page.getByTestId('settings-save').click()
        await settled(page.getByTestId('settings-field-name').locator('.v-messages__message'))
      },
    ],
  },
}

// Load error: GET /community/settings fails, the Hub card stays (it loads on its own). The error card and Retry replace both General sections.
export const settingsGeneralLoadError: ParityState = {
  ...settingsGeneralDefault,
  id: 'settings-general-load-error',
  handlers: {
    ...settingsHandlers,
    'GET /community/settings': { status: 500, json: { message: 'Server Error' } },
  },
}

// Loading: GET /community/settings never answers, so both sections stay on the skeleton (shimmer / pulse masked).
export const settingsGeneralLoading: ParityState = {
  ...settingsGeneralDefault,
  id: 'settings-general-loading',
  handlers: { ...settingsHandlers, 'GET /community/settings': 'hold' },
  masks: {
    legacy: [...(settingsGeneralDefault.masks?.legacy ?? []), page => page.locator('.v-skeleton-loader, .hub-dot')],
    next: [...(settingsGeneralDefault.masks?.next ?? []), page => page.locator('.v-skeleton-loader, .hub-dot')],
  },
}

// Hub loading: GET /community/hub never answers; the form is loaded, the Hub card shows its loading state.
export const settingsHubLoading: ParityState = {
  ...settingsGeneralDefault,
  id: 'settings-hub-loading',
  handlers: { ...settingsHandlers, 'GET /community/hub': 'hold' },
  masks: {
    legacy: [page => page.locator('.hub-card--loading')],
    next: [page => page.locator('.hub-card--loading')],
  },
}

function hubProbes (extra: NonNullable<ParityState['probes']>): ParityState['probes'] {
  return [
    ...probes.filter(probe => probe.key !== 'hub-connect'),
    ...extra,
  ]
}

// Hub connected: `GET /community/hub` answers paired with the account name; the card shows the connected row and the Disconnect button (the dot is masked).
export const settingsHubConnected: ParityState = {
  ...settingsGeneralDefault,
  id: 'settings-hub-connected',
  home: shellHome({ user: { email: 'jane@example.com' }, app: { hub_paired: true } }),
  handlers: { ...settingsHandlers, 'GET /community/hub': { json: { paired: true, account_name: 'Acme' } } },
  probes: hubProbes([
    {
      key: 'hub-disconnect',
      legacy: page => page.locator('.hub-disconnect'),
      next: page => page.getByTestId('hub-disconnect'),
    },
  ]),
}

// Hub pending: the return from the Hub (`?state&result`) is answered `pending`; after the handler the card shows the "Check again" block.
// The anchor is the result of the handler (the Check again button), not the URL.
export const settingsHubPending: ParityState = {
  ...settingsGeneralDefault,
  id: 'settings-hub-pending',
  path: '/settings?state=s1&result=r1',
  handlers: { ...settingsHandlers, 'POST /community/hub/complete': { json: { status: 'pending' } } },
  actions: {
    legacy: [async page => {
      await settled(page.locator('.hub-retry'))
    }],
    next: [async page => {
      await settled(page.getByTestId('hub-check-again'))
    }],
  },
  probes: hubProbes([
    {
      key: 'hub-retry',
      legacy: page => page.locator('.hub-retry'),
      next: page => page.getByTestId('hub-check-again'),
    },
  ]),
}

// Disconnect modal: opened from the connected row. The modal has no password field (legacy neither): it shows the warning and Disconnect/Cancel,
// or, for an admin whose password was generated (`home.user.password_generated`), the set-password notice and link instead of Disconnect.
// The classes exist on both sides; the modal is teleported, so the probes look at the page.
const disconnectProbes = hubProbes([
  {
    key: 'hub-disconnect-modal',
    legacy: page => page.locator('.hub-disconnect-modal'),
    next: page => page.getByTestId('hub-disconnect-modal'),
  },
  {
    key: 'hub-disconnect-cancel',
    legacy: page => page.locator('.hub-disconnect-cancel'),
    next: page => page.getByTestId('hub-disconnect-cancel'),
  },
])

const openDisconnectModal = {
  legacy: [async (page: Page) => {
    await page.locator('.hub-disconnect').click()
    await settled(page.locator('.hub-disconnect-modal'))
  }],
  next: [async (page: Page) => {
    await page.getByTestId('hub-disconnect').click()
    await settled(page.getByTestId('hub-disconnect-modal'))
  }],
}

export const settingsHubDisconnectModal: ParityState = {
  ...settingsHubConnected,
  id: 'settings-hub-disconnect-modal',
  actions: openDisconnectModal,
  probes: [
    ...disconnectProbes,
    {
      key: 'hub-disconnect-confirm',
      legacy: page => page.locator('.hub-disconnect-confirm'),
      next: page => page.getByTestId('hub-disconnect-confirm'),
    },
  ],
}

// Password generated: the confirm button is replaced by the set-password link (legacy `passwordGenerated`, `HubDisconnectModal.vue:20,30-41`).
export const settingsHubDisconnectModalPassword: ParityState = {
  ...settingsHubDisconnectModal,
  id: 'settings-hub-disconnect-modal-password',
  home: shellHome({ user: { email: 'jane@example.com', password_generated: true }, app: { hub_paired: true } }),
  probes: [
    ...disconnectProbes,
    {
      key: 'hub-disconnect-set-password-link',
      legacy: page => page.locator('.hub-disconnect-set-password-link'),
      next: page => page.locator('.hub-disconnect-set-password-link'),
    },
  ],
}

// Loading: `POST /community/hub/disconnect` held after Confirm; the button shows the loader and "Disconnecting", Cancel is disabled (spinner masked).
export const settingsHubDisconnectModalLoading: ParityState = {
  ...settingsHubDisconnectModal,
  id: 'settings-hub-disconnect-modal-loading',
  handlers: { ...settingsHubConnected.handlers, 'POST /community/hub/disconnect': 'hold' },
  actions: {
    legacy: [
      ...openDisconnectModal.legacy,
      async page => {
        await page.locator('.hub-disconnect-confirm').click()
        await settled(page.locator('.hub-disconnect-confirm .v-progress-circular').first())
      },
    ],
    next: [
      ...openDisconnectModal.next,
      async page => {
        await page.getByTestId('hub-disconnect-confirm').click()
        await settled(page.getByTestId('hub-disconnect-confirm').locator('.v-progress-circular').first())
      },
    ],
  },
  masks: {
    legacy: [page => page.locator('.hub-dot, .hub-disconnect-confirm .v-progress-circular, .hub-disconnect-confirm .loader')],
    next: [page => page.locator('.hub-dot, .hub-disconnect-confirm .v-progress-circular, .hub-disconnect-confirm .loader')],
  },
}

const states: ParityState[] = [
  settingsGeneralDefault,
  settingsGeneralDirty,
  settingsHubConnectHover,
  settingsHubConnectFocusVisible,
  settingsGeneralDisabled,
  settingsGeneralSave422,
  settingsGeneralLoadError,
  settingsGeneralLoading,
  settingsHubLoading,
  settingsHubConnected,
  settingsHubPending,
  settingsHubDisconnectModal,
  settingsHubDisconnectModalPassword,
  settingsHubDisconnectModalLoading,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
