import { describe, expect, it } from 'vitest'
import { resolveForgotPasswordAlert } from './forgot-password-outcome'

describe('resolveForgotPasswordAlert', () => {
  it('turns a 200 into the success alert with the response message', () => {
    expect(resolveForgotPasswordAlert({ ok: true, data: { message: 'If an account exists for that e-mail address, we have sent it a link to reset the password.' } })).toEqual({
      success: true,
      successMessage: 'If an account exists for that e-mail address, we have sent it a link to reset the password.',
    })
  })

  it('turns a 422 with errors.email into the error alert with the first message', () => {
    const error = { response: { status: 422, data: { message: 'The given data was invalid.', errors: { email: ['The email field must be a valid email address.', 'Second.'] } } } }
    expect(resolveForgotPasswordAlert({ ok: false, error })).toEqual({ success: false, errorMessage: 'The email field must be a valid email address.' })
  })

  it('turns the route\'s 429 into the error alert with the server\'s message', () => {
    const error = { response: { status: 429, data: { message: 'Too Many Attempts.' } } }
    expect(resolveForgotPasswordAlert({ ok: false, error })).toEqual({ success: false, errorMessage: 'Too Many Attempts.' })
  })

  it('shows nothing for any other failure and never throws', () => {
    const errors: unknown[] = [
      { response: { status: 422, data: { message: 'Invalid.', errors: {} } } },
      { response: { status: 422, data: { errors: { email: [] } } } },
      { response: { status: 422, data: { errors: { email: [42] } } } },
      { response: { status: 422, data: { errors: { email: 'No user.' } } } },
      { response: { status: 429 } },
      { response: { status: 429, data: null } },
      { response: { status: 429, data: { message: ' '.repeat(3) } } },
      { response: { status: 429, data: { message: 42 } } },
      { response: { status: 419, data: { message: 'CSRF token mismatch.' } } },
      { response: { status: 500, data: null } },
      { response: { status: 500 } },
      { response: null },
      new Error('Network Error'),
      undefined,
      null,
      'boom',
      42,
    ]
    for (const error of errors) {
      expect(() => resolveForgotPasswordAlert({ ok: false, error })).not.toThrow()
      expect(resolveForgotPasswordAlert({ ok: false, error })).toBeNull()
    }
  })
})
