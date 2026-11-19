import { api } from '@/shared/api/client'

// Legacy calls `Api` inline; the contract is taken from that code, so the types are tolerant.

export interface ResellerEmailSettings {
  from_name: string | null
  from_email: string | null
  copy_to: string | null
  blind_copy_to: string | null
  smtp_host: string | null
  smtp_port: string | number | null
  smtp_username: string | null
  smtp_password: string | null
  smtp_ssl_type: string | null
}

export interface ConnectionTestResponse {
  success: boolean
  message?: string
}

/** `GET /reseller/email-settings`: the settings are under `data.data`. */
export async function getEmailSettings (): Promise<ResellerEmailSettings> {
  const { data } = await api.get<{ data: ResellerEmailSettings }>('/reseller/email-settings')
  return data.data
}

/** `PUT /reseller/email-settings` with the whole settings object. */
export async function updateEmailSettings (settings: ResellerEmailSettings): Promise<void> {
  await api.put('/reseller/email-settings', settings)
}

/** `POST /reseller/email-settings/test-connection` with the current settings; the response body is returned as is. */
export async function testEmailConnection (settings: ResellerEmailSettings): Promise<ConnectionTestResponse> {
  const { data } = await api.post<ConnectionTestResponse>('/reseller/email-settings/test-connection', settings)
  return data
}

/** `POST /reseller/email-settings/send-test-email` with the settings plus `to_email`. */
export async function sendTestEmail (settings: ResellerEmailSettings, toEmail: string): Promise<void> {
  await api.post('/reseller/email-settings/send-test-email', { ...settings, to_email: toEmail })
}
