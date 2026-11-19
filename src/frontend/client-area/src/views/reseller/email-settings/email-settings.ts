import type { ConnectionTestResponse, ResellerEmailSettings } from './email-settings.api'
import type { AlertPayload } from '@/shared/alerts/alerts.store'

// The form data and computed values of the settings page, without the DOM.

export type EmailSettingsFieldName = keyof ResellerEmailSettings
export type EmailSettingsSection = 'basic' | 'server'

export interface EmailSettingsField {
  name: EmailSettingsFieldName
  labelKey: string
  placeholderKey: string
  section: EmailSettingsSection
  newRow?: boolean
  cols: number
  sm?: number
  type?: 'password' | 'select'
}

export interface SslTypeOption {
  value: string
  titleKey?: string
  title?: string
}

export interface EmailSettingsSections {
  basic: { rows: EmailSettingsField[][] }
  server: { rows: EmailSettingsField[][] }
}

/** The form starts with every field empty. */
export const EMPTY_EMAIL_SETTINGS: ResellerEmailSettings = {
  from_name: '',
  from_email: '',
  copy_to: '',
  blind_copy_to: '',
  smtp_host: '',
  smtp_port: '',
  smtp_username: '',
  smtp_password: '',
  smtp_ssl_type: '',
}

function field (
  name: EmailSettingsFieldName,
  i18nKey: string,
  layout: Omit<EmailSettingsField, 'name' | 'labelKey' | 'placeholderKey'>,
): EmailSettingsField {
  return {
    name,
    labelKey: `reseller.emailSettings.${i18nKey}`,
    placeholderKey: `reseller.emailSettings.${i18nKey}.placeholder`,
    ...layout,
  }
}

/** Same order as legacy. Keys instead of translated labels: the view translates them, so they follow a language change. */
export const EMAIL_SETTINGS_FIELDS: EmailSettingsField[] = [
  field('from_name', 'fromName', { section: 'basic', newRow: true, cols: 12, sm: 6 }),
  field('from_email', 'fromEmail', { section: 'basic', cols: 12, sm: 6 }),
  field('copy_to', 'copyTo', { section: 'basic', newRow: true, cols: 12, sm: 6 }),
  field('blind_copy_to', 'blindCopyTo', { section: 'basic', cols: 12, sm: 6 }),
  field('smtp_host', 'smtpHost', { section: 'server', newRow: true, cols: 6, sm: 3 }),
  field('smtp_port', 'smtpPort', { section: 'server', cols: 6, sm: 3 }),
  field('smtp_username', 'smtpUsername', { section: 'server', cols: 6, sm: 3 }),
  field('smtp_password', 'smtpPassword', { section: 'server', cols: 6, sm: 3, type: 'password' }),
  field('smtp_ssl_type', 'smtpSslType', { section: 'server', newRow: true, cols: 12, type: 'select' }),
]

/** `SSL` and `TLS` are protocol names, not copy (literals in legacy too). */
export const SSL_TYPE_OPTIONS: SslTypeOption[] = [
  { value: 'none', titleKey: 'general.none' },
  { value: 'ssl', title: 'SSL' },
  { value: 'tls', title: 'TLS' },
]

/** Fields of each section grouped into rows, a new row starts at every `newRow` field. */
export function groupFieldSections (fields: EmailSettingsField[]): EmailSettingsSections {
  const sections: EmailSettingsSections = { basic: { rows: [] }, server: { rows: [] } }

  for (const sectionKey of Object.keys(sections) as EmailSettingsSection[]) {
    let currentRow: EmailSettingsField[] = []
    for (const item of fields.filter(candidate => candidate.section === sectionKey)) {
      if (item.newRow && currentRow.length > 0) {
        sections[sectionKey].rows.push(currentRow)
        currentRow = []
      }
      currentRow.push(item)
    }
    if (currentRow.length > 0) {
      sections[sectionKey].rows.push(currentRow)
    }
  }

  return sections
}

/** Copies exactly the nine settings from the GET response. */
export function toEmailSettingsForm (response: ResellerEmailSettings): ResellerEmailSettings {
  return {
    from_name: response.from_name,
    from_email: response.from_email,
    copy_to: response.copy_to,
    blind_copy_to: response.blind_copy_to,
    smtp_host: response.smtp_host,
    smtp_port: response.smtp_port,
    smtp_username: response.smtp_username,
    smtp_password: response.smtp_password,
    smtp_ssl_type: response.smtp_ssl_type,
  }
}

/** HTTP 200 with `success: false` is an error alert carrying the server message. */
export function connectionTestAlert (response: ConnectionTestResponse, successMessage: string): AlertPayload {
  if (response.success) {
    return { success: true, successMessage }
  }
  return { success: false, errorMessage: response.message }
}
