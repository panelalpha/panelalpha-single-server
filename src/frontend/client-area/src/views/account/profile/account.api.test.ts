import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import {
  changeEmail,
  changePassword,
  confirmTwoFactorAuthentication,
  disableTwoFactorAuthentication,
  enableTwoFactorAuthentication,
  fetchDevices,
  forgetDevice,
  logoutDevice,
  updateUser,
} from './account.api'

vi.mock('@/shared/api/client', () => ({
  api: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('@/shared/session/session.api', () => ({
  fetchCsrfCookie: vi.fn().mockResolvedValue(undefined),
}))

describe('account.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('PUTs /user/password', async () => {
    vi.mocked(api.put).mockResolvedValueOnce({ data: {} })
    await changePassword({
      current_password: 'old',
      password: 'newpass12',
      password_confirmation: 'newpass12',
    })
    expect(api.put).toHaveBeenCalledWith('/user/password', {
      current_password: 'old',
      password: 'newpass12',
      password_confirmation: 'newpass12',
    })
  })

  it('sends no current_password key for the set-password variant', async () => {
    vi.mocked(api.put).mockResolvedValueOnce({ data: {} })
    await changePassword({ password: 'newpass12', password_confirmation: 'newpass12' })
    const payload = vi.mocked(api.put).mock.calls[0]![1] as Record<string, unknown>
    expect(payload).toEqual({ password: 'newpass12', password_confirmation: 'newpass12' })
    expect('current_password' in payload).toBe(false)
  })

  it('POSTs enable and confirm 2FA endpoints', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} })
    await enableTwoFactorAuthentication()
    expect(api.post).toHaveBeenCalledWith('/user/two-factor-authentication')
    await confirmTwoFactorAuthentication('123456')
    expect(api.post).toHaveBeenCalledWith('/user/confirmed-two-factor-authentication', { code: '123456' })
  })

  it('PUTs /user/edit and /user/edit/email', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: {} })
    const user = { first_name: 'J', last_name: 'D', company_name: '', language: 'en', new_device_detection: 'ip' }
    await updateUser(user)
    expect(api.put).toHaveBeenCalledWith('/user/edit', user)
    await changeEmail({ password: 'secret1', email: 'a@b.co' })
    expect(api.put).toHaveBeenCalledWith('/user/edit/email', { password: 'secret1', email: 'a@b.co' })
  })

  it('DELETEs the 2FA setup', async () => {
    vi.mocked(api.delete).mockResolvedValueOnce({ data: {} })
    await disableTwoFactorAuthentication()
    expect(api.delete).toHaveBeenCalledWith('/user/two-factor-authentication')
  })

  it('GETs the devices list from data.data', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [{ ip_address: '1.1.1.1' }] } })
    expect(await fetchDevices()).toEqual([{ ip_address: '1.1.1.1' }])
    expect(api.get).toHaveBeenCalledWith('/user/devices')
  })

  it('POSTs forget and logout and resolves with the status', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ status: 204 })
    expect(await forgetDevice('d1')).toBe(204)
    expect(api.post).toHaveBeenCalledWith('/user/device/forget', { deviceId: 'd1' })
    vi.mocked(api.post).mockResolvedValueOnce({ status: 200 })
    expect(await logoutDevice('s1')).toBe(200)
    expect(api.post).toHaveBeenCalledWith('/user/device/logout', { session_id: 's1' })
  })
})
