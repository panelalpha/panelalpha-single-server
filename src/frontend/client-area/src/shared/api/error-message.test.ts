import { AxiosError } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { useSessionStore } from '@/shared/session/session.store'
import { getErrorCode, getErrorMessage, getErrorMessages, isApiError } from './error-message'

function responseError (data: unknown, status = 422) {
  return { response: { status, data } }
}

describe('getErrorMessages', () => {
  it('returns the generic message when there is no response', () => {
    expect(getErrorMessages(new Error('Network Error'))).toEqual([
      'Something went wrong. Please try again.',
    ])
    expect(getErrorMessages(undefined)).toEqual(['Something went wrong. Please try again.'])
  })

  it('lists the messages of the error bag without a field-name prefix (ID-48; legacy wrote `email: …`)', () => {
    const error = responseError({ errors: { email: ['Invalid email.', 'Taken.'], password: ['Too short.'] } })
    expect(getErrorMessages(error)).toEqual([
      'Invalid email.',
      'Taken.',
      'Too short.',
    ])
  })

  it('does not prefix numeric keys and keeps dots', () => {
    const error = responseError({ errors: [['First.'], ['Second.']] })
    expect(getErrorMessages(error)).toEqual(['First.', 'Second.'])
  })

  it('falls back to the error string when the response body is not JSON (e.g. a proxy HTML 502 page)', () => {
    const error = Object.assign(new Error('Request failed with status code 502'), {
      response: { status: 502, data: '<html><body>502 Bad Gateway</body></html>' },
    })
    expect(getErrorMessages(error)).toEqual(['Error: Request failed with status code 502'])
  })

  it('uses the message field when there is no error bag', () => {
    expect(getErrorMessages(responseError({ message: 'Too many attempts.' }, 429))).toEqual([
      'Too many attempts.',
    ])
  })

  it('uses the error field when there is no message', () => {
    expect(getErrorMessages(responseError({ error: 'Forbidden' }, 403))).toEqual(['Forbidden'])
  })

  it('falls back to the error itself for an unknown shape', () => {
    const error = responseError({})
    expect(getErrorMessages(error)).toEqual([String(error)])
  })
})

describe('getErrorMessage', () => {
  it('joins messages with a space', () => {
    const error = responseError({ errors: { email: ['A.'], name: ['B.'] } })
    expect(getErrorMessage(error)).toBe('A. B.')
  })
})

describe('getErrorCode', () => {
  it('returns the error_code of the response body', () => {
    expect(getErrorCode(responseError({ error_code: 'git_working_tree_dirty', message: 'Dirty.' }))).toBe('git_working_tree_dirty')
  })

  it('returns undefined when there is no response (network error)', () => {
    expect(getErrorCode(new Error('Network Error'))).toBeUndefined()
    expect(getErrorCode(undefined)).toBeUndefined()
  })

  it('returns undefined when the body carries no error_code', () => {
    expect(getErrorCode(responseError({ message: 'Too many attempts.' }, 429))).toBeUndefined()
  })
})

describe('getErrorMessages under app-lite single server', () => {
  function home (active: boolean) {
    setActivePinia(createPinia())
    useSessionStore().hydrateHome({ app: { single_server: { active } }, user: {} } as never)
  }

  it('rebrands instance copy to project copy (LITE/apis/Api.js:94-96)', () => {
    home(true)
    const error = responseError({ message: 'Instance limit reached for your instances.' })
    expect(getErrorMessages(error)).toEqual(['Project limit reached for your projects.'])
    expect(getErrorMessage(responseError({ errors: { name: ['The instance name is taken.'] } }))).toBe('The project name is taken.')
  })

  it('leaves the copy as it is on multi server', () => {
    home(false)
    expect(getErrorMessages(responseError({ message: 'Instance limit reached.' }))).toEqual(['Instance limit reached.'])
  })
})

describe('isApiError', () => {
  it('accepts an object flagged isAxiosError and a real AxiosError', () => {
    expect(isApiError({ isAxiosError: true, response: { status: 422 } })).toBe(true)
    expect(isApiError(new AxiosError('boom'))).toBe(true)
  })

  it('rejects everything else', () => {
    for (const value of [new Error('x'), null, undefined, 'error', 42, {}, { isAxiosError: 'true' }]) {
      expect(isApiError(value)).toBe(false)
    }
  })
})
