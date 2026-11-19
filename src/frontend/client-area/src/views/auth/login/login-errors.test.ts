import { describe, expect, it } from 'vitest'
import { loginSubmitErrors, twoFactorErrors } from './login-errors'

function responseError (status: number, data: unknown) {
  return { response: { status, data } }
}

describe('loginSubmitErrors', () => {
  it('uses the message for 429 and strips only the first dot', () => {
    expect(loginSubmitErrors(responseError(429, { message: 'Too many. Try in 5.5 seconds.' }))).toEqual([
      'Too many Try in 5.5 seconds.',
    ])
  })

  it('flattens the error bag and strips only the first dot of each message', () => {
    const error = responseError(422, { errors: { email: ['Bad. creds.'], password: ['Wrong.'] } })
    expect(loginSubmitErrors(error)).toEqual(['Bad creds.', 'Wrong'])
  })

  it('falls back to getErrorMessages when the bag yields no list', () => {
    expect(loginSubmitErrors(responseError(422, { errors: { email: 'Bad.' } }))).toEqual(['Bad.'])
  })

  it('falls back to the generic message without a response', () => {
    expect(loginSubmitErrors(new Error('x'))).toEqual(['Something went wrong. Please try again.'])
  })
})

describe('twoFactorErrors', () => {
  it('uses errors.code for codes up to 6 chars', () => {
    const error = responseError(422, { errors: { code: ['Invalid. code.'] } })
    expect(twoFactorErrors(error, '123456')).toEqual(['Invalid code.'])
  })

  it('uses errors.recovery_code for longer codes', () => {
    const error = responseError(422, { errors: { recovery_code: ['Bad. recovery.'], code: ['no'] } })
    expect(twoFactorErrors(error, 'abcdefg-hijkl')).toEqual(['Bad recovery.'])
  })

  it('uses the message for 429', () => {
    expect(twoFactorErrors(responseError(429, { message: 'Slow. down.' }), '123')).toEqual(['Slow down.'])
  })
})
