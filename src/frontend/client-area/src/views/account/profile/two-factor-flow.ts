import type { AlertPayload } from '@/shared/alerts/alerts.store'
import type { HomeUser } from '@/shared/session/session.api'
import { ref } from 'vue'
import { fetchTwoFactorRecoveryCodes } from '@/shared/session/session.api'
import { responseMessage, responseStatus } from './account-modals'
import {
  confirmTwoFactorAuthentication,
  disableTwoFactorAuthentication,
  enableTwoFactorAuthentication,
  fetchTwoFactorQrCode,
  fetchTwoFactorSecretKey,
} from './account.api'

type Translate = (key: string) => string

export interface TwoFactorAlerts {
  alert: (payload: AlertPayload) => void
  t: Translate
}

export interface TwoFactorFlowDeps extends TwoFactorAlerts {
  /** Refetches `/home` and refills the form and the switch. */
  reload: () => Promise<void>
  patchUser: (patch: Partial<HomeUser>) => void
  /** A Connect-created admin who never saw the password. */
  passwordGenerated: () => boolean
  /** Opens the set-password modal. */
  onPasswordRequired: () => void
}

/** The enable chain: POST enable, then the QR code, then the secret key. Rejects with the first failing call's error. */
export async function fetchTwoFactorSetup (): Promise<{ svg: string, secretKey: string }> {
  await enableTwoFactorAuthentication()
  const { svg } = await fetchTwoFactorQrCode()
  const { secretKey } = await fetchTwoFactorSecretKey()
  return { svg, secretKey }
}

/**
 * Outcome of `activateTwoFactor`. `confirmed` is false only while the code is rejected (the account still has no 2FA); `codes` stays null when
 * the recovery codes could not be loaded, which leaves 2FA switched on without a recovery code the user has seen.
 */
export interface TwoFactorActivation {
  confirmed: boolean
  codes: string[] | null
}

/**
  * Confirm the code, then load the recovery codes. Resolves with the outcome (step 2 when the codes
  * arrived), after the error alert of a failure. `onChanged` is true once the code was confirmed, false on a failure.
 */
export async function activateTwoFactor (
  code: string,
  { alert, t }: TwoFactorAlerts,
  onChanged: (changed: boolean) => void,
): Promise<TwoFactorActivation> {
  try {
    await confirmTwoFactorAuthentication(code)
  } catch {
    alert({ success: false, errorMessage: t('notification.account.2fa.error') })
    onChanged(false)
    return { confirmed: false, codes: null }
  }

  try {
    const recoveryCodes = await fetchTwoFactorRecoveryCodes()
    alert({ success: true, successMessage: t('notification.account.2fa.success') })
    onChanged(true)
    return { confirmed: true, codes: recoveryCodes }
  } catch (error) {
    alert({ success: false, errorMessage: responseMessage(error) })
    onChanged(false)
    return { confirmed: true, codes: null }
  }
}

/** Resolves true after the success alert, false after an error alert. */
export async function deactivateTwoFactor ({ alert, t }: TwoFactorAlerts): Promise<boolean> {
  try {
    await disableTwoFactorAuthentication()
  } catch (error) {
    alert({ success: false, errorMessage: responseMessage(error) })
    return false
  }
  alert({ success: true, successMessage: t('notification.account.disable2fa.success') })
  return true
}

/** The screen half of the 2FA flow: switch state, the two dialogs and their close rules. */
export function useTwoFactorFlow (deps: TwoFactorFlowDeps) {
  const enabled = ref(false)
  const loading = ref(false)
  const isOpenTwoFactorAuthModal = ref(false)
  const isOpenTwoFactorDisableConfirmationModal = ref(false)
  const codeQr = ref('')
  const secretKey = ref('')
  // In legacy this flag is set by the modal's `enable-2fa` emit and never reset.
  let faChanged = false
  // `AppDialog` clears the v-model before it emits `close` (Esc, a click outside), so the open flag cannot tell a closed
  // dialog from one the shell just closed: these do, and go back to false when the dialog opens.
  let authDialogClosed = true
  let disableDialogClosed = true

  async function enableTwoFactorAuth (): Promise<void> {
    loading.value = true
    try {
      const setup = await fetchTwoFactorSetup()
      codeQr.value = setup.svg
      secretKey.value = setup.secretKey
      authDialogClosed = false
      isOpenTwoFactorAuthModal.value = true
    } catch (error) {
      // 423 means the 2FA routes want a password; alert first, then the set-password modal.
      if (responseStatus(error) === 423 && deps.passwordGenerated()) {
        deps.alert({ success: false, errorMessage: deps.t('notification.account.2fa.setPasswordFirst') })
        deps.onPasswordRequired()
      } else {
        deps.alert({ success: false, errorMessage: responseMessage(error) })
      }
    } finally {
      // Legacy leaves `loading` true after an error (the switch stays stuck); resetting it is a deviation.
      loading.value = false
    }
  }

  function toggleTwoFactorAuth (): void {
    if (enabled.value) {
      disableDialogClosed = false
      isOpenTwoFactorDisableConfirmationModal.value = true
    } else {
      void enableTwoFactorAuth()
    }
  }

  /** The account has 2FA from the confirmed code on: the switch says so before the reload answers. */
  function change2fa (changed: boolean): void {
    faChanged = changed
    if (changed) {
      enabled.value = true
    }
  }

  async function reloadAndSync (): Promise<void> {
    try {
      await deps.reload()
      deps.patchUser({ two_factor_auth_enabled: enabled.value })
    } catch {
      // Legacy lets a failed reload reject unhandled; the screen keeps what it shows.
    }
  }

  /** X, Back, "Back to My Account", and (deviation) outside click and Esc. */
  async function closeTwoFactorAuthModal (): Promise<void> {
    if (authDialogClosed) {
      return
    }
    authDialogClosed = true
    if (!faChanged) {
      enabled.value = false
    }
    isOpenTwoFactorAuthModal.value = false
    await reloadAndSync()
  }

  async function closeTwoFactorAuthConfirmDisableModal (): Promise<void> {
    if (disableDialogClosed) {
      return
    }
    disableDialogClosed = true
    isOpenTwoFactorDisableConfirmationModal.value = false
    await reloadAndSync()
  }

  /** Disable confirmed: the cached user turns OFF at once, then both buttons' shared close runs (close + reload). */
  async function onTwoFactorDisabled (): Promise<void> {
    enabled.value = false
    deps.patchUser({ two_factor_auth_enabled: false })
    await closeTwoFactorAuthConfirmDisableModal()
  }

  return {
    enabled,
    loading,
    isOpenTwoFactorAuthModal,
    isOpenTwoFactorDisableConfirmationModal,
    codeQr,
    secretKey,
    enableTwoFactorAuth,
    toggleTwoFactorAuth,
    change2fa,
    closeTwoFactorAuthModal,
    closeTwoFactorAuthConfirmDisableModal,
    onTwoFactorDisabled,
  }
}
