import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { getEmailSettings, sendTestEmail, testEmailConnection, updateEmailSettings } from './email-settings.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}))

const SETTINGS = {
  from_name: 'Acme',
  from_email: 'noreply@acme.test',
  copy_to: '',
  blind_copy_to: '',
  smtp_host: 'smtp.acme.test',
  smtp_port: 587,
  smtp_username: 'user',
  smtp_password: 'secret',
  smtp_ssl_type: 'tls',
}

describe('email-settings.api', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.put).mockReset()
    vi.mocked(api.post).mockReset()
  })

  it('reads the settings from data.data of GET /reseller/email-settings', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: SETTINGS } })

    await expect(getEmailSettings()).resolves.toEqual(SETTINGS)
    expect(api.get).toHaveBeenCalledWith('/reseller/email-settings')
  })

  it('puts the whole settings object', async () => {
    vi.mocked(api.put).mockResolvedValue({})

    await updateEmailSettings(SETTINGS)

    expect(api.put).toHaveBeenCalledWith('/reseller/email-settings', SETTINGS)
  })

  it('posts the settings to test-connection and returns the response body', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: false, message: 'Refused' } })

    await expect(testEmailConnection(SETTINGS)).resolves.toEqual({ success: false, message: 'Refused' })
    expect(api.post).toHaveBeenCalledWith('/reseller/email-settings/test-connection', SETTINGS)
  })

  it('posts the settings with to_email to send-test-email', async () => {
    vi.mocked(api.post).mockResolvedValue({})

    await sendTestEmail(SETTINGS, 'me@acme.test')

    expect(api.post).toHaveBeenCalledWith('/reseller/email-settings/send-test-email', { ...SETTINGS, to_email: 'me@acme.test' })
  })
})
