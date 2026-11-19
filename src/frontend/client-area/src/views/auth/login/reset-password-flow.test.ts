import { describe, expect, it, vi } from 'vitest'
import { submitResetPassword } from './reset-password-flow'

function setup (reset: () => Promise<{ message: string }>, navigate = vi.fn().mockResolvedValue(undefined)) {
  const calls: string[] = []
  const resetFn = vi.fn(reset)
  const addAlert = vi.fn(() => {
    calls.push('alert')
  })
  const navigateFn = vi.fn((to: { path: string }) => {
    calls.push('navigate')
    return navigate(to)
  })
  return { calls, resetFn, addAlert, navigateFn }
}

describe('submitResetPassword', () => {
  it('sends one request, adds the success alert, then navigates to /login', async () => {
    const { calls, resetFn, addAlert, navigateFn } = setup(() => Promise.resolve({ message: 'Your password has been reset!' }))

    await submitResetPassword({ reset: resetFn, addAlert, navigate: navigateFn })

    expect(resetFn).toHaveBeenCalledTimes(1)
    expect(addAlert).toHaveBeenCalledWith({ success: true, successMessage: 'Your password has been reset!' })
    expect(navigateFn).toHaveBeenCalledWith({ path: '/login' })
    expect(calls).toEqual(['alert', 'navigate'])
  })

  it('adds the error alert for errors.email and does not navigate', async () => {
    const error = { response: { status: 422, data: { errors: { email: ['This password reset token is invalid.'] } } } }
    const { resetFn, addAlert, navigateFn } = setup(() => Promise.reject(error))

    await submitResetPassword({ reset: resetFn, addAlert, navigate: navigateFn })

    expect(addAlert).toHaveBeenCalledWith({ success: false, errorMessage: 'This password reset token is invalid.' })
    expect(navigateFn).not.toHaveBeenCalled()
  })

  it('adds the error alert for errors.password and does not navigate', async () => {
    const error = { response: { status: 422, data: { errors: { password: ['The password is too weak.'] } } } }
    const { resetFn, addAlert, navigateFn } = setup(() => Promise.reject(error))

    await submitResetPassword({ reset: resetFn, addAlert, navigate: navigateFn })

    expect(addAlert).toHaveBeenCalledWith({ success: false, errorMessage: 'The password is too weak.' })
    expect(navigateFn).not.toHaveBeenCalled()
  })

  it.each([
    ['429', { response: { status: 429, data: { message: 'Slow down.' } } }],
    ['500', { response: { status: 500, data: null } }],
    ['network', new Error('Network Error')],
  ])('stays silent and resolves on a %s failure', async (_name, error) => {
    const { resetFn, addAlert, navigateFn } = setup(() => Promise.reject(error))

    await expect(submitResetPassword({ reset: resetFn, addAlert, navigate: navigateFn })).resolves.toBeUndefined()

    expect(addAlert).not.toHaveBeenCalled()
    expect(navigateFn).not.toHaveBeenCalled()
  })

  it('swallows a rejected navigation', async () => {
    const { resetFn, addAlert, navigateFn } = setup(
      () => Promise.resolve({ message: 'ok' }),
      vi.fn().mockRejectedValue(new Error('NavigationDuplicated')),
    )

    await expect(submitResetPassword({ reset: resetFn, addAlert, navigate: navigateFn })).resolves.toBeUndefined()

    expect(addAlert).toHaveBeenCalledTimes(1)
  })
})
