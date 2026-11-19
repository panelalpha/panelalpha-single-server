import type { ParityState } from './state'
import type { Page } from '@playwright/test'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import {
  accountState,
  clickRowAction,
  clickSwitch,
  deviceModalProbes,
  deviceRowProbes,
  devicesFrameProbes,
  devicesHandlers,
  deviceSubmitDisabled,
  legacyUserLoaded,
  modalProbes,
  openDevicesTab,
  openModal,
  selectRows,
  snackbarProbes,
  twoFactorDisableProbes,
  twoFactorHandlers,
  twoFactorStep1Probes,
  twoFactorStep2Probes,
  twoFactorSwitchDisabled,
  userFormProbes,
  userLoaded,
} from './account'
import { buttonFocusState, buttonHoverState, settled, tr } from './auth'
import { alertManagerProbe } from './hosting'
import { isDesktop } from './shell'

// S-118 my-account (formerly S-47). Each state id is a literal `id: '…',` line, which `registeredStateIds` in report/write-report.ts
// reads as text.

export const accountUserForm: ParityState = {
  id: 'my-account-default',
  ...accountState({
    legacy: [legacyUserLoaded],
    next: [userLoaded],
    probes: userFormProbes,
  }),
}

// Generated password (lite `Account.vue:187,558-577`): the password button reads "Set Password" and opens the set-password modal.
export const accountUserGenerated: ParityState = {
  id: 'my-account-user-generated',
  ...accountState({
    user: { password_generated: true },
    legacy: [legacyUserLoaded],
    next: [userLoaded],
    probes: [
      ...userFormProbes.filter(probe => probe.key !== 'change-password'),
      {
        key: 'set-password',
        legacy: page => page.getByRole('button', { name: tr('button.password.set', 'lite'), exact: true }),
        next: page => page.getByTestId('account-change-password'),
      },
    ],
  }),
}

// Hover of the user tab's main buttons (matrix state `hover`, pattern of `buttonHoverState` in auth.ts). Lite copy.
// The buttons sit below the fold on mobile (and Save on desktop); the scroll reset before the probes would move them away from the pointer.
export const accountChangePasswordHover: ParityState = { ...buttonHoverState(accountUserForm, 'my-account-change-password-hover', 'button.password.change', 'lite'), keepScroll: true }
export const accountSaveHover: ParityState = { ...buttonHoverState(accountUserForm, 'my-account-save-hover', 'button.saveChanges', 'lite'), keepScroll: true }

// Keyboard focus of the same main button (matrix state `focus-visible`, `buttonFocusState` in auth.ts). Lite copy.
export const accountChangePasswordFocus = buttonFocusState(accountUserForm, 'my-account-change-password-focus', 'button.password.change', 'lite')

export const accountUserValidation: ParityState = {
  id: 'my-account-user-validation',
  ...accountState({
    legacy: [
      legacyUserLoaded,
      async page => {
        await page.locator('.panel-bg input').first().fill('')
        await page.getByRole('button', { name: tr('button.saveChanges'), exact: true }).click()
        await settled(page.locator('.panel-bg .v-messages__message').first())
        // Clicking Save below the fold scrolls the page; the screenshot would then depend on each app's page height.
        await page.evaluate(() => window.scrollTo(0, 0))
      },
    ],
    next: [
      userLoaded,
      async page => {
        await page.getByTestId('account-field-first_name').locator('input').fill('')
        await page.getByTestId('account-save').click()
        await settled(page.getByTestId('account-field-first_name').locator('.v-messages__message'))
        await page.evaluate(() => window.scrollTo(0, 0))
      },
    ],
    probes: [
      ...userFormProbes,
      {
        key: 'error-first-name',
        legacy: page => page.locator('.panel-bg .v-messages__message').first(),
        next: page => page.getByTestId('account-field-first_name').locator('.v-messages__message'),
        internal: true,
      },
    ],
  }),
}

const passwordFields = [
  { name: 'current_password', labelKey: 'form.label.passwordCurrent', password: true },
  { name: 'password', labelKey: 'form.label.passwordNew', password: true },
  { name: 'password_confirmation', labelKey: 'form.label.passwordConfirm', password: true },
]

export const accountChangePasswordModal: ParityState = {
  id: 'my-account-change-password-modal',
  ...accountState({
    ...openModal('button.password.change', 'account-change-password'),
    probes: modalProbes(passwordFields),
  }),
}

// 422 on the password save (lite `ChangePasswordMixin.js:88-100`): the modal stays open and the API message goes to the alert stack.
// Both sides fill the three fields with the same values, so only the server answer differs from the default modal.
const CHANGE_PASSWORD_VALUES = ['CurrentPass1', 'NewPassword1', 'NewPassword1']

export const accountChangePasswordError: ParityState = {
  id: 'my-account-change-password-error',
  ...accountState((() => {
    const open = openModal('button.password.change', 'account-change-password')
    return {
      handlers: {
        'PUT /user/password': {
          status: 422,
          json: {
            message: 'The given data was invalid.',
            errors: { password: ['The password must contain at least one number.'] },
          },
        },
      },
      legacy: [
        ...open.legacy,
        async (page: Page) => {
          const inputs = page.locator('.v-dialog__content--active input')
          for (const [index, value] of CHANGE_PASSWORD_VALUES.entries()) {
            await inputs.nth(index).fill(value)
          }
          await page.locator('.v-dialog__content--active .v-card__actions .v-btn').nth(0).click()
          await settled(page.locator('.alert-manager .alert--error').first())
        },
      ],
      next: [
        ...open.next,
        async (page: Page) => {
          for (const [index, field] of passwordFields.entries()) {
            await page.getByTestId(`account-modal-field-${field.name}`).locator('input').fill(CHANGE_PASSWORD_VALUES[index]!)
          }
          await page.getByTestId('account-modal-submit').click()
          await settled(page.getByTestId('shell-alert-manager').locator('.alert--error').first())
        },
      ],
      probes: [
        ...modalProbes(passwordFields),
        alertManagerProbe,
        {
          key: 'error-alert',
          legacy: (page: Page) => page.locator('.alert-manager .alert--error').first(),
          next: (page: Page) => page.getByTestId('shell-alert-manager').locator('.alert--error').first(),
        },
      ],
    }
  })()),
}

export const accountChangeEmailModal: ParityState = {
  id: 'my-account-change-email-modal',
  ...accountState({
    ...openModal('button.emailAddress.change', 'account-change-email'),
    probes: modalProbes([
      { name: 'password', labelKey: 'form.label.passwordCurrent', password: true },
      { name: 'email', labelKey: 'form.label.emailAddress', password: false },
    ]),
  }),
}

// Generated password (lite `ChangePasswordMixin.js:14-53`): the set-password modal asks for no current password, and its button reads "Set Password".
export const accountSetPasswordModal: ParityState = {
  id: 'my-account-set-password-modal',
  ...accountState({
    user: { password_generated: true },
    ...openModal('button.password.set', 'account-change-password'),
    probes: modalProbes(passwordFields.filter(field => field.name !== 'current_password')),
  }),
}

// Generated password, e-mail branch (lite `ChangeEmailAddressMixin.js:12-24`): the modal only says the password must be set first; its primary button opens the set-password modal.
export const accountChangeEmailSetPasswordFirst: ParityState = {
  id: 'my-account-change-email-set-password-first',
  ...accountState({
    user: { password_generated: true },
    ...openModal('button.emailAddress.change', 'account-change-email'),
    probes: modalProbes([]),
  }),
}

// Entry `/my-account?change_password_required=true` (lite `Account.vue:391-393`): the change-password modal opens on mount, without a click. The flag stays in the URL.
export const accountChangePasswordRequired: ParityState = {
  id: 'my-account-change-password-required',
  ...accountState({
    path: '/my-account?change_password_required=true',
    legacy: [
      legacyUserLoaded,
      async (page: Page) => {
        await settled(page.locator('.v-dialog__content--active .v-card'))
      },
    ],
    next: [
      userLoaded,
      async (page: Page) => {
        await settled(page.getByTestId('account-modal'))
      },
    ],
    probes: modalProbes(passwordFields),
  }),
}

export const account2faStep1: ParityState = {
  id: 'my-account-2fa-step1',
  ...accountState({
    ...clickSwitch('account-2fa-modal'),
    handlers: twoFactorHandlers,
    probes: twoFactorStep1Probes,
  }),
}

export const account2faStep2: ParityState = {
  id: 'my-account-2fa-step2',
  ...accountState((() => {
    const open = clickSwitch('account-2fa-modal')
    return {
      legacy: [
        ...open.legacy,
        async (page: Page) => {
          await page.locator('.v-dialog__content--active input[type=text]').fill('123456')
          await page.locator('.v-dialog__content--active .v-card__actions .v-btn').nth(0).click()
          await settled(page.locator('.v-dialog__content--active .recovery-code-box'))
        },
      ],
      next: [
        ...open.next,
        async (page: Page) => {
          await page.getByTestId('account-2fa-code').locator('input').fill('123456')
          await page.getByTestId('account-2fa-confirm').click()
          await settled(page.getByTestId('account-2fa-recovery'))
        },
      ],
      handlers: twoFactorHandlers,
      probes: twoFactorStep2Probes,
    }
  })()),
}

export const account2faDisable: ParityState = {
  id: 'my-account-2fa-disable',
  ...accountState({
    ...clickSwitch('account-2fa-disable-modal'),
    user: { two_factor_auth_enabled: true },
    probes: twoFactorDisableProbes,
  }),
}

const deviceTabActions = {
  legacy: [legacyUserLoaded, openDevicesTab.legacy],
  next: [userLoaded, openDevicesTab.next],
}

// Disabled switch while its start request is in flight (matrix `disabled`; lite `Account.vue:225`, next `MyAccountView.vue:281`).
// The POST is held, so the 2FA modal never opens and the switch stays loading.
export const account2faSwitchDisabled: ParityState = {
  id: 'my-account-2fa-switch-disabled',
  ...accountState({
    ...twoFactorSwitchDisabled,
    handlers: { 'POST /user/two-factor-authentication': 'hold' },
    probes: userFormProbes.filter(probe => probe.key === 'two-factor-switch' || probe.key === 'switch-input'),
  }),
}

// 423 on the 2FA start with a generated password (lite `Account.vue:558-577`): the error alert `setPasswordFirst` shows first, then the set-password modal opens.
// The 2FA dialog never appears, so the state waits on the alert and on the modal card instead of `clickSwitch`.
export const account2fa423: ParityState = {
  id: 'my-account-2fa-423',
  ...accountState({
    user: { password_generated: true },
    handlers: {
      'POST /user/two-factor-authentication': { status: 423, json: { message: 'The password must be set first.' } },
    },
    legacy: [
      legacyUserLoaded,
      async (page: Page) => {
        await page.locator('.panel-bg .switch-container').click()
        await settled(page.locator('.alert-manager .alert--error').first())
        await settled(page.locator('.v-dialog__content--active .v-card'))
      },
    ],
    next: [
      userLoaded,
      async (page: Page) => {
        await page.getByTestId('account-two-factor-switch').click()
        await settled(page.getByTestId('shell-alert-manager').locator('.alert--error').first())
        await settled(page.getByTestId('account-modal'))
      },
    ],
    probes: [
      alertManagerProbe,
      {
        key: 'error-alert',
        legacy: (page: Page) => page.locator('.alert-manager .alert--error').first(),
        next: (page: Page) => page.getByTestId('shell-alert-manager').locator('.alert--error').first(),
      },
      {
        key: 'modal-card',
        legacy: (page: Page) => page.locator('.v-dialog__content--active .v-card'),
        next: (page: Page) => page.getByTestId('account-modal'),
      },
      {
        key: 'modal-title',
        legacy: (page: Page) => page.locator('.v-dialog__content--active .v-card__title h5'),
        next: (page: Page) => page.getByTestId('account-modal-title'),
      },
    ],
  }),
}

export const accountDevicesList: ParityState = {
  id: 'my-account-devices',
  ...accountState({
    ...deviceTabActions,
    handlers: devicesHandlers(),
    probes: [...devicesFrameProbes, ...deviceRowProbes(3)],
  }),
}

export const accountDevicesLoading: ParityState = {
  id: 'my-account-devices-loading',
  ...accountState({
    legacy: [
      legacyUserLoaded,
      openDevicesTab.legacy,
      async page => {
        await settled(page.locator('.v-data-table .v-skeleton-loader').first())
      },
    ],
    next: [
      userLoaded,
      openDevicesTab.next,
      async page => {
        await settled(page.getByTestId('account-devices-table').locator('.v-skeleton-loader').first())
      },
    ],
    handlers: { 'GET /user/devices': 'hold' },
    probes: [
      ...devicesFrameProbes,
      {
        key: 'sort-skeleton',
        legacy: page => page.locator('.v-data-table thead.sort'),
        next: page => page.getByTestId('account-devices-table').locator('thead.sort'),
        internal: true,
        when: isDesktop,
      },
      {
        key: 'row-skeleton',
        legacy: page => page.locator('.v-data-table tbody.item tr').first(),
        next: page => page.getByTestId('account-devices-table').locator('tbody.item tr').first(),
        internal: true,
        when: isDesktop,
      },
      {
        key: 'mobile-skeleton',
        legacy: page => page.locator('.v-data-table .mobile-item').first(),
        next: page => page.getByTestId('account-devices-table').locator('.mobile-item').first(),
        internal: true,
        when: variant => !isDesktop(variant),
      },
    ],
  }),
}

export const accountDevicesEmpty: ParityState = {
  id: 'my-account-devices-empty',
  ...accountState({
    legacy: [legacyUserLoaded, openDevicesTab.legacy, async page => {
      await settled(page.locator('.v-data-table .no-data'))
    }],
    next: [userLoaded, openDevicesTab.next, async page => {
      await settled(page.getByTestId('account-devices-empty'))
    }],
    handlers: devicesHandlers([]),
    probes: [
      ...devicesFrameProbes,
      {
        key: 'empty',
        legacy: page => page.locator('.v-data-table .no-data'),
        next: page => page.getByTestId('account-devices-empty'),
      },
      {
        key: 'empty-illustration',
        legacy: page => page.locator('.v-data-table .no-data__img svg'),
        next: page => page.getByTestId('account-devices-empty').locator('.no-data__img svg'),
        internal: true,
      },
      {
        key: 'empty-title',
        legacy: page => page.locator('.v-data-table .no-data__title'),
        next: page => page.getByTestId('account-devices-empty').locator('.no-data__title'),
        internal: true,
      },
      {
        key: 'empty-description',
        legacy: page => page.locator('.v-data-table .no-data__desc'),
        next: page => page.getByTestId('account-devices-empty').locator('.no-data__desc'),
        internal: true,
      },
    ],
  }),
}

export const accountDevicesNoResults: ParityState = {
  id: 'my-account-devices-no-results',
  ...accountState({
    legacy: [
      legacyUserLoaded,
      openDevicesTab.legacy,
      async page => {
        await page.locator('h4 + div input').fill('no-such-device')
        await settled(page.locator('.v-data-table .no-results-container'))
      },
    ],
    next: [
      userLoaded,
      openDevicesTab.next,
      async page => {
        await page.getByTestId('account-search').locator('input').fill('no-such-device')
        await settled(page.getByTestId('account-devices-no-results'))
      },
    ],
    handlers: devicesHandlers(),
    probes: [
      ...devicesFrameProbes,
      {
        key: 'no-results',
        legacy: page => page.locator('.v-data-table .no-results-container'),
        next: page => page.getByTestId('account-devices-no-results'),
      },
      {
        key: 'no-results-clear',
        legacy: page => page.locator('.v-data-table .no-results-container .v-btn'),
        next: page => page.getByTestId('account-devices-no-results').locator('.v-btn'),
        internal: true,
      },
    ],
  }),
}

export const accountDevicesSelected: ParityState = {
  id: 'my-account-devices-selected',
  ...accountState((() => {
    const select = selectRows([0, 1])
    return {
      legacy: [...deviceTabActions.legacy, select.legacy, async (page: Page) => {
        await settled(page.locator('.v-snack__wrapper'))
      }],
      next: [...deviceTabActions.next, select.next, async (page: Page) => {
        await settled(page.getByTestId('select-snackbar').locator('.v-snackbar__wrapper'))
      }],
      handlers: devicesHandlers(),
      probes: [...devicesFrameProbes, ...deviceRowProbes(3), ...snackbarProbes],
    }
  })()),
}

export const accountDevicesForgetModal: ParityState = {
  id: 'my-account-devices-forget-modal',
  ...accountState((() => {
    const forget = clickRowAction(1, 'forget')
    return {
      legacy: [...deviceTabActions.legacy, forget.legacy, deviceSubmitDisabled.legacy],
      next: [...deviceTabActions.next, forget.next, deviceSubmitDisabled.next],
      handlers: devicesHandlers(),
      probes: deviceModalProbes,
    }
  })()),
}

export const accountDevicesMassForgetModal: ParityState = {
  id: 'my-account-devices-mass-forget-modal',
  ...accountState((() => {
    const select = selectRows([0, 1])
    return {
      legacy: [
        ...deviceTabActions.legacy,
        select.legacy,
        async (page: Page) => {
          await settled(page.locator('.v-snack__wrapper'))
          // Up to 966px wide the snackbar is compact and Forget lives in its menu.
          if (page.viewportSize()!.width > 966) {
            await page.locator('.v-snack__wrapper .snackbar__row .v-btn').click()
          } else {
            await page.locator('.v-snack__wrapper .v-btn.ml-auto').click()
            await page.locator('.menuable__content__active .v-list-item').click()
          }
          await settled(page.locator('.v-dialog__content--active .v-card'))
        },
        deviceSubmitDisabled.legacy,
      ],
      next: [
        ...deviceTabActions.next,
        select.next,
        async (page: Page) => {
          await settled(page.getByTestId('select-snackbar').locator('.v-snackbar__wrapper'))
          if (page.viewportSize()!.width > 966) {
            await page.getByTestId('account-snackbar-forget').click()
          } else {
            await page.getByTestId('select-snackbar-more').click()
            await page.getByTestId('account-snackbar-menu-forget').click()
          }
          await settled(page.getByTestId('account-device-modal'))
        },
        deviceSubmitDisabled.next,
      ],
      handlers: devicesHandlers(),
      probes: deviceModalProbes,
    }
  })()),
}

export const accountDevicesLogoutModal: ParityState = {
  id: 'my-account-devices-logout-modal',
  ...accountState((() => {
    const logout = clickRowAction(1, 'logout')
    return {
      legacy: [...deviceTabActions.legacy, logout.legacy, deviceSubmitDisabled.legacy],
      next: [...deviceTabActions.next, logout.next, deviceSubmitDisabled.next],
      handlers: devicesHandlers(),
      probes: deviceModalProbes,
    }
  })()),
}

const states: ParityState[] = [
  accountUserForm,
  accountUserGenerated,
  accountChangePasswordHover,
  accountSaveHover,
  accountChangePasswordFocus,
  accountUserValidation,
  accountChangePasswordModal,
  accountChangePasswordError,
  accountChangePasswordRequired,
  accountSetPasswordModal,
  accountChangeEmailModal,
  accountChangeEmailSetPasswordFirst,
  account2faStep1,
  account2faStep2,
  account2faDisable,
  account2faSwitchDisabled,
  account2fa423,
  accountDevicesList,
  accountDevicesLoading,
  accountDevicesEmpty,
  accountDevicesNoResults,
  accountDevicesSelected,
  accountDevicesForgetModal,
  accountDevicesMassForgetModal,
  accountDevicesLogoutModal,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
