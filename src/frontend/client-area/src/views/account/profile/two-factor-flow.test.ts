import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as sessionApi from '@/shared/session/session.api'
import * as api from './account.api'
import { activateTwoFactor, deactivateTwoFactor, fetchTwoFactorSetup, useTwoFactorFlow } from './two-factor-flow'

vi.mock('./account.api', () => ({
  confirmTwoFactorAuthentication: vi.fn(),
  disableTwoFactorAuthentication: vi.fn(),
  enableTwoFactorAuthentication: vi.fn(),
  fetchTwoFactorQrCode: vi.fn(),
  fetchTwoFactorSecretKey: vi.fn(),
}))

vi.mock('@/shared/session/session.api', () => ({
  fetchTwoFactorRecoveryCodes: vi.fn(),
}))

const t = (key: string) => key
const failure = (message: string) => ({ response: { data: { message } } })

function alerts () {
  return { alert: vi.fn(), t }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('fetchTwoFactorSetup', () => {
  it('calls enable, then the QR code, then the secret key', async () => {
    const order: string[] = []
    vi.mocked(api.enableTwoFactorAuthentication).mockImplementation(async () => {
      order.push('enable')
    })
    vi.mocked(api.fetchTwoFactorQrCode).mockImplementation(async () => {
      order.push('qr')
      return { svg: '<svg/>' }
    })
    vi.mocked(api.fetchTwoFactorSecretKey).mockImplementation(async () => {
      order.push('secret')
      return { secretKey: 'KEY' }
    })

    expect(await fetchTwoFactorSetup()).toEqual({ svg: '<svg/>', secretKey: 'KEY' })
    expect(order).toEqual(['enable', 'qr', 'secret'])
  })

  it('stops at the first failing call', async () => {
    vi.mocked(api.enableTwoFactorAuthentication).mockRejectedValue(failure('no'))

    await expect(fetchTwoFactorSetup()).rejects.toBeDefined()
    expect(api.fetchTwoFactorQrCode).not.toHaveBeenCalled()
  })
})

describe('activateTwoFactor', () => {
  it('confirms, loads the recovery codes, alerts and reports the change', async () => {
    vi.mocked(api.confirmTwoFactorAuthentication).mockResolvedValue()
    vi.mocked(sessionApi.fetchTwoFactorRecoveryCodes).mockResolvedValue(['ABCD-EFGH'])
    const deps = alerts()
    const onChanged = vi.fn()

    expect(await activateTwoFactor('123456', deps, onChanged)).toEqual({ confirmed: true, codes: ['ABCD-EFGH'] })
    expect(api.confirmTwoFactorAuthentication).toHaveBeenCalledWith('123456')
    expect(deps.alert).toHaveBeenCalledWith({ success: true, successMessage: 'notification.account.2fa.success' })
    expect(onChanged).toHaveBeenCalledWith(true)
  })

  it('alerts the fixed 2fa.error copy when the code is rejected', async () => {
    vi.mocked(api.confirmTwoFactorAuthentication).mockRejectedValue(failure('bad code'))
    const deps = alerts()
    const onChanged = vi.fn()

    expect(await activateTwoFactor('000000', deps, onChanged)).toEqual({ confirmed: false, codes: null })
    expect(deps.alert).toHaveBeenCalledWith({ success: false, errorMessage: 'notification.account.2fa.error' })
    expect(onChanged).toHaveBeenCalledWith(false)
    expect(sessionApi.fetchTwoFactorRecoveryCodes).not.toHaveBeenCalled()
  })

  it('alerts the response message when the recovery codes fail', async () => {
    vi.mocked(api.confirmTwoFactorAuthentication).mockResolvedValue()
    vi.mocked(sessionApi.fetchTwoFactorRecoveryCodes).mockRejectedValue(failure('codes failed'))
    const deps = alerts()
    const onChanged = vi.fn()

    // The code was confirmed (2FA is on now) but no code arrived: the dialog must not pretend a placeholder is one.
    expect(await activateTwoFactor('123456', deps, onChanged)).toEqual({ confirmed: true, codes: null })
    expect(deps.alert).toHaveBeenCalledWith({ success: false, errorMessage: 'codes failed' })
    expect(onChanged).toHaveBeenCalledWith(false)
  })
})

describe('deactivateTwoFactor', () => {
  it('alerts success or the response message', async () => {
    vi.mocked(api.disableTwoFactorAuthentication).mockResolvedValueOnce()
    const ok = alerts()
    expect(await deactivateTwoFactor(ok)).toBe(true)
    expect(ok.alert).toHaveBeenCalledWith({ success: true, successMessage: 'notification.account.disable2fa.success' })

    vi.mocked(api.disableTwoFactorAuthentication).mockRejectedValueOnce(failure('nope'))
    const bad = alerts()
    expect(await deactivateTwoFactor(bad)).toBe(false)
    expect(bad.alert).toHaveBeenCalledWith({ success: false, errorMessage: 'nope' })
  })
})

describe('useTwoFactorFlow', () => {
  function flow () {
    const deps = {
      ...alerts(),
      reload: vi.fn(async () => undefined),
      patchUser: vi.fn(),
      passwordGenerated: vi.fn(() => false),
      onPasswordRequired: vi.fn(),
    }
    return { deps, ...useTwoFactorFlow(deps) }
  }

  function mockSetup () {
    vi.mocked(api.enableTwoFactorAuthentication).mockResolvedValue()
    vi.mocked(api.fetchTwoFactorQrCode).mockResolvedValue({ svg: '<svg/>' })
    vi.mocked(api.fetchTwoFactorSecretKey).mockResolvedValue({ secretKey: 'KEY' })
  }

  it('toggling an OFF switch runs the chain and opens the modal', async () => {
    mockSetup()
    const state = flow()

    state.toggleTwoFactorAuth()
    expect(state.loading.value).toBe(true)
    await vi.waitFor(() => expect(state.isOpenTwoFactorAuthModal.value).toBe(true))

    expect(state.loading.value).toBe(false)
    expect(state.codeQr.value).toBe('<svg/>')
    expect(state.secretKey.value).toBe('KEY')
  })

  it('toggling an ON switch opens the disable confirmation', () => {
    const state = flow()
    state.enabled.value = true

    state.toggleTwoFactorAuth()

    expect(state.isOpenTwoFactorDisableConfirmationModal.value).toBe(true)
    expect(api.enableTwoFactorAuthentication).not.toHaveBeenCalled()
  })

  it('resets loading and alerts the message on a failing step (deviation)', async () => {
    vi.mocked(api.enableTwoFactorAuthentication).mockResolvedValue()
    vi.mocked(api.fetchTwoFactorQrCode).mockRejectedValue(failure('qr failed'))
    const state = flow()

    await state.enableTwoFactorAuth()

    expect(state.loading.value).toBe(false)
    expect(state.isOpenTwoFactorAuthModal.value).toBe(false)
    expect(state.deps.alert).toHaveBeenCalledWith({ success: false, errorMessage: 'qr failed' })
    expect(api.fetchTwoFactorSecretKey).not.toHaveBeenCalled()
  })

  it('423 with a generated password alerts setPasswordFirst, then opens the password modal', async () => {
    vi.mocked(api.enableTwoFactorAuthentication).mockRejectedValue({ response: { status: 423, data: { message: 'Locked' } } })
    const state = flow()
    state.deps.passwordGenerated.mockReturnValue(true)
    const order: string[] = []
    state.deps.alert.mockImplementation(() => order.push('alert'))
    state.deps.onPasswordRequired.mockImplementation(() => order.push('modal'))

    await state.enableTwoFactorAuth()

    expect(state.deps.alert).toHaveBeenCalledWith({ success: false, errorMessage: 'notification.account.2fa.setPasswordFirst' })
    expect(order).toEqual(['alert', 'modal'])
    expect(state.loading.value).toBe(false)
    expect(state.isOpenTwoFactorAuthModal.value).toBe(false)
  })

  it('423 without a generated password alerts the response message', async () => {
    vi.mocked(api.enableTwoFactorAuthentication).mockRejectedValue({ response: { status: 423, data: { message: 'Locked' } } })
    const state = flow()

    await state.enableTwoFactorAuth()

    expect(state.deps.alert).toHaveBeenCalledWith({ success: false, errorMessage: 'Locked' })
    expect(state.deps.onPasswordRequired).not.toHaveBeenCalled()
  })

  it('another error with a generated password alerts the response message', async () => {
    vi.mocked(api.enableTwoFactorAuthentication).mockRejectedValue({ response: { status: 500, data: { message: 'Boom' } } })
    const state = flow()
    state.deps.passwordGenerated.mockReturnValue(true)

    await state.enableTwoFactorAuth()

    expect(state.deps.alert).toHaveBeenCalledWith({ success: false, errorMessage: 'Boom' })
    expect(state.deps.onPasswordRequired).not.toHaveBeenCalled()
  })

  it('closing without a confirmed code turns the switch OFF, reloads and syncs the user', async () => {
    mockSetup()
    const state = flow()
    state.enabled.value = true
    await state.enableTwoFactorAuth()

    await state.closeTwoFactorAuthModal()

    expect(state.enabled.value).toBe(false)
    expect(state.isOpenTwoFactorAuthModal.value).toBe(false)
    expect(state.deps.reload).toHaveBeenCalledTimes(1)
    expect(state.deps.patchUser).toHaveBeenCalledWith({ two_factor_auth_enabled: false })
  })

  it('closing after a confirmed code keeps the switch as the reload left it', async () => {
    mockSetup()
    const state = flow()
    state.deps.reload.mockImplementation(async () => {
      state.enabled.value = true
    })
    await state.enableTwoFactorAuth()
    state.change2fa(true)

    await state.closeTwoFactorAuthModal()

    expect(state.enabled.value).toBe(true)
    expect(state.deps.patchUser).toHaveBeenCalledWith({ two_factor_auth_enabled: true })
  })

  it('turns the switch ON as soon as the code is confirmed', () => {
    const state = flow()

    state.change2fa(true)

    expect(state.enabled.value).toBe(true)
  })

  it('closes and reloads when the dialog shell closed it first (Esc, a click outside)', async () => {
    mockSetup()
    const state = flow()
    await state.enableTwoFactorAuth()
    state.change2fa(true)

    // `AppDialog` writes the v-model before it emits `close`.
    state.isOpenTwoFactorAuthModal.value = false
    await state.closeTwoFactorAuthModal()

    expect(state.enabled.value).toBe(true)
    expect(state.deps.reload).toHaveBeenCalledTimes(1)
    expect(state.deps.patchUser).toHaveBeenCalledWith({ two_factor_auth_enabled: true })
  })

  it('closes the disable dialog from the shell and reloads once', async () => {
    const state = flow()
    state.enabled.value = true
    state.toggleTwoFactorAuth()

    state.isOpenTwoFactorDisableConfirmationModal.value = false
    await state.closeTwoFactorAuthConfirmDisableModal()
    await state.closeTwoFactorAuthConfirmDisableModal()

    expect(state.deps.reload).toHaveBeenCalledTimes(1)
  })

  it('closes once: a second close (X then outside click) does nothing', async () => {
    mockSetup()
    const state = flow()
    await state.enableTwoFactorAuth()

    await state.closeTwoFactorAuthModal()
    await state.closeTwoFactorAuthModal()

    expect(state.deps.reload).toHaveBeenCalledTimes(1)
  })

  it('a disable success patches the user OFF, closes and reloads', async () => {
    const state = flow()
    state.enabled.value = true
    state.toggleTwoFactorAuth()

    await state.onTwoFactorDisabled()

    expect(state.enabled.value).toBe(false)
    expect(state.deps.patchUser).toHaveBeenCalledWith({ two_factor_auth_enabled: false })
    expect(state.isOpenTwoFactorDisableConfirmationModal.value).toBe(false)
    expect(state.deps.reload).toHaveBeenCalledTimes(1)
  })

  it('a failing reload leaves the switch alone', async () => {
    mockSetup()
    const state = flow()
    state.deps.reload.mockRejectedValue(new Error('offline'))
    await state.enableTwoFactorAuth()

    await expect(state.closeTwoFactorAuthModal()).resolves.toBeUndefined()
    expect(state.deps.patchUser).not.toHaveBeenCalled()
  })
})
