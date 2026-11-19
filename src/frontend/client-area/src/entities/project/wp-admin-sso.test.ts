import { describe, expect, it } from 'vitest'
import { popupBlocked, shouldAutoSubmit, type SsoStateInput, ssoView, toAppSsoOptions, toSsoOptions } from './wp-admin-sso'

const base: SsoStateInput = {
  userCount: 2,
  dnsMismatch: false,
  singleServer: false,
  previewProviderEnabled: false,
  submitting: false,
  checkingDns: false,
  submitSuccess: false,
  showLoginButton: false,
}

describe('toSsoOptions', () => {
  it('labels a user `display_name - email`, the e-mail from user_email then email', () => {
    expect(toSsoOptions([
      { id: 1, display_name: 'Ann', user_email: 'ann@example.com' },
      { id: 2, display_name: 'Bob', email: 'bob@example.com' },
      { id: 3, display_name: 'Cy' },
    ])).toEqual([
      { label: 'Ann - ann@example.com', value: 1 },
      { label: 'Bob - bob@example.com', value: 2 },
      { label: 'Cy - ', value: 3 },
    ])
  })
})

describe('toAppSsoOptions', () => {
  it('labels a user `email ?? username ?? id`', () => {
    expect(toAppSsoOptions([
      { id: 1, email: 'ann@example.com', username: 'ann' },
      { id: 2, email: null, username: 'bob' },
      { id: 3, email: null, username: null },
    ])).toEqual([
      { label: 'ann@example.com', value: 1 },
      { label: 'bob', value: 2 },
      { label: '3', value: 3 },
    ])
  })
})

describe('ssoView', () => {
  it('shows the user select and the generate button for many users', () => {
    const view = ssoView(base)
    expect(view.showUserSelect).toBe(true)
    expect(view.showGenerateButton).toBe(true)
    expect(view.showPreviewButtons).toBe(false)
    expect(view.alertKey).toBe('')
  })

  it('has neither select nor button for one user whose DNS is fine', () => {
    const view = ssoView({ ...base, userCount: 1 })
    expect(view.showUserSelect).toBe(false)
    expect(view.showGenerateButton).toBe(false)
    expect(view.showPreviewButtons).toBe(false)
  })

  it('warns about a DNS mismatch and offers one generate button for one user', () => {
    const view = ssoView({ ...base, userCount: 1, dnsMismatch: true })
    expect(view.alertKey).toBe('notification.instance.modal.ssoLogin.dnsMismatchDetected')
    expect(view.showGenerateButton).toBe(true)
    expect(view.showPreviewButtons).toBe(false)
  })

  it('offers the temporary URL next to the direct login on a mismatch with the preview provider', () => {
    const view = ssoView({ ...base, dnsMismatch: true, previewProviderEnabled: true })
    expect(view.showPreviewButtons).toBe(true)
    expect(view.showGenerateButton).toBe(false)
  })

  it('offers the temporary URL on a mismatch under single server', () => {
    expect(ssoView({ ...base, dnsMismatch: true, singleServer: true }).showPreviewButtons).toBe(true)
  })

  it('does not offer the temporary URL without a mismatch', () => {
    expect(ssoView({ ...base, previewProviderEnabled: true, singleServer: true }).showPreviewButtons).toBe(false)
  })

  it('shows the lite noUsers warning and no button without users (E9)', () => {
    const view = ssoView({ ...base, userCount: 0 })
    expect(view.alertKey).toBe('notification.instance.modal.ssoLogin.noUsers')
    expect(view.showGenerateButton).toBe(false)
    expect(view.showPreviewButtons).toBe(false)
    expect(view.showUserSelect).toBe(false)
  })

  it('has no buttons without users even on a mismatch with the preview provider, and the mismatch alert wins', () => {
    const view = ssoView({ ...base, userCount: 0, dnsMismatch: true, previewProviderEnabled: true })
    expect(view.showPreviewButtons).toBe(false)
    expect(view.showGenerateButton).toBe(false)
    expect(view.alertKey).toBe('notification.instance.modal.ssoLogin.dnsMismatchDetected')
  })

  it('shows the single-login message while submitting or checking DNS, and the success text afterwards', () => {
    expect(ssoView({ ...base, submitting: true }).messageKey).toBe('heading.instance.ssoSingleLogin.message')
    expect(ssoView({ ...base, checkingDns: true }).messageKey).toBe('heading.instance.ssoSingleLogin.message')
    expect(ssoView({ ...base, submitSuccess: true }).messageKey).toBe('notification.instance.modal.ssoLogin.success')
    expect(ssoView(base).messageKey).toBe('')
  })

  it('swaps the generate buttons for the login button once the popup was blocked', () => {
    const view = ssoView({ ...base, dnsMismatch: true, previewProviderEnabled: true, showLoginButton: true })
    expect(view.showLoginButton).toBe(true)
    expect(view.showPreviewButtons).toBe(false)
    expect(view.showGenerateButton).toBe(false)
  })
})

describe('shouldAutoSubmit', () => {
  it('submits at once for exactly one user and no warning', () => {
    expect(shouldAutoSubmit(1, '')).toBe(true)
  })

  it('does not for 0 or many users, or with a warning', () => {
    expect(shouldAutoSubmit(0, 'x')).toBe(false)
    expect(shouldAutoSubmit(2, '')).toBe(false)
    expect(shouldAutoSubmit(1, 'notification.instance.modal.ssoLogin.dnsMismatchDetected')).toBe(false)
  })
})

describe('popupBlocked', () => {
  it('is blocked for no window or a closed one', () => {
    expect(popupBlocked(null)).toBe(true)
    expect(popupBlocked({ closed: true } as Window)).toBe(true)
    expect(popupBlocked({} as Window)).toBe(true)
  })

  it('is not blocked for an open window', () => {
    expect(popupBlocked({ closed: false } as Window)).toBe(false)
  })
})
