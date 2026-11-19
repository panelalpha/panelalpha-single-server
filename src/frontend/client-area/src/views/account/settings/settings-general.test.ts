import { describe, expect, it } from 'vitest'
import { dateFormatItems, GENERAL_FIELDS, generalChanged, languageItems, nameRules } from './settings-general'

const BASE = { name: 'Box', defaultLanguage: 'en', defaultDateFormat: 'DD.MM.YYYY' }
const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key)

describe('generalChanged', () => {
  it('is false for equal values and true when any field differs', () => {
    expect(generalChanged({ ...BASE }, BASE)).toBe(false)
    expect(generalChanged({ ...BASE, name: 'Renamed' }, BASE)).toBe(true)
    expect(generalChanged({ ...BASE, defaultLanguage: 'pl' }, BASE)).toBe(true)
    expect(generalChanged({ ...BASE, defaultDateFormat: 'YYYY-MM-DD' }, BASE)).toBe(true)
  })

  it('compares strictly: a trailing space is a change', () => {
    expect(generalChanged({ ...BASE, name: 'Box ' }, BASE)).toBe(true)
  })
})

describe('nameRules', () => {
  const [required, maxLength] = nameRules(t)

  it('requires a non-blank name', () => {
    expect(required('Box')).toBe(true)
    expect(required(' '.repeat(3))).toBe('settings.validation.required:{"field":"settings.name"}')
    expect(required('')).toContain('settings.validation.required')
    expect(required(null)).toContain('settings.validation.required')
  })

  it('allows at most 255 characters', () => {
    expect(maxLength('a'.repeat(255))).toBe(true)
    expect(maxLength('a'.repeat(256))).toBe('settings.validation.maxLength:{"length":255}')
    expect(maxLength('')).toBe(true)
  })
})

describe('languageItems', () => {
  it('uses the translation of languages.<code> and falls back to the code', () => {
    const translate = (key: string) => (key === 'languages.pl' ? 'Polski' : key)
    expect(languageItems(['pl', 'en'], translate)).toEqual([
      { title: 'Polski', value: 'pl' },
      { title: 'en', value: 'en' },
    ])
  })
})

describe('dateFormatItems', () => {
  it('prints today in each format with a fixed clock', () => {
    const now = new Date(2026, 9, 24, 12, 0, 0)
    expect(dateFormatItems(['YYYY-MM-DD', 'DD.MM.YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY'], now)).toEqual([
      { title: 'YYYY-MM-DD — 2026-10-24', value: 'YYYY-MM-DD' },
      { title: 'DD.MM.YYYY — 24.10.2026', value: 'DD.MM.YYYY' },
      { title: 'DD/MM/YYYY — 24/10/2026', value: 'DD/MM/YYYY' },
      { title: 'MM/DD/YYYY — 10/24/2026', value: 'MM/DD/YYYY' },
    ])
  })
})

describe('GENERAL_FIELDS', () => {
  it('lists the request keys of the form', () => {
    expect(GENERAL_FIELDS).toEqual(['name', 'default_language', 'default_date_format'])
  })
})
