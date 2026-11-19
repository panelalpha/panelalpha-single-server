// Pure state of the WP Admin SSO dialog (computed properties, with the app-lite
// `noUsers` guards: lite wins on a conflict, so the app target shows them too). `AppSsoModal` reuses it.

import type { AppSsoUser, WordpressSsoUser } from './instance-actions.api'

export interface SsoUserOption {
  label: string
  value: number | string
}

/** `display_name - email`, the e-mail from `user_email` then `email`. */
export function toSsoOptions (users: WordpressSsoUser[]): SsoUserOption[] {
  return users.map(user => ({
    label: `${user.display_name} - ${user.user_email || user.email || ''}`,
    value: user.id,
  }))
}

/** The label is `email ?? username ?? id`. */
export function toAppSsoOptions (users: AppSsoUser[]): SsoUserOption[] {
  return users.map(user => ({
    label: String(user.email ?? user.username ?? user.id),
    value: user.id,
  }))
}

export interface SsoStateInput {
  userCount: number
  /** `instance.getDnsResolveStatus() === false`. */
  dnsMismatch: boolean
  singleServer: boolean
  previewProviderEnabled: boolean
  submitting: boolean
  checkingDns: boolean
  submitSuccess: boolean
  showLoginButton: boolean
}

export interface SsoView {
  showUserSelect: boolean
  /** An i18n key of the paragraph, or `''`. */
  messageKey: string
  /** An i18n key of the warning box, or `''`. */
  alertKey: string
  showPreviewButtons: boolean
  showGenerateButton: boolean
  showLoginButton: boolean
}

const MESSAGE_KEY = 'heading.instance.ssoSingleLogin.message'

export function ssoView (input: SsoStateInput): SsoView {
  const hasUsers = input.userCount > 0
  const showPreview = hasUsers
    && input.dnsMismatch
    && (input.singleServer || input.previewProviderEnabled)
  const showGenerate = hasUsers
    && !showPreview
    && (input.userCount > 1 || input.dnsMismatch)

  let messageKey = ''
  if (input.submitting || input.checkingDns) {
    messageKey = MESSAGE_KEY
  } else if (input.submitSuccess) {
    messageKey = 'notification.instance.modal.ssoLogin.success'
  }

  let alertKey = ''
  if (input.dnsMismatch) {
    alertKey = 'notification.instance.modal.ssoLogin.dnsMismatchDetected'
  } else if (!hasUsers) {
    alertKey = 'notification.instance.modal.ssoLogin.noUsers'
  }

  return {
    showUserSelect: input.userCount > 1,
    messageKey,
    alertKey,
    showPreviewButtons: !input.showLoginButton && showPreview,
    showGenerateButton: !input.showLoginButton && !showPreview && showGenerate,
    showLoginButton: input.showLoginButton,
  }
}

/** Exactly one user and nothing to warn about submits at once. */
export function shouldAutoSubmit (userCount: number, alertKey: string): boolean {
  return userCount === 1 && alertKey === ''
}

// The popup check moved to `@/shared/browser/popup` (shared with the phpMyAdmin SSO); re-exported for the existing imports.
export { popupBlocked } from '@/shared/browser/popup'
