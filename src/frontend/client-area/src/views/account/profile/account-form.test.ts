import { describe, expect, it } from 'vitest'
import {
  buildPersonalInformation,
  DEVICE_DETECTION_OPTIONS,
  findOption,
  formValueFromUser,
  languageOptions,
} from './account-form'

const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key)

describe('account-form', () => {
  it('builds language options from home.app.languages', () => {
    expect(languageOptions({ languages: ['en', 'pl'] })).toEqual([
      { text: 'languages.en', value: 'en' },
      { text: 'languages.pl', value: 'pl' },
    ])
    expect(languageOptions(undefined)).toEqual([])
  })

  it('has the seven device detection options in legacy order', () => {
    expect(DEVICE_DETECTION_OPTIONS.map(option => option.value)).toEqual([
      'ip, device, browser', 'ip, device', 'ip, browser', 'device, browser', 'ip', 'device', 'browser',
    ])
  })

  it('requires the names and limits them to 20 characters', () => {
    const [first] = buildPersonalInformation(t, [])
    const [required, max] = first!.rules!

    expect(required!('')).toContain('form.validation.required')
    expect(required!('Jane')).toBe(true)
    expect(max!('a'.repeat(20))).toBe(true)
    expect(max!('a'.repeat(21))).toContain('form.validation.maxLength')
    expect(max!('a'.repeat(21))).toContain('"length":20')
  })

  it('has no rules on the company name', () => {
    const fields = buildPersonalInformation(t, [])

    expect(fields.map(field => field.name)).toEqual(['first_name', 'last_name', 'company_name', 'language'])
    expect(fields[2]!.rules).toBeUndefined()
  })

  it('reads the form value from the /home user, with empty strings for missing fields', () => {
    expect(formValueFromUser({
      first_name: 'Jane', last_name: 'Doe', company_name: 'ACME', language: 'pl', new_device_detection: 'ip',
    })).toEqual({
      first_name: 'Jane', last_name: 'Doe', company_name: 'ACME', language: 'pl', new_device_detection: 'ip',
    })
    expect(formValueFromUser(undefined).first_name).toBe('')
  })

  it('finds the option of a value, or null', () => {
    const options = [{ text: 'a', value: 'x' }]

    expect(findOption(options, 'x')).toBe(options[0])
    expect(findOption(options, 'y')).toBeNull()
  })
})
