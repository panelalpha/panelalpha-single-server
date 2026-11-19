import { AxiosError } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { runAcceptInviteFlow, submitInvitePassword } from './accept-invite-flow'

function validationError (message: string, errors: Record<string, string[]>) {
  const error = new AxiosError('Request failed')
  error.response = { status: 422, data: { message, errors } } as AxiosError['response']
  return error
}

describe('runAcceptInviteFlow', () => {
  it('shows the password card on password_required', async () => {
    const navigate = vi.fn()
    const accept = vi.fn().mockResolvedValue({ password_required: true })

    await expect(runAcceptInviteFlow({ accept, navigate, token: 't' })).resolves.toBe('password')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('goes to /login with the token as a query object on login_required', async () => {
    const navigate = vi.fn().mockResolvedValue(undefined)
    const accept = vi.fn().mockResolvedValue({ login_required: true })

    await expect(runAcceptInviteFlow({ accept, navigate, token: 'a&b' })).resolves.toBe('navigated')
    expect(navigate).toHaveBeenCalledExactlyOnceWith({ path: '/login', query: { invite_token: 'a&b' } })
  })

  it.each([{ success: 'true' }, {}])('goes to / on any other body %j', async body => {
    const navigate = vi.fn().mockResolvedValue(undefined)
    const accept = vi.fn().mockResolvedValue(body)

    await expect(runAcceptInviteFlow({ accept, navigate, token: 't' })).resolves.toBe('navigated')
    expect(navigate).toHaveBeenCalledExactlyOnceWith({ path: '/' })
  })

  it('returns error on a rejection and calls accept once', async () => {
    const navigate = vi.fn()
    const accept = vi.fn().mockRejectedValue(validationError('Invalid request', {}))

    await expect(runAcceptInviteFlow({ accept, navigate, token: 'bad' })).resolves.toBe('error')
    expect(accept).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('swallows a rejected navigation', async () => {
    const navigate = vi.fn().mockRejectedValue(new Error('aborted'))
    const accept = vi.fn().mockResolvedValue({ login_required: true })

    await expect(runAcceptInviteFlow({ accept, navigate, token: 't' })).resolves.toBe('navigated')
  })
})

describe('submitInvitePassword', () => {
  it('goes to /login once on success', async () => {
    const navigate = vi.fn().mockResolvedValue(undefined)
    const submit = vi.fn().mockResolvedValue({})

    await expect(submitInvitePassword({ submit, navigate })).resolves.toEqual({ error: null })
    expect(navigate).toHaveBeenCalledExactlyOnceWith({ path: '/login' })
  })

  it('returns the legacy "field: message" text for a 422 field error and does not navigate', async () => {
    const navigate = vi.fn()
    const submit = vi.fn().mockRejectedValue(
      validationError('The password must be at least 8 characters.', {
        password: ['The password must be at least 8 characters.'],
      }),
    )

    const result = await submitInvitePassword({ submit, navigate })

    expect(result.error).toContain('password')
    expect(result.error).toContain('The password must be at least 8 characters.')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('returns a message for a network error', async () => {
    const navigate = vi.fn()
    const submit = vi.fn().mockRejectedValue(new Error('Network Error'))

    const result = await submitInvitePassword({ submit, navigate })

    expect(result.error).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('swallows a rejected navigation', async () => {
    const navigate = vi.fn().mockRejectedValue(new Error('aborted'))
    const submit = vi.fn().mockResolvedValue({})

    await expect(submitInvitePassword({ submit, navigate })).resolves.toEqual({ error: null })
  })
})
