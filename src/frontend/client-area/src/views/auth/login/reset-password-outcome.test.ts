import { describe, expect, it } from 'vitest'
import { resolveResetPasswordAlert } from './reset-password-outcome'

const failure = (errors: unknown) => ({ ok: false as const, error: { response: { status: 422, data: { errors } } } })

describe('resolveResetPasswordAlert', () => {
  it('turns a 200 into the success alert with the response message', () => {
    expect(resolveResetPasswordAlert({ ok: true, data: { message: 'Your password has been reset!' } })).toEqual({
      success: true,
      successMessage: 'Your password has been reset!',
    })
  })

  it('shows errors.email[0] as the error alert', () => {
    expect(resolveResetPasswordAlert(failure({ email: ['This password reset token is invalid.', 'Second.'] }))).toEqual({
      success: false,
      errorMessage: 'This password reset token is invalid.',
    })
  })

  it('shows errors.password[0] when there is no errors.email (deviation from legacy)', () => {
    expect(resolveResetPasswordAlert(failure({ password: ['The password confirmation does not match.'] }))).toEqual({
      success: false,
      errorMessage: 'The password confirmation does not match.',
    })
  })

  it('prefers errors.email over errors.password', () => {
    expect(resolveResetPasswordAlert(failure({ email: ['Bad token.'], password: ['Weak.'] }))).toEqual({
      success: false,
      errorMessage: 'Bad token.',
    })
  })

  it('falls back to errors.password when errors.email holds no string', () => {
    expect(resolveResetPasswordAlert(failure({ email: [], password: ['Weak.'] }))).toEqual({
      success: false,
      errorMessage: 'Weak.',
    })
  })

  it('shows nothing for any other failure and never throws', () => {
    const errors: unknown[] = [
      { response: { status: 422, data: { message: 'Invalid.', errors: {} } } },
      { response: { status: 422, data: { errors: { email: [], password: [] } } } },
      { response: { status: 422, data: { errors: { email: [42], password: [null] } } } },
      { response: { status: 422, data: { errors: { password: 'Weak.' } } } },
      { response: { status: 429, data: { message: 'Please wait before retrying.' } } },
      { response: { status: 500, data: null } },
      { response: null },
      new Error('Network Error'),
      undefined,
      null,
      'boom',
    ]
    for (const error of errors) {
      expect(() => resolveResetPasswordAlert({ ok: false, error })).not.toThrow()
      expect(resolveResetPasswordAlert({ ok: false, error })).toBeNull()
    }
  })
})
