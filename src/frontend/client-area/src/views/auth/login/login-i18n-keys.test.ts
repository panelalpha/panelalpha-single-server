import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const loginView = readFileSync(join(here, '../LoginView.vue'), 'utf8')

describe('login/register Phase 2 legacy i18n keys', () => {
  it('uses heading.loginPage.login.title for the login title', () => {
    expect(loginView).toContain(`t('heading.loginPage.login.title')`)
    expect(loginView).not.toContain(`t('login.title')`)
  })

  it('uses heading.loginPage.setPassword.title for set-password', () => {
    expect(loginView).toContain(`t('heading.loginPage.setPassword.title')`)
    expect(loginView).not.toContain(`t('login.setPasswordTitle')`)
  })

  it('uses the legacy confirm-password key and no invented mismatch check', () => {
    expect(loginView).toContain(`t('Confirm Password')`)
    expect(loginView).not.toContain('heading.registerPage.confirmPassword')
    expect(loginView).not.toContain('notification.account.changePassword.error')
  })

  it('takes its rules from the kit useFormRules, not a screen-local module', () => {
    const registerView = readFileSync(join(here, '../RegisterView.vue'), 'utf8')
    expect(loginView).toContain('useFormRules')
    expect(registerView).toContain('useFormRules')
    expect(loginView).not.toContain('login-field-rules')
    expect(registerView).not.toContain('login-field-rules')
  })

  it('forgot-password view uses the legacy keys and the kit useFormRules', () => {
    const forgotView = readFileSync(join(here, '../ForgotPasswordView.vue'), 'utf8')
    expect(forgotView).toContain('useFormRules')
    expect(forgotView).toContain(`t('heading.forgotPasswordPage.title')`)
    expect(forgotView).toContain(`t('button.resetPasswordSend')`)
    expect(forgotView).toContain(`t('message.falseAlert')`)
    expect(forgotView).toContain(`t('button.signIn')`)
    expect(forgotView).not.toContain('login-field-rules')
  })
})
