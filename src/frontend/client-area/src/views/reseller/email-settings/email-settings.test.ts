import { describe, expect, it } from 'vitest'
import {
  connectionTestAlert,
  EMAIL_SETTINGS_FIELDS,
  EMPTY_EMAIL_SETTINGS,
  groupFieldSections,
  SSL_TYPE_OPTIONS,
  toEmailSettingsForm,
} from './email-settings'

describe('email settings fields', () => {
  it('starts with nine empty settings', () => {
    expect(Object.keys(EMPTY_EMAIL_SETTINGS)).toHaveLength(9)
    expect(Object.values(EMPTY_EMAIL_SETTINGS).every(value => value === '')).toBe(true)
  })

  it('lists the nine fields in legacy order', () => {
    expect(EMAIL_SETTINGS_FIELDS.map(item => item.name)).toEqual([
      'from_name', 'from_email', 'copy_to', 'blind_copy_to',
      'smtp_host', 'smtp_port', 'smtp_username', 'smtp_password', 'smtp_ssl_type',
    ])
  })

  it('derives label and placeholder keys from the field', () => {
    const blind = EMAIL_SETTINGS_FIELDS.find(item => item.name === 'blind_copy_to')!
    expect(blind.labelKey).toBe('reseller.emailSettings.blindCopyTo')
    expect(blind.placeholderKey).toBe('reseller.emailSettings.blindCopyTo.placeholder')
  })

  it('uses cols 12 / sm 6 in basic, cols 6 / sm 3 in server and cols 12 for the select', () => {
    for (const item of EMAIL_SETTINGS_FIELDS.filter(candidate => candidate.section === 'basic')) {
      expect([item.cols, item.sm]).toEqual([12, 6])
    }
    for (const item of EMAIL_SETTINGS_FIELDS.filter(candidate => candidate.section === 'server' && candidate.type !== 'select')) {
      expect([item.cols, item.sm]).toEqual([6, 3])
    }
    const select = EMAIL_SETTINGS_FIELDS.find(item => item.type === 'select')!
    expect(select.name).toBe('smtp_ssl_type')
    expect(select.cols).toBe(12)
    expect(select.sm).toBeUndefined()
  })

  it('marks only the password field as password', () => {
    expect(EMAIL_SETTINGS_FIELDS.filter(item => item.type === 'password').map(item => item.name)).toEqual(['smtp_password'])
  })

  it('offers none / SSL / TLS', () => {
    expect(SSL_TYPE_OPTIONS).toEqual([
      { value: 'none', titleKey: 'general.none' },
      { value: 'ssl', title: 'SSL' },
      { value: 'tls', title: 'TLS' },
    ])
  })
})

describe('groupFieldSections', () => {
  it('splits basic into 2+2 rows and server into 4+1 rows', () => {
    const sections = groupFieldSections(EMAIL_SETTINGS_FIELDS)

    expect(sections.basic.rows.map(row => row.map(item => item.name))).toEqual([
      ['from_name', 'from_email'],
      ['copy_to', 'blind_copy_to'],
    ])
    expect(sections.server.rows.map(row => row.map(item => item.name))).toEqual([
      ['smtp_host', 'smtp_port', 'smtp_username', 'smtp_password'],
      ['smtp_ssl_type'],
    ])
  })

  it('returns empty sections for no fields', () => {
    expect(groupFieldSections([])).toEqual({ basic: { rows: [] }, server: { rows: [] } })
  })
})

describe('toEmailSettingsForm', () => {
  it('copies the nine settings and drops anything else', () => {
    const response = {
      from_name: 'Acme',
      from_email: 'a@acme.test',
      copy_to: null,
      blind_copy_to: '',
      smtp_host: 'smtp.acme.test',
      smtp_port: 25,
      smtp_username: 'u',
      smtp_password: 'p',
      smtp_ssl_type: 'ssl',
      extra: 'ignored',
    }

    expect(toEmailSettingsForm(response)).toEqual({
      from_name: 'Acme',
      from_email: 'a@acme.test',
      copy_to: null,
      blind_copy_to: '',
      smtp_host: 'smtp.acme.test',
      smtp_port: 25,
      smtp_username: 'u',
      smtp_password: 'p',
      smtp_ssl_type: 'ssl',
    })
  })
})

describe('connectionTestAlert', () => {
  it('returns a success alert with the given message', () => {
    expect(connectionTestAlert({ success: true }, 'Done')).toEqual({ success: true, successMessage: 'Done' })
  })

  it('returns an error alert with the server message when success is false', () => {
    expect(connectionTestAlert({ success: false, message: 'Auth failed' }, 'Done')).toEqual({
      success: false,
      errorMessage: 'Auth failed',
    })
  })
})
