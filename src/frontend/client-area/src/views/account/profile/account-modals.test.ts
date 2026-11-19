import { describe, expect, it } from 'vitest'
import { accountModalErrorMessage, type AccountModalInputField, changeEmailOptions, changePasswordOptions, responseStatus } from './account-modals'

const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key)

describe('changePasswordOptions', () => {
  it('has the legacy title, icon and buttons (primary, then Cancel as a text button)', () => {
    const options = changePasswordOptions(t, () => '')

    expect(options.title).toBe('heading.accountPage.modal.changePassword.title')
    expect(options.icon).toBe('$lock')
    expect(options.buttons).toEqual([
      { label: 'button.password.change', color: 'primary' },
      { label: 'button.cancel', color: 'normal', type: 'cancel' },
    ])
    expect(options.fields.map(field => field.name)).toEqual(['current_password', 'password', 'password_confirmation'])
  })

  it('has the set-password variant without the current password', () => {
    const options = changePasswordOptions(t, () => '', true)

    expect(options.title).toBe('heading.accountPage.modal.setPassword.title')
    expect(options.icon).toBe('$lock')
    expect(options.buttons).toEqual([
      { label: 'button.password.set', color: 'primary' },
      { label: 'button.cancel', color: 'normal', type: 'cancel' },
    ])
    expect(options.fields.map(field => field.name)).toEqual(['password', 'password_confirmation'])
    expect(options.fields[0]!.rules).toHaveLength(4)
  })

  it('asks for the current password without a length check, so any stored password is accepted', () => {
    const [current] = changePasswordOptions(t, () => '').fields

    expect(current!.rules).toHaveLength(1)
    expect(current!.rules[0]!('')).toContain('form.validation.required')
    expect(current!.rules[0]!('a'.repeat(30))).toBe(true)
    expect(current!.rules[0]!('a'.repeat(255))).toBe(true)
  })

  it('states the panel user password policy: 8 characters, both cases, a number and a symbol, up to 255', () => {
    const [, fresh] = changePasswordOptions(t, () => '').fields
    const [required, max, min, characters] = fresh!.rules

    expect(required!('')).toContain('form.validation.required')
    expect(max!('a'.repeat(30))).toBe(true)
    expect(max!('a'.repeat(255))).toBe(true)
    expect(max!('a'.repeat(256))).toContain('"length":255')
    expect(min!('Abc1!ef')).toContain('form.validation.minLength')
    expect(min!('Abc1!ef')).toContain('"length":8')
    expect(characters!('abcdefg1!')).toContain('form.validation.passwordCharacters')
    expect(characters!('ABCDEFG1!')).toContain('form.validation.passwordCharacters')
    expect(characters!('Abcdefgh!')).toContain('form.validation.passwordCharacters')
    expect(characters!('Abcdefgh1')).toContain('form.validation.passwordCharacters')
    expect(characters!('Abcdefg1!')).toBe(true)
  })

  it('compares the confirmation with the live new password, saying "Passwords do not match."', () => {
    let password = 'Secret12!'
    const confirmation = changePasswordOptions(t, () => password).fields[2]!
    const mismatch = confirmation.rules[1]!

    expect(mismatch('Secret12!')).toBe(true)
    expect(mismatch('other')).toBe('form.validation.passwordMismatch')

    password = 'changed'
    expect(mismatch('Secret12!')).toBe('form.validation.passwordMismatch')
    expect(changePasswordOptions(t, () => '').fields[2]!.rules[1]!('')).toBe('form.validation.passwordMismatch')
  })
})

describe('changeEmailOptions', () => {
  it('asks for the current password without a length check and reuses the kit email rules', () => {
    const rules = { emailRules: [() => true as const] }
    const options = changeEmailOptions(t, rules)
    const password = options.fields[0] as AccountModalInputField

    expect(options.icon).toBe('$edit')
    expect(password).toMatchObject({ name: 'password', type: 'password' })
    expect(password.rules).toHaveLength(1)
    expect(password.rules[0]!('')).toContain('form.validation.required')
    expect(password.rules[0]!('a'.repeat(30))).toBe(true)
    expect(options.fields[1]).toMatchObject({ name: 'email', type: 'email', rules: rules.emailRules })
    expect(options.buttons).toEqual([
      { label: 'button.emailAddress.change', color: 'primary' },
      { label: 'button.cancel', color: 'normal', type: 'cancel' },
    ])
  })

  it('asks for a password first when it was generated: one info field, Set password switches', () => {
    const rules = { emailRules: [() => true as const] }
    const options = changeEmailOptions(t, rules, true)

    expect(options.title).toBe('heading.accountPage.modal.changeEmail.title')
    expect(options.icon).toBe('$edit')
    expect(options.fields).toEqual([
      { type: 'info', description: 'heading.accountPage.modal.changeEmail.setPasswordFirst' },
    ])
    expect(options.buttons).toEqual([
      { label: 'button.password.set', color: 'primary', type: 'switch' },
      { label: 'button.cancel', color: 'normal', type: 'cancel' },
    ])
  })
})

describe('responseStatus', () => {
  it('reads the HTTP status of the response', () => {
    expect(responseStatus({ response: { status: 423 } })).toBe(423)
    expect(responseStatus({})).toBeUndefined()
  })
})

describe('accountModalErrorMessage', () => {
  it('prefers the first error of the field, then the message', () => {
    const error = (data: unknown) => ({ response: { data } })

    expect(accountModalErrorMessage(error({ errors: { password: ['Wrong password.'] }, message: 'Invalid.' }), 'password')).toBe('Wrong password.')
    expect(accountModalErrorMessage(error({ errors: { password: [] }, message: 'Invalid.' }), 'password')).toBe('Invalid.')
    expect(accountModalErrorMessage(error({ errors: { email: ['Taken.'] }, message: 'Invalid.' }), 'password')).toBe('Invalid.')
    expect(accountModalErrorMessage(error({ errors: { email: ['Taken.'] } }), 'email')).toBe('Taken.')
  })
})
