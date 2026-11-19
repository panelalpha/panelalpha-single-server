import { describe, expect, it } from 'vitest'
import { formFieldDefaults } from './form-field'

describe('formFieldDefaults', () => {
  it('password sets the session password field attributes', () => {
    expect(formFieldDefaults('password', [])).toEqual({
      flat: true, hideDetails: 'auto', prependInnerIcon: '$lockoutline', singleLine: true, type: 'password', validateOn: 'blur', variant: 'outlined',
    })
  })

  it('email sets the session email field attributes without a type', () => {
    expect(formFieldDefaults('email', [])).toEqual({
      flat: true, hideDetails: 'auto', prependInnerIcon: '$email', singleLine: true, validateOn: 'blur', variant: 'outlined',
    })
  })

  it('select sets the settings select attributes', () => {
    expect(formFieldDefaults('select', [])).toEqual({ density: 'compact', singleLine: true, variant: 'outlined' })
  })

  it('skips a key the consumer passes in the kebab or the camel spelling', () => {
    const password = formFieldDefaults('password', ['hide-details', 'prependInnerIcon'])
    expect(password).not.toHaveProperty('hideDetails')
    expect(password).not.toHaveProperty('prependInnerIcon')
    expect(formFieldDefaults('select', ['density'])).not.toHaveProperty('density')
  })

  it('never sets a value to undefined', () => {
    for (const kind of ['password', 'email', 'select'] as const) {
      expect(Object.values(formFieldDefaults(kind, [])).every(value => value !== undefined)).toBe(true)
    }
  })
})
