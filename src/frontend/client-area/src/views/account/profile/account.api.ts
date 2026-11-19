import { api } from '@/shared/api/client'
import { fetchCsrfCookie } from '@/shared/session/session.api'

export interface ChangePasswordRequest {
  /** Omitted (no key) for the "Set password" variant. */
  current_password?: string
  password: string
  password_confirmation: string
}

export async function changePassword (payload: ChangePasswordRequest): Promise<void> {
  await fetchCsrfCookie()
  await api.put('/user/password', payload)
}

export async function enableTwoFactorAuthentication (): Promise<void> {
  await fetchCsrfCookie()
  await api.post('/user/two-factor-authentication')
}

export async function fetchTwoFactorQrCode (): Promise<{ svg: string }> {
  const { data } = await api.get<{ svg: string }>('/user/two-factor-qr-code')
  return data
}

export async function fetchTwoFactorSecretKey (): Promise<{ secretKey: string }> {
  const { data } = await api.get<{ secretKey: string }>('/user/two-factor-secret-key')
  return data
}

export async function confirmTwoFactorAuthentication (code: string): Promise<void> {
  await fetchCsrfCookie()
  await api.post('/user/confirmed-two-factor-authentication', { code })
}

export interface UpdateUserRequest {
  first_name: string
  last_name: string
  company_name: string
  language: string
  new_device_detection: string
}

export async function updateUser (payload: UpdateUserRequest): Promise<void> {
  await fetchCsrfCookie()
  await api.put('/user/edit', payload)
}

export interface ChangeEmailRequest {
  password: string
  email: string
}

export async function changeEmail (payload: ChangeEmailRequest): Promise<void> {
  await fetchCsrfCookie()
  await api.put('/user/edit/email', payload)
}

export async function disableTwoFactorAuthentication (): Promise<void> {
  await fetchCsrfCookie()
  await api.delete('/user/two-factor-authentication')
}

export interface Device {
  ip_address: string
  /** Null when the User-Agent names no browser; the table prints its own fallback. */
  browser: string | null
  /** Null when the User-Agent names no system; the table prints its own fallback. */
  device: string | null
  last_login: string
  current_device: boolean
  session_id: string | null
  device_id: string | null
  /** Selection falls back to `name` when `device_id` is empty. */
  name?: string
}

export async function fetchDevices (): Promise<Device[]> {
  const { data } = await api.get<{ data: Device[] }>('/user/devices')
  return data.data
}

/** Resolves with the HTTP status: 200 reloads the list, any other 2xx (204 for the current device) signs out. */
export async function forgetDevice (deviceId: string | null): Promise<number> {
  await fetchCsrfCookie()
  const { status } = await api.post('/user/device/forget', { deviceId })
  return status
}

export async function logoutDevice (sessionId: string | null): Promise<number> {
  await fetchCsrfCookie()
  const { status } = await api.post('/user/device/logout', { session_id: sessionId })
  return status
}
